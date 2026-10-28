// Drives the live page in headless Chromium: music toggle, tour play/pause, and drag.
// Writes screenshots and prints a pass/fail line for each check.
// Usage: PLAYWRIGHT_PATH=<playwright> node tools/check-controls.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'previews'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`http://127.0.0.1:${port}/index.html?q=low`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__museumReady === true, null, { timeout: 120000 });

// Music toggle: on, then off.
await page.click('#music-toggle');
await page.waitForFunction(() => document.getElementById('music-toggle').textContent !== 'Music off', null, { timeout: 15000 });
const musicOnText = await page.textContent('#music-toggle');
check('music button turns on', musicOnText === 'Music on' || musicOnText === 'Music unavailable', musicOnText);
await page.click('#music-toggle');
await page.waitForFunction(() => document.getElementById('music-toggle').textContent === 'Music off', null, { timeout: 15000 });
check('music button turns off', true);

// Tour: start, check the panel opens, pause.
await page.click('#tour-toggle');
await page.waitForTimeout(800);
const tourPlaying = await page.getAttribute('#tour-toggle', 'aria-pressed');
const panelOpen = await page.evaluate(() => document.getElementById('plate-panel').classList.contains('is-open'));
check('tour starts and opens a plate', tourPlaying === 'true' && panelOpen, `aria-pressed=${tourPlaying}`);
await page.screenshot({ path: path.join(outDir, 'live-tour-start.png') });
await page.click('#tour-toggle');
const tourPaused = await page.getAttribute('#tour-toggle', 'aria-pressed');
check('tour pauses', tourPaused === 'false');

// Drag: a real mouse drag should close the plate and stop the tour.
await page.click('#tour-toggle');
await page.mouse.move(640, 400);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(640 - i * 20, 400);
await page.mouse.up();
await page.waitForTimeout(600);
const afterDragOpen = await page.evaluate(() => document.getElementById('plate-panel').classList.contains('is-open'));
const afterDragTour = await page.getAttribute('#tour-toggle', 'aria-pressed');
check('drag closes the plate and stops the tour', !afterDragOpen && afterDragTour === 'false');
await page.screenshot({ path: path.join(outDir, 'live-after-drag.png') });

check('no console errors', errors.length === 0, errors.length ? errors.join(' | ') : '');

await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

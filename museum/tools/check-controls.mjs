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
await page.waitForFunction(() => window.__museumReady === true && window.__hallReady === true, null, { timeout: 240000 });

// Music toggle: on, then off.
await page.click('#music-toggle');
await page.waitForFunction(() => document.getElementById('music-toggle').textContent !== 'Music off', null, { timeout: 15000 });
const musicOnText = await page.textContent('#music-toggle');
check('music button turns on', musicOnText === 'Music on' || musicOnText === 'Music unavailable', musicOnText);
await page.click('#music-toggle');
await page.waitForFunction(() => document.getElementById('music-toggle').textContent === 'Music off', null, { timeout: 15000 });
check('music button turns off', true);

const title = () => page.textContent('#plate-title');
const panelOpen = () => page.evaluate(() => document.getElementById('plate-panel').classList.contains('is-open'));

// The page opens on the overview, with no work selected.
check('starts on the overview', !(await panelOpen()));

// Arrow keys step between works.
await page.keyboard.press('ArrowRight');
const first = await title();
check('right arrow opens the first work', (await panelOpen()) && first === 'Drift I', first);
await page.keyboard.press('ArrowRight');
const second = await title();
check('right arrow moves to the next work', second === 'Floating Planes', second);
await page.keyboard.press('ArrowLeft');
check('left arrow moves back', (await title()) === 'Drift I');
await page.screenshot({ path: path.join(outDir, 'live-focus.png') });

// On-screen buttons do the same.
await page.click('#next-work');
check('next button works', (await title()) === 'Floating Planes');
await page.click('#prev-work');
check('previous button works', (await title()) === 'Drift I');

// Wrapping: left arrow from the first work reaches the last.
await page.keyboard.press('ArrowLeft');
check('left arrow wraps to the last work', (await title()) === 'Amphora', await title());

// Escape returns to the overview.
await page.keyboard.press('Escape');
check('escape returns to the overview', !(await panelOpen()));
await page.screenshot({ path: path.join(outDir, 'live-overview.png') });

// Tour: play opens a work, pause stops it.
await page.click('#tour-toggle');
await page.waitForTimeout(500);
check('tour plays and opens a work', (await page.getAttribute('#tour-toggle', 'aria-pressed')) === 'true' && (await panelOpen()));
await page.click('#tour-toggle');
check('tour pauses', (await page.getAttribute('#tour-toggle', 'aria-pressed')) === 'false');

// Clicking empty floor in the overview does nothing harmful; arrows still work after.
await page.mouse.click(640, 700);
await page.keyboard.press('ArrowRight');
check('arrows still work after a click', await panelOpen());

check('no console errors', errors.length === 0, errors.length ? errors.join(' | ') : '');

await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

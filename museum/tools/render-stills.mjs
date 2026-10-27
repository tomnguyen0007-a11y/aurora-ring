// Renders deterministic stills of the museum with headless Chromium.
// Usage: node tools/render-stills.mjs [outDir]   (run from museum/, needs playwright)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'previews'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const shots = [
  { name: 'room-t02', query: 't=2' },
  { name: 'room-t14', query: 't=14' },
  { name: 'focus-drift', query: 't=6&focus=drift' },
  { name: 'focus-fracture', query: 't=9&focus=fracture' },
  { name: 'focus-tide', query: 't=11&focus=tide' },
];

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

for (const shot of shots) {
  await page.goto(`http://127.0.0.1:${port}/index.html?${shot.query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__museumReady === true, null, { timeout: 120000 });
  await page.waitForTimeout(400); // let the panel transition finish
  await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
  console.log('wrote', shot.name);
}

await browser.close();
server.close();
console.log(errors.length ? `console issues:\n${errors.join('\n')}` : 'no console errors or warnings');

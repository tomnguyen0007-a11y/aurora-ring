// Opens a work at desktop and phone sizes and checks the layout by measuring it:
// nothing overlaps, nothing leaves the screen, and the page never scrolls sideways.
// Usage: PLAYWRIGHT_PATH=<playwright> node tools/check-layout.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'previews'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const sizes = [
  { name: 'desktop-1512', width: 1512, height: 900, dsf: 2, sheet: false },
  { name: 'laptop-1280', width: 1280, height: 720, dsf: 2, sheet: false },
  { name: 'phone-390', width: 390, height: 844, dsf: 3, sheet: true },
  { name: 'phone-360', width: 360, height: 640, dsf: 3, sheet: true },
];

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const size of sizes) {
  // Frozen stills render once and open the panel from ?focus, with no animation to wait for.
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dsf });
  await page.goto(`http://127.0.0.1:${port}/index.html?t=6&focus=fracture&q=low`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__museumReady === true, null, { timeout: 120000 });
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height }; };
    const panel = document.getElementById('plate-panel');
    return {
      panel: r('#plate-panel'), dock: r('.dock'), top: r('.topbar'), vw: innerWidth, vh: innerHeight,
      scrollW: document.documentElement.scrollWidth, panelFits: panel.scrollHeight <= panel.clientHeight + 1,
      title: document.getElementById('plate-title').textContent,
    };
  });
  const p = m.panel;
  const n = size.name;
  check(`${n}: panel is on screen`, p.left >= 0 && p.right <= m.vw && p.top >= 0 && p.bottom <= m.vh);
  check(`${n}: panel does not overlap the dock`, !overlap(p, m.dock));
  check(`${n}: panel does not overlap the title bar`, !overlap(p, m.top));
  check(`${n}: dock is on screen`, m.dock.left >= 0 && m.dock.right <= m.vw && m.dock.bottom <= m.vh);
  check(`${n}: page does not scroll sideways`, m.scrollW <= m.vw, `${m.scrollW} vs ${m.vw}`);
  if (size.sheet) check(`${n}: sheet is at most 44% of the screen`, p.h <= m.vh * 0.44 + 1, `${Math.round(p.h)} of ${m.vh}`);
  else check(`${n}: all panel text fits without scrolling`, m.panelFits);
  await page.screenshot({ path: path.join(outDir, `layout-${n}.png`) });
  await page.close();
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} checks failed` : '\nall layout checks passed');
process.exit(failed ? 1 : 0);

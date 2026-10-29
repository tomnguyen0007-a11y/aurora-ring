// Measures what the page asks of the graphics chip, on a simulated MacBook screen.
// Counts are hardware independent (draw calls, triangles, textures); timings are
// from software rendering, so only their proportions mean anything.
// Usage: PLAYWRIGHT_PATH=<playwright> node tools/diagnose.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// Counts do not depend on screen size, so sample on a small screen with small paintings
// (software rendering is slow) and work out the MacBook figures below.
const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/index.html?debug&q=low`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__museumReady === true && window.__hallReady === true, null, { timeout: 240000 });
await page.waitForFunction(() => window.__museumStats && window.__museumStats.frames >= 6, null, { timeout: 400000 });
await page.evaluate(() => { const s = window.__museumStats; for (const k of ['frames', 'scriptMs', 'renderMs', 'paintCalls', 'paintTris', 'sceneCalls', 'sceneTris', 'sculptMs']) s[k] = 0; });
await page.waitForFunction(() => window.__museumStats.frames >= 14, null, { timeout: 400000 });
const s = await page.evaluate(() => ({ ...window.__museumStats, dpr: window.devicePixelRatio, w: innerWidth, h: innerHeight }));
await browser.close();
server.close();

const n = s.frames;
// A 14-inch MacBook Pro: 1512x982 points at 2x, which the page caps at a pixel ratio of 1.5.
const cw = Math.round(1512 * 1.5);
const ch = Math.round(982 * 1.5);
const mainPx = cw * ch;
console.log(`frames sampled: ${n}   MacBook canvas: ${cw} x ${ch} = ${(mainPx / 1e6).toFixed(2)} million pixels per frame`);
console.log(`per frame: scene draw calls ${(s.sceneCalls / n).toFixed(0)}, triangles ${(s.sceneTris / n / 1000).toFixed(0)}k`);
console.log(`per frame: painting passes ${(s.paintCalls / n).toFixed(1)} draw calls (each is a full-screen shader over a 512x640 plate)`);
console.log(`gpu memory objects: ${s.memory.geometries} geometries, ${s.memory.textures} textures; shader programs: ${s.programs}`);
console.log(`script cost per frame: ${(s.scriptMs / n).toFixed(1)} ms (sculpture animation ${(s.sculptMs / n).toFixed(2)} ms)`);
console.log(`render submit per frame: ${(s.renderMs / n).toFixed(1)} ms (software renderer, proportions only)`);
// The floor mirror (off in this sample) renders the whole scene again every other frame.
const sceneTrisPerSec = (s.sceneTris / n) * 60 * 1.5;
console.log(`estimated at 60 fps: ${(mainPx * 60 / 1e6).toFixed(0)} million main pixels/s (before lighting cost), ~${(sceneTrisPerSec / 1e6).toFixed(1)} million triangles/s incl. mirror pass`);
console.log(`painting shaders at ~20 fps each: ${(11 * 512 * 640 * 20 / 1e6 / 3).toFixed(0)}-${(11 * 512 * 640 * 20 / 1e6).toFixed(0)} million heavy-shader pixels/s (noise-heavy)`);

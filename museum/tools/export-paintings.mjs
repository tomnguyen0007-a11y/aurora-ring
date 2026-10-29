// Renders every painting shader to a PNG (sRGB), so Blender can hang the real works.
// Usage: PLAYWRIGHT_PATH=<playwright> node tools/export-paintings.mjs <outDir> [seconds]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, '..', 'blender', 'paintings'));
const seconds = Number(process.argv[3] ?? 6);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const PAGE = `<!doctype html><meta charset=utf-8><canvas id=c></canvas>
<script type=importmap>{"imports":{"three":"/vendor/three/three.module.js"}}</script>
<script type=module>
import * as THREE from 'three';
import { paintingDefs } from '/js/paintings/index.js';
import { createPainting } from '/js/paintings/common.js';
const W = 1024, H = 1280;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bake = new THREE.Scene(), show = new THREE.Scene();
const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); bake.add(bakeQuad);
const showQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); show.add(showQuad);
window.ids = paintingDefs.map((d) => d.meta.id);
window.draw = (id, t) => {
  const def = paintingDefs.find((d) => d.meta.id === id);
  const plate = createPainting(def, renderer, [W, H]);
  plate.update(t, bakeQuad, camera, bake);
  showQuad.material = new THREE.MeshBasicMaterial({ map: plate.target.texture, toneMapped: false });
  renderer.setRenderTarget(null);
  renderer.render(show, camera);
  const url = canvas.toDataURL('image/png');
  plate.dispose();
  return url;
};
window.ready = true;
</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__paintings.html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE); return; }
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${port}/__paintings.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const ids = await page.evaluate(() => window.ids);
for (const id of ids) {
  const url = await page.evaluate(([i, t]) => window.draw(i, t), [id, seconds]);
  fs.writeFileSync(path.join(outDir, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', id);
}
await browser.close();
server.close();

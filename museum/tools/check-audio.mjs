// Renders the music offline in headless Chromium and checks it: not silent, not
// clipped, and no long dead gaps. Optionally writes a 16-bit mono WAV to listen to.
// Usage: PLAYWRIGHT_PATH=<playwright> node tools/check-audio.mjs [seconds] [out.wav]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seconds = Number(process.argv[2] ?? 48);
const wavPath = process.argv[3];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/index.html?t=1&q=low`, { waitUntil: 'load' });
const result = await page.evaluate(async (secs) => {
  const { renderOffline } = await import('/js/audio.js');
  const buffer = await renderOffline(secs);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let peak = 0;
  let sum = 0;
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    const m = (left[i] + right[i]) / 2;
    mono[i] = m;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    sum += m * m;
  }
  // RMS per second, to find dead gaps and see the loudness curve.
  const per = [];
  const sr = buffer.sampleRate;
  for (let s = 0; s < secs; s++) {
    let e = 0;
    for (let i = s * sr; i < Math.min((s + 1) * sr, mono.length); i++) e += mono[i] * mono[i];
    per.push(Math.sqrt(e / sr));
  }
  // 22 kHz mono, 16-bit, for an optional listening sample.
  const step = 2;
  const pcm = new Int16Array(Math.floor(mono.length / step));
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-1, Math.min(1, mono[i * step])) * 32767;
  return { peak, rms: Math.sqrt(sum / mono.length), per, sr: sr / step, pcm: Array.from(pcm) };
}, seconds);
await browser.close();
server.close();

const quietSeconds = result.per.filter((v) => v < 0.003).length;
const checks = [
  ['not clipped (peak below 0.95)', result.peak < 0.95, `peak ${result.peak.toFixed(3)}`],
  ['not silent (overall RMS above 0.01)', result.rms > 0.01, `rms ${result.rms.toFixed(4)}`],
  ['no dead gaps (every second audible)', quietSeconds === 0, `${quietSeconds} quiet seconds`],
  ['not harshly loud (RMS below 0.2)', result.rms < 0.2, `rms ${result.rms.toFixed(4)}`],
];
checks.forEach(([name, ok, detail]) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`));
console.log(`loudness per second (RMS x1000): ${result.per.slice(0, 24).map((v) => Math.round(v * 1000)).join(' ')} ...`);

if (wavPath) {
  const data = Buffer.alloc(44 + result.pcm.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + result.pcm.length * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(result.sr, 24); data.writeUInt32LE(result.sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(result.pcm.length * 2, 40);
  result.pcm.forEach((v, i) => data.writeInt16LE(v, 44 + i * 2));
  fs.writeFileSync(wavPath, data);
  console.log(`wrote ${wavPath}`);
}
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);

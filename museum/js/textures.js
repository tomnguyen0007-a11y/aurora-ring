// Procedural textures. Everything is generated at load, so there are no image
// files to license and the result is identical on every machine.
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable fractal value noise in [0, 1]. Octave frequencies are integers so
// the lattice wraps and the texture repeats without seams.
function fbmField(size, seed, octaves, baseFreq) {
  const rand = mulberry32(seed);
  const field = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = baseFreq << o;
    const lattice = new Float32Array(f * f);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * f;
      const y0 = Math.floor(gy);
      const ty = gy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % f) * f;
      const r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * f;
        const x0 = Math.floor(gx);
        const tx = gx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % f;
        const c1 = (x0 + 1) % f;
        const a = lattice[r0 + c0];
        const b = lattice[r0 + c1];
        const c = lattice[r1 + c0];
        const d = lattice[r1 + c1];
        field[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < field.length; i++) field[i] /= total;
  return field;
}

function canvasTexture(size, paint, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  paint(image.data);
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Polished concrete: blotchy colour, saw-cut joints at the tile edge, and a
// roughness map so some patches reflect more sharply than others.
export function concreteMaps(size = 1024) {
  const blotch = fbmField(size, 11, 4, 3);
  const grain = fbmField(size, 23, 5, 16);
  const color = canvasTexture(size, (d) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const v = 0.82 + 0.3 * blotch[i] + 0.1 * (grain[i] - 0.5);
        const joint = x < 3 || y < 3 ? 0.55 : 1;
        const k = v * joint;
        d[i * 4] = 186 * k;
        d[i * 4 + 1] = 182 * k;
        d[i * 4 + 2] = 174 * k;
        d[i * 4 + 3] = 255;
      }
    }
  }, true);
  const rough = canvasTexture(size, (d) => {
    for (let i = 0; i < size * size; i++) {
      const v = Math.min(1, Math.max(0, 0.25 + 0.55 * blotch[i] + 0.2 * grain[i]));
      const g = v * 255;
      d[i * 4] = g;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = g;
      d[i * 4 + 3] = 255;
    }
  }, false);
  return { color, rough };
}

// Fine plaster relief for the walls.
export function plasterBump(size = 512) {
  const field = fbmField(size, 5, 4, 8);
  return canvasTexture(size, (d) => {
    for (let i = 0; i < size * size; i++) {
      const g = field[i] * 255;
      d[i * 4] = g;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = g;
      d[i * 4 + 3] = 255;
    }
  }, false);
}

// Soft daylight gradient seen through the window wall.
export function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#c4dcf2');
  g.addColorStop(0.55, '#e6f0f8');
  g.addColorStop(1, '#fff0d4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

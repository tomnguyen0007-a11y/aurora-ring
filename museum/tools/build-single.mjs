// Bundles the museum into one self-contained HTML file that opens by double-click
// (no server needed). Usage, from museum/:  npm install && npm run build
// Output: dist/afterimage-hall.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH ?? 'esbuild');

const result = await esbuild.build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  write: false,
  alias: {
    three: path.join(root, 'vendor/three/three.module.js'),
    'three/addons': path.join(root, 'vendor/three/examples/jsm'),
  },
  legalComments: 'none',
});

const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// The baked hall (geometry, lighting, sky, reflections) rides inside the page as data URIs,
// so the single file still works offline and by double-click.
const MIME = { '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };
const assetDir = path.join(root, 'assets/hall');
const assets = {};
for (const name of fs.readdirSync(assetDir)) {
  const mime = MIME[path.extname(name)];
  if (mime) assets[name] = `data:${mime};base64,${fs.readFileSync(path.join(assetDir, name)).toString('base64')}`;
}
const assetScript = `window.__ASSETS=${JSON.stringify(assets)};`;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module" src="\.\/js\/main\.js"><\/script>/, () => `<script>${assetScript}</script>\n<script>${script}</script>`);
if (html.includes('importmap') || html.includes('js/main.js')) throw new Error('bundle step left a module reference in the HTML');

// Artifact variant: the host wraps the page in its own document skeleton, so keep
// only the head's title, meta and style, and the body's content.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = `${head}\n${body}`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/afterimage-hall.artifact.html'), artifact);
const out = path.join(root, 'dist/afterimage-hall.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${(html.length / 1048576).toFixed(2)} MB)`);

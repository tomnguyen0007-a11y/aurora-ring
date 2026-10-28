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
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module" src="\.\/js\/main\.js"><\/script>/, () => `<script>${script}</script>`);
if (html.includes('importmap') || html.includes('js/main.js')) throw new Error('bundle step left a module reference in the HTML');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/afterimage-hall.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${(html.length / 1048576).toFixed(2)} MB)`);

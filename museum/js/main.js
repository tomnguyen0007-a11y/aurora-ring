import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintingDefs } from './paintings/index.js';
import { createPainting } from './paintings/common.js';

// ?t=<seconds> freezes the clock for deterministic stills and disables idle
// drift and hover. ?focus=<id> opens one plate. tools/render-stills.mjs uses both.
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? parseFloat(params.get('t')) : null;
const focusId = params.get('focus');
const isFrozen = frozenT !== null;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeScale = reduceMotion ? 0.25 : 1;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

// Offscreen quad that draws each painting shader into its plate.
const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

// ---- Room -------------------------------------------------------------
const ROOM = { w: 14, h: 4.6, d: 12 };
const WALL_Z = -ROOM.d / 2;

const room = new THREE.Mesh(
  new THREE.BoxGeometry(ROOM.w, ROOM.h, ROOM.d),
  new THREE.MeshStandardMaterial({ color: '#ebe6dd', roughness: 0.95, side: THREE.BackSide }),
);
room.position.y = ROOM.h / 2;
room.receiveShadow = true;
scene.add(room);

// Polished floor: clear-coated, so the paintings and sculpture reflect in it.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM.w, ROOM.d),
  new THREE.MeshPhysicalMaterial({ color: '#cfc8bd', roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.002; // lifted off the room's bottom face to avoid z-fighting
floor.receiveShadow = true;
scene.add(floor);

// ---- Frames and plates -------------------------------------------------
const frameMat = new THREE.MeshPhysicalMaterial({ color: '#1b1714', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const FRAME_DEPTH = 0.08;
const FRAME_BORDER = 0.07;
const PLATE_Y = 1.75;

// Triptych on the back wall. Index order is left to right.
const SLOT_X = [-2.7, 0, 2.7];
const slotFor = { drift: 0, fracture: 1, tide: 2 };

const plates = paintingDefs.map((def) => {
  const plate = createPainting(def, renderer);
  const [w, h] = plate.size;
  const x = SLOT_X[slotFor[def.meta.id]];
  const center = new THREE.Vector3(x, PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02);

  const group = new THREE.Group();
  group.position.copy(center);

  plate.canvas.position.z = FRAME_DEPTH / 2 + 0.002;
  group.add(plate.canvas);

  const bars = [
    [w + FRAME_BORDER * 2, FRAME_BORDER, 0, h / 2 + FRAME_BORDER / 2],
    [w + FRAME_BORDER * 2, FRAME_BORDER, 0, -h / 2 - FRAME_BORDER / 2],
    [FRAME_BORDER, h, -w / 2 - FRAME_BORDER / 2, 0],
    [FRAME_BORDER, h, w / 2 + FRAME_BORDER / 2, 0],
  ];
  bars.forEach(([bw, bh, bx, by]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, FRAME_DEPTH), frameMat);
    bar.position.set(bx, by, 0);
    bar.castShadow = true;
    group.add(bar);
  });

  // Each plate gets its own spot, hung above and aimed at its centre. Hover raises it.
  const spot = new THREE.SpotLight('#fff1dc', 45, 9, 0.36, 0.75, 1.6);
  spot.position.set(x, ROOM.h - 0.2, WALL_Z + 2.6);
  spot.target.position.copy(center);
  scene.add(spot, spot.target);

  scene.add(group);
  return { ...plate, group, center, spot, baseIntensity: 45, hover: 0, def };
});

// ---- Plinth and mirror sculpture ---------------------------------------
const PLINTH_Z = 1.3;
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(0.62, 0.7, 0.8, 96),
  new THREE.MeshPhysicalMaterial({ color: '#f1ede5', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
);
plinth.position.set(0, 0.4, PLINTH_Z);
plinth.castShadow = true;
plinth.receiveShadow = true;
scene.add(plinth);

const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 128, 96),
  new THREE.MeshPhysicalMaterial({ color: '#d9c7a6', metalness: 1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }),
);
orb.position.set(0, 1.15, PLINTH_Z);
orb.castShadow = true;
scene.add(orb);

const orbSpot = new THREE.SpotLight('#ffe8c8', 14, 6, 0.6, 0.9, 1.4);
orbSpot.position.set(1.2, 3.2, PLINTH_Z + 1.2);
orbSpot.target = orb;
scene.add(orbSpot);

// Room light: a soft key and a hemisphere fill.
const key = new THREE.DirectionalLight('#fff4e4', 0.9);
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(key);
scene.add(new THREE.HemisphereLight('#fbf6ee', '#8c8277', 0.35));

// ---- Plate panel --------------------------------------------------------
const panel = document.getElementById('plate-panel');
const panelEls = {
  series: document.getElementById('plate-series'),
  title: document.getElementById('plate-title'),
  note: document.getElementById('plate-note'),
  medium: document.getElementById('plate-medium'),
  year: document.getElementById('plate-year'),
};
let activePlate = null;

function openPlate(plate) {
  activePlate = plate;
  const m = plate.def.meta;
  panelEls.series.textContent = m.series;
  panelEls.title.textContent = m.title;
  panelEls.note.textContent = m.note;
  panelEls.medium.textContent = m.medium;
  panelEls.year.textContent = m.year;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
}

function closePlate() {
  activePlate = null;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
}

document.getElementById('plate-close').addEventListener('click', closePlate);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlate(); });

// ---- Camera and pointer -------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerParallax = new THREE.Vector2();
let hoverPlate = null;

function pickPlate(clientX, clientY) {
  pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects(plates.map((p) => p.canvas), false)[0];
  return hit ? plates.find((p) => p.canvas === hit.object) : null;
}

if (!isFrozen) {
  window.addEventListener('pointermove', (e) => {
    pointerParallax.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    hoverPlate = pickPlate(e.clientX, e.clientY);
    canvas.style.cursor = hoverPlate ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', (e) => {
    const hit = pickPlate(e.clientX, e.clientY);
    if (hit) openPlate(hit);
    else if (activePlate) closePlate();
  });
}

const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const camNow = new THREE.Vector3();
const lookNow = new THREE.Vector3();

function setCameraGoal(t) {
  if (activePlate) {
    // Stand two and a half metres in front of the plate, eye level with its centre.
    camGoal.copy(activePlate.center).add(new THREE.Vector3(0, 0, 4.4));
    camGoal.y = PLATE_Y;
    lookGoal.copy(activePlate.center);
    return;
  }
  // Calm, looping dolly with a little pointer parallax.
  const amp = reduceMotion ? 0.2 : 1;
  const sway = Math.sin(t * 0.09) * 0.5 * amp;
  const dolly = (Math.sin(t * 0.05) + 1) * 0.5 * 0.5 * amp;
  const aspectFix = Math.max(0, 1.1 - camera.aspect) * 3.0;
  camGoal.set(
    sway + pointerParallax.x * 0.2,
    1.6 + Math.sin(t * 0.13) * 0.04 + pointerParallax.y * 0.06,
    4.6 - dolly + aspectFix,
  );
  lookGoal.set(0, 1.45, WALL_Z);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Frame loop --------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = isFrozen ? frozenT : (elapsed += dt * timeScale);
  const ease = isFrozen ? 1 : 1 - Math.exp(-dt * 3.2);

  setCameraGoal(t);
  camNow.lerp(camGoal, ease);
  lookNow.lerp(lookGoal, ease);
  camera.position.copy(camNow);
  camera.lookAt(lookNow);

  plates.forEach((p) => {
    const hoverGoal = !isFrozen && (p === hoverPlate || p === activePlate) ? 1 : 0;
    p.hover += (hoverGoal - p.hover) * (isFrozen ? 1 : 1 - Math.exp(-dt * 6));
    p.spot.intensity = p.baseIntensity * (1 + 0.5 * p.hover);
    p.update(t, quad, quadCamera, quadScene);
  });

  // The sculpture slowly turns, so its reflections move across the room.
  orb.rotation.y = t * 0.12;
  orb.rotation.x = Math.sin(t * 0.2) * 0.08;

  renderer.render(scene, camera);
  if (!isFrozen) requestAnimationFrame(frame);
}

// Initial camera pose, so the first frame is already in place.
camNow.set(0, 1.6, 4.6);
lookNow.set(0, 1.45, WALL_Z);

if (focusId) {
  const target = plates.find((p) => p.def.meta.id === focusId);
  if (target) openPlate(target);
}

// Render the first frame. Frozen stills ease the camera in a single step,
// so one pass is enough.
if (isFrozen) {
  frame();
  window.__museumReady = true;
} else {
  frame();
  window.__museumReady = true;
  requestAnimationFrame(frame);
}

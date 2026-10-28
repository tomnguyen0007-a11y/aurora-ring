import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintingDefs } from './paintings/index.js';
import { createPainting } from './paintings/common.js';
import { createAmbient } from './audio.js';

// ?t=<seconds> freezes the clock for deterministic stills and disables idle
// drift, hover, drag and the tour. ?focus=<id> opens one plate on load.
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? parseFloat(params.get('t')) : null;
const focusId = params.get('focus');
// ?q=low renders paintings at a quarter of their normal resolution. Used by tests and slow machines.
const PAINTING_RES = params.get('q') === 'low' ? [256, 320] : [1024, 1280];
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
const FRAME_DEPTH = 0.08;
const FRAME_BORDER = 0.07;
const PLATE_Y = 1.75;

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

// ---- Placements ---------------------------------------------------------
// Four plates on the back wall, one on each side wall. Each placement gives the
// plate centre and the direction the plate faces into the room.
const SIDE_X = ROOM.w / 2 - FRAME_DEPTH / 2 - 0.02;
const BACK_X = [-4.35, -1.45, 1.45, 4.35];
const placements = {
  lattice: { center: new THREE.Vector3(-SIDE_X, PLATE_Y, -1.6), normal: new THREE.Vector3(1, 0, 0) },
  drift: { center: new THREE.Vector3(BACK_X[0], PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) },
  fracture: { center: new THREE.Vector3(BACK_X[1], PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) },
  tide: { center: new THREE.Vector3(BACK_X[2], PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) },
  bloom: { center: new THREE.Vector3(BACK_X[3], PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) },
  signal: { center: new THREE.Vector3(SIDE_X, PLATE_Y, -1.6), normal: new THREE.Vector3(-1, 0, 0) },
};

// ---- Frames and plates -------------------------------------------------
const frameMat = new THREE.MeshPhysicalMaterial({ color: '#1b1714', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });

const plates = paintingDefs.map((def) => {
  const plate = createPainting(def, renderer, PAINTING_RES);
  const [w, h] = plate.size;
  const { center, normal } = placements[def.meta.id];

  const group = new THREE.Group();
  group.position.copy(center);
  group.rotation.y = Math.atan2(normal.x, normal.z);

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

  // Each plate has its own spot, hung in front of it and aimed at its centre.
  // Hover raises it.
  const spot = new THREE.SpotLight('#fff1dc', 45, 9, 0.36, 0.75, 1.6);
  spot.position.set(center.x + normal.x * 2.6, ROOM.h - 0.2, center.z + normal.z * 2.6);
  spot.target.position.copy(center);
  scene.add(spot, spot.target);

  scene.add(group);
  return { ...plate, group, center, normal, spot, baseIntensity: 45, hover: 0, def };
});

const byId = Object.fromEntries(plates.map((p) => [p.def.meta.id, p]));
// Walking order: left wall, back wall left to right, right wall.
const TOUR_ORDER = ['lattice', 'drift', 'fracture', 'tide', 'bloom', 'signal'].map((id) => byId[id]);
const TOUR_HOLD = 7; // seconds on each plate

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
const tourButton = document.getElementById('tour-toggle');
const musicButton = document.getElementById('music-toggle');
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

document.getElementById('plate-close').addEventListener('click', () => { stopTour(); closePlate(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopTour(); closePlate(); } });

// ---- Guided tour (play / pause) -----------------------------------------
const tour = { playing: false, index: 0, timer: 0 };

function setTourLabel() {
  tourButton.textContent = tour.playing ? 'Pause tour' : 'Start tour';
  tourButton.setAttribute('aria-pressed', String(tour.playing));
}

function startTour() {
  tour.playing = true;
  tour.timer = 0;
  openPlate(TOUR_ORDER[tour.index]);
  setTourLabel();
}

function stopTour() {
  tour.playing = false;
  setTourLabel();
}

tourButton.addEventListener('click', () => {
  if (tour.playing) {
    stopTour();
  } else {
    if (activePlate) tour.index = TOUR_ORDER.indexOf(activePlate);
    startTour();
  }
});

// ---- Music toggle --------------------------------------------------------
const ambient = createAmbient();
let musicOn = false;

function setMusicLabel(text) {
  musicButton.textContent = text;
  musicButton.setAttribute('aria-pressed', String(musicOn));
}

musicButton.addEventListener('click', async () => {
  try {
    if (musicOn) {
      ambient.off();
      musicOn = false;
      setMusicLabel('Music off');
    } else {
      await ambient.on();
      musicOn = true;
      setMusicLabel('Music on');
    }
  } catch (err) {
    musicOn = false;
    musicButton.disabled = true;
    setMusicLabel('Music unavailable');
  }
});

// ---- Camera, pointer, drag -----------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerParallax = new THREE.Vector2();
const DRAG_THRESHOLD = 6; // px before a press counts as a drag, not a click
let hoverPlate = null;
let drag = null;
let yaw = 0;
let pitch = 0;

function pickPlate(clientX, clientY) {
  pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects(plates.map((p) => p.canvas), false)[0];
  return hit ? plates.find((p) => p.canvas === hit.object) : null;
}

if (!isFrozen) {
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, startX: e.clientX, startY: e.clientY };
  });

  window.addEventListener('pointermove', (e) => {
    pointerParallax.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > DRAG_THRESHOLD) {
        // Dragging takes over from the tour and closes any open plate.
        stopTour();
        if (activePlate) closePlate();
        yaw = THREE.MathUtils.clamp(yaw - dx * 0.004, -1.0, 1.0);
        pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -0.3, 0.3);
        canvas.style.cursor = 'grabbing';
      }
      return;
    }
    hoverPlate = pickPlate(e.clientX, e.clientY);
    canvas.style.cursor = hoverPlate ? 'pointer' : 'grab';
  });

  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasClick = drag.moved <= DRAG_THRESHOLD;
    drag = null;
    canvas.style.cursor = 'grab';
    if (!wasClick) return;
    const hit = pickPlate(e.clientX, e.clientY);
    if (hit) {
      stopTour();
      openPlate(hit);
    } else if (activePlate) {
      stopTour();
      closePlate();
    }
  });
}

const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const camNow = new THREE.Vector3();
const lookNow = new THREE.Vector3();
const lookDir = new THREE.Vector3();

function setCameraGoal(t) {
  if (activePlate) {
    // Stand 4.4 m in front of the plate, eye level with its centre.
    const { center, normal } = activePlate;
    camGoal.copy(center).addScaledVector(normal, 4.4);
    camGoal.y = PLATE_Y;
    lookGoal.copy(center);
    return;
  }
  // Calm, looping dolly with a little pointer parallax and the drag offset.
  const amp = reduceMotion ? 0.2 : 1;
  const sway = Math.sin(t * 0.09) * 0.5 * amp;
  const dolly = (Math.sin(t * 0.05) + 1) * 0.5 * 0.5 * amp;
  const aspectFix = Math.max(0, 1.1 - camera.aspect) * 3.0;
  camGoal.set(
    sway + pointerParallax.x * 0.2,
    1.6 + Math.sin(t * 0.13) * 0.04 + pointerParallax.y * 0.06,
    4.6 - dolly + aspectFix,
  );
  lookDir.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch) - 0.14,
    -Math.cos(yaw) * Math.cos(pitch),
  ).normalize();
  lookGoal.copy(camGoal).addScaledVector(lookDir, 10);
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

  if (tour.playing) {
    tour.timer += dt;
    if (tour.timer >= TOUR_HOLD) {
      tour.timer = 0;
      tour.index = (tour.index + 1) % TOUR_ORDER.length;
      openPlate(TOUR_ORDER[tour.index]);
    }
  }

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
canvas.style.cursor = 'grab';
setTourLabel();
setMusicLabel('Music off');

if (focusId && byId[focusId]) openPlate(byId[focusId]);

if (isFrozen) {
  frame();
  window.__museumReady = true;
} else {
  frame();
  window.__museumReady = true;
  requestAnimationFrame(frame);
}

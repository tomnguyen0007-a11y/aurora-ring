import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintingDefs } from './paintings/index.js';
import { createPainting } from './paintings/common.js';
import { createSculptures } from './sculptures.js';
import { buildRoom, createTrackSpot, ROOM, HEAD_Y } from './room.js';
import { createAmbient } from './audio.js';

// URL options:
//   ?t=<seconds>   freeze the clock for deterministic stills (no hover, drag or tour)
//   ?focus=<id>    open one work on load
//   ?yaw=<radians> turn the view, for stills of the side walls
//   ?q=low|mid     lower painting resolution; low also drops the floor mirror
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? parseFloat(params.get('t')) : null;
const focusId = params.get('focus');
const quality = params.get('q');
const isFrozen = frozenT !== null;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeScale = reduceMotion ? 0.25 : 1;
const PAINTING_RES = quality === 'low' ? [256, 320] : quality === 'mid' ? [512, 640] : [768, 960];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight('#fbf6ee', '#8c8277', 0.4));

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);

// Offscreen quad that draws each painting shader into its plate.
const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

// ---- Room -------------------------------------------------------------
buildRoom(scene, renderer, { reflections: quality !== 'low' });

const WALL_Z = -ROOM.d / 2;
const LEFT_X = -ROOM.w / 2;
const FRAME_DEPTH = 0.08;
const FRAME_BORDER = 0.07;
const PLATE_Y = 1.75;
const frameMat = new THREE.MeshPhysicalMaterial({ color: '#1b1714', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });

const back = (x) => ({ center: new THREE.Vector3(x, PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) });
const left = (z) => ({ center: new THREE.Vector3(LEFT_X + FRAME_DEPTH / 2 + 0.02, PLATE_Y, z), normal: new THREE.Vector3(1, 0, 0) });
const slots = {
  drift: back(-6.4), fracture: back(-3.2), tide: back(0), bloom: back(3.2), moire: back(6.4),
  lattice: left(-4.8), signal: left(-1.6), strata: left(1.6), halftone: left(4.8),
};

// Every work (painting or sculpture) shares one shape: where it is, where to
// stand to see it, what to click, and the light that hangs over it.
const works = [];

paintingDefs.forEach((def) => {
  const plate = createPainting(def, renderer, PAINTING_RES);
  const [w, h] = plate.size;
  const { center, normal } = slots[def.meta.id];

  const group = new THREE.Group();
  group.position.copy(center);
  group.rotation.y = Math.atan2(normal.x, normal.z);
  plate.canvas.position.z = FRAME_DEPTH / 2 + 0.002;
  group.add(plate.canvas);

  [
    [w + FRAME_BORDER * 2, FRAME_BORDER, 0, h / 2 + FRAME_BORDER / 2],
    [w + FRAME_BORDER * 2, FRAME_BORDER, 0, -h / 2 - FRAME_BORDER / 2],
    [FRAME_BORDER, h, -w / 2 - FRAME_BORDER / 2, 0],
    [FRAME_BORDER, h, w / 2 + FRAME_BORDER / 2, 0],
  ].forEach(([bw, bh, bx, by]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, FRAME_DEPTH), frameMat);
    bar.position.set(bx, by, 0);
    bar.castShadow = true;
    group.add(bar);
  });
  scene.add(group);

  const head = center.clone().addScaledVector(normal, 2.2);
  head.y = HEAD_Y;
  const spot = createTrackSpot(scene, { position: head, target: center, intensity: 90, angle: 0.42 });

  const work = {
    kind: 'painting', meta: def.meta, center, normal, dist: 4.4, eyeY: PLATE_Y,
    pick: [plate.canvas], plate, light: spot.light, baseIntensity: spot.baseIntensity, hover: 0,
  };
  plate.canvas.userData.work = work;
  works.push(work);
});

createSculptures().forEach((s) => {
  scene.add(s.group);
  const head = new THREE.Vector3(s.center.x + 1.3, HEAD_Y, s.center.z + 1.7);
  const spot = createTrackSpot(scene, { position: head, target: s.center, intensity: 120, angle: 0.3, castShadow: true, yokeTo: ROOM.h });
  const work = {
    kind: 'sculpture', meta: s.meta, center: s.center, normal: s.normal, dist: s.dist, eyeY: 1.55,
    pick: [s.group], sculpture: s, light: spot.light, baseIntensity: spot.baseIntensity, hover: 0,
  };
  s.group.userData.work = work;
  works.push(work);
});

const byId = Object.fromEntries(works.map((w) => [w.meta.id, w]));
// Walking order: back wall left to right, the window side, then the left wall.
const TOUR = ['drift', 'fracture', 'tide', 'bloom', 'moire', 'cloud', 'knot', 'halftone', 'strata', 'signal', 'lattice', 'column'].map((id) => byId[id]);
const TOUR_HOLD = 7; // seconds on each work
const pickables = works.flatMap((w) => w.pick);

// ---- Details panel ------------------------------------------------------
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
let active = null;

function openWork(work) {
  active = work;
  const m = work.meta;
  panelEls.series.textContent = m.series;
  panelEls.title.textContent = m.title;
  panelEls.note.textContent = m.note;
  panelEls.medium.textContent = m.medium;
  panelEls.year.textContent = m.year;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
}

function closeWork() {
  active = null;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
}

document.getElementById('plate-close').addEventListener('click', () => { stopTour(); closeWork(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopTour(); closeWork(); } });

// ---- Guided tour (play / pause) -------------------------------------------
const tour = { playing: false, index: 0, timer: 0 };

function setTourLabel() {
  tourButton.textContent = tour.playing ? 'Pause tour' : 'Start tour';
  tourButton.setAttribute('aria-pressed', String(tour.playing));
}
function startTour() {
  tour.playing = true;
  tour.timer = 0;
  openWork(TOUR[tour.index]);
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
    if (active && TOUR.includes(active)) tour.index = TOUR.indexOf(active);
    startTour();
  }
});

// ---- Music toggle ----------------------------------------------------------
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

// ---- Camera, pointer, drag ---------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerParallax = new THREE.Vector2();
const DRAG_THRESHOLD = 6; // px before a press counts as a drag, not a click
let hover = null;
let drag = null;
let yaw = isFrozen ? parseFloat(params.get('yaw') || '0') : 0;
let pitch = 0;

function pickWork(clientX, clientY) {
  pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.work) o = o.parent;
  return o ? o.userData.work : null;
}

if (!isFrozen) {
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
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
        // Dragging takes over from the tour and closes any open work.
        stopTour();
        if (active) closeWork();
        yaw = THREE.MathUtils.clamp(yaw - dx * 0.004, -1.5, 1.5);
        pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -0.3, 0.3);
        canvas.style.cursor = 'grabbing';
      }
      return;
    }
    hover = pickWork(e.clientX, e.clientY);
    canvas.style.cursor = hover ? 'pointer' : 'grab';
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasClick = drag.moved <= DRAG_THRESHOLD;
    drag = null;
    canvas.style.cursor = 'grab';
    if (!wasClick) return;
    const hit = pickWork(e.clientX, e.clientY);
    if (hit) {
      stopTour();
      openWork(hit);
    } else if (active) {
      stopTour();
      closeWork();
    }
  });
}

const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const camNow = new THREE.Vector3();
const lookNow = new THREE.Vector3();
const lookDir = new THREE.Vector3();
const stand = new THREE.Vector3();

function setCameraGoal(t) {
  if (active) {
    stand.copy(active.center).addScaledVector(active.normal, active.dist);
    stand.y = active.eyeY;
    camGoal.copy(stand);
    lookGoal.copy(active.center);
    return;
  }
  // Calm, looping dolly with a little pointer parallax and the drag offset.
  const amp = reduceMotion ? 0.2 : 1;
  const sway = Math.sin(t * 0.09) * 0.6 * amp;
  const dolly = (Math.sin(t * 0.05) + 1) * 0.5 * 0.6 * amp;
  const aspectFix = Math.max(0, 1.1 - camera.aspect) * 4.0;
  camGoal.set(
    sway + pointerParallax.x * 0.2,
    1.6 + Math.sin(t * 0.13) * 0.04 + pointerParallax.y * 0.06,
    6.1 - dolly + aspectFix,
  );
  lookDir.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch) - 0.1,
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

// ---- Frame loop --------------------------------------------------------------
const clock = new THREE.Clock();
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = isFrozen ? frozenT : (elapsed += dt * timeScale);
  const ease = isFrozen ? 1 : 1 - Math.exp(-dt * 3.2);

  if (tour.playing) {
    tour.timer += dt;
    if (tour.timer >= TOUR_HOLD) {
      tour.timer = 0;
      tour.index = (tour.index + 1) % TOUR.length;
      openWork(TOUR[tour.index]);
    }
  }

  setCameraGoal(t);
  camNow.lerp(camGoal, ease);
  lookNow.lerp(lookGoal, ease);
  camera.position.copy(camNow);
  camera.lookAt(lookNow);
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

  works.forEach((w) => {
    const goal = !isFrozen && (w === hover || w === active) ? 1 : 0;
    w.hover += (goal - w.hover) * (isFrozen ? 1 : 1 - Math.exp(-dt * 6));
    w.light.intensity = w.baseIntensity * (1 + 0.5 * w.hover);
    // Paintings off screen keep their last frame, which saves most of the shader work.
    if (w.plate && (isFrozen || frustum.intersectsObject(w.plate.canvas))) {
      w.plate.update(t, quad, quadCamera, quadScene);
    }
    if (w.sculpture) w.sculpture.update(t);
  });

  renderer.render(scene, camera);
  if (!isFrozen) requestAnimationFrame(frame);
}

// Initial camera pose, so the first frame is already in place.
camNow.set(0, 1.6, 6.1);
lookNow.set(0, 1.45, WALL_Z);
canvas.style.cursor = 'grab';
setTourLabel();
setMusicLabel('Music off');

if (focusId && byId[focusId]) openWork(byId[focusId]);

frame();
window.__museumReady = true;
if (!isFrozen) requestAnimationFrame(frame);

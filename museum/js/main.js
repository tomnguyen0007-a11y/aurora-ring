import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintingDefs } from './paintings/index.js';
import { createPainting } from './paintings/common.js';
import { createSculptures } from './sculptures.js';
import { buildRoom, createFixture, wallPool, floorPool, ROOM, HEAD_Y } from './room.js';
import { createAmbient } from './audio.js';

// URL options:
//   ?t=<seconds>  freeze the clock for deterministic stills (no hover, tour or adaptation)
//   ?focus=<id>   open one work on load
//   ?q=low|high   painting resolution: low 256x320 and no floor mirror, high 1024x1280
const params = new URLSearchParams(location.search);
const frozenT = params.has('t') ? parseFloat(params.get('t')) : null;
const focusId = params.get('focus');
const quality = params.get('q');
const isFrozen = frozenT !== null;
const debug = params.has('debug');
const stats = { frames: 0, scriptMs: 0, renderMs: 0, paintCalls: 0, paintTris: 0, sceneCalls: 0, sceneTris: 0, sculptMs: 0 };
if (debug) window.__museumStats = stats;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeScale = reduceMotion ? 0.25 : 1;
const PAINTING_RES = quality === 'low' ? [256, 320] : quality === 'high' ? [1024, 1280] : [512, 640];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

// Offscreen quad that draws each painting shader into its plate.
const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

// ---- Room -------------------------------------------------------------
const { mirror } = buildRoom(scene, renderer, { reflections: quality !== 'low' });
let frameNo = 0;
if (mirror) {
  // The mirror re-renders the whole scene, so refresh it every other frame.
  const original = mirror.onBeforeRender;
  mirror.onBeforeRender = function (...args) {
    if (isFrozen || frameNo % 2 === 0) original.apply(this, args);
  };
}

const WALL_Z = -ROOM.d / 2;
const LEFT_X = -ROOM.w / 2;
const RIGHT_X = ROOM.w / 2;
const FRAME_DEPTH = 0.08;
const FRAME_BORDER = 0.07;
const PLATE_Y = 1.75;
const frameMat = new THREE.MeshPhysicalMaterial({ color: '#1b1714', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const matMat = new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.95 });

const back = (x) => ({ center: new THREE.Vector3(x, PLATE_Y, WALL_Z + FRAME_DEPTH / 2 + 0.02), normal: new THREE.Vector3(0, 0, 1) });
const left = (z) => ({ center: new THREE.Vector3(LEFT_X + FRAME_DEPTH / 2 + 0.02, PLATE_Y, z), normal: new THREE.Vector3(1, 0, 0) });
const right = (z) => ({ center: new THREE.Vector3(RIGHT_X - FRAME_DEPTH / 2 - 0.02, PLATE_Y, z), normal: new THREE.Vector3(-1, 0, 0) });
const slots = {
  drift: back(-6.4), planes: back(-3.2), fracture: back(0), deco: back(3.2), tide: back(6.4),
  lattice: left(-5.2), grid: left(-2.6), moire: left(0), strata: left(2.6), halftone: left(5.2),
  dots: right(5.3),
};

// Every work (painting or sculpture) shares one shape: where it is, where to
// stand to see it, what to click, and its text.
const works = [];

paintingDefs.forEach((def) => {
  const plate = createPainting(def, renderer, PAINTING_RES);
  const [w, h] = plate.size;
  const { center, normal } = slots[def.meta.id];

  const group = new THREE.Group();
  group.position.copy(center);
  group.rotation.y = Math.atan2(normal.x, normal.z);

  // A cream mat inside the dark frame, as in a gallery.
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.28, h + 0.28), matMat);
  mat.position.z = FRAME_DEPTH / 2 - 0.004;
  group.add(mat);
  plate.canvas.position.z = FRAME_DEPTH / 2 + 0.002;
  group.add(plate.canvas);

  const ow = w + 0.28;
  const oh = h + 0.28;
  [
    [ow + FRAME_BORDER * 2, FRAME_BORDER, 0, oh / 2 + FRAME_BORDER / 2],
    [ow + FRAME_BORDER * 2, FRAME_BORDER, 0, -oh / 2 - FRAME_BORDER / 2],
    [FRAME_BORDER, oh, -ow / 2 - FRAME_BORDER / 2, 0],
    [FRAME_BORDER, oh, ow / 2 + FRAME_BORDER / 2, 0],
  ].forEach(([bw, bh, bx, by]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, FRAME_DEPTH), frameMat);
    bar.position.set(bx, by, 0);
    group.add(bar);
  });
  scene.add(group);

  const head = center.clone().addScaledVector(normal, 2.2);
  head.y = HEAD_Y;
  createFixture(scene, { position: head, target: center, yokeTo: def.meta.id === 'dots' ? ROOM.h : undefined });
  wallPool(scene, center, normal);

  const work = {
    meta: def.meta, center, normal, dist: 4.6, eyeY: PLATE_Y,
    pick: [plate.canvas], plate, hover: 0, drawn: false,
  };
  plate.canvas.userData.work = work;
  works.push(work);
});

const SPOT_IDS = new Set(['column', 'knot', 'cloud', 'amphora']);
createSculptures().forEach((s) => {
  scene.add(s.group);
  const head = new THREE.Vector3(s.center.x + 1.3, HEAD_Y, s.center.z + 1.7);
  const light = SPOT_IDS.has(s.meta.id) ? { intensity: 120, angle: 0.3 } : null;
  createFixture(scene, { position: head, target: s.center, light, yokeTo: ROOM.h });
  if (s.floorPool) floorPool(scene, ...s.floorPool);
  const work = {
    meta: s.meta, center: s.center, normal: s.normal, dist: s.dist, eyeY: s.eyeY,
    pick: [s.group], sculpture: s, hover: 0,
  };
  s.group.userData.work = work;
  works.push(work);
});

const byId = Object.fromEntries(works.map((w) => [w.meta.id, w]));
// Arrow order: the back wall, the window side, then back around the left wall.
const NAV = ['drift', 'planes', 'fracture', 'deco', 'tide', 'doric', 'cloud', 'dots', 'knot', 'mobile', 'column', 'halftone', 'strata', 'moire', 'grid', 'lattice', 'amphora'].map((id) => byId[id]);
const TOUR_HOLD = 8; // seconds on each work
const pickables = works.flatMap((w) => w.pick);

// ---- Details panel and controls -----------------------------------------
const panel = document.getElementById('plate-panel');
const el = (id) => document.getElementById(id);
const panelEls = {
  count: el('plate-count'), series: el('plate-series'), title: el('plate-title'), note: el('plate-note'),
  after: el('plate-after'), medium: el('plate-medium'), year: el('plate-year'),
};
const prevButton = el('prev-work');
const nextButton = el('next-work');
const overviewButton = el('overview');
const tourButton = el('tour-toggle');
const musicButton = el('music-toggle');

let active = null;
let index = -1; // -1 is the overview

function openWork(work) {
  active = work;
  index = NAV.indexOf(work);
  const m = work.meta;
  panelEls.count.textContent = `${index + 1} / ${NAV.length}`;
  panelEls.series.textContent = m.series;
  panelEls.title.textContent = m.title;
  panelEls.note.textContent = m.note;
  panelEls.after.textContent = m.after;
  panelEls.medium.textContent = m.medium;
  panelEls.year.textContent = m.year;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
}

function showOverview() {
  active = null;
  index = -1;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
}

function step(direction) {
  stopTour();
  const n = NAV.length;
  const next = index === -1 ? (direction > 0 ? 0 : n - 1) : (index + direction + n) % n;
  openWork(NAV[next]);
}

prevButton.addEventListener('click', () => step(-1));
nextButton.addEventListener('click', () => step(1));
overviewButton.addEventListener('click', () => { stopTour(); showOverview(); });
el('plate-close').addEventListener('click', () => { stopTour(); showOverview(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { stopTour(); showOverview(); }
});

// ---- Guided tour (play / pause) --------------------------------------------
const tour = { playing: false, timer: 0 };

function setTourLabel() {
  tourButton.textContent = tour.playing ? 'Pause tour' : 'Play tour';
  tourButton.setAttribute('aria-pressed', String(tour.playing));
}
function stopTour() {
  tour.playing = false;
  setTourLabel();
}
tourButton.addEventListener('click', () => {
  if (tour.playing) {
    stopTour();
    return;
  }
  tour.playing = true;
  tour.timer = 0;
  openWork(NAV[index === -1 ? 0 : index]);
  setTourLabel();
});

// ---- Music toggle ---------------------------------------------------------
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

// ---- Pointer: hover and click to focus (no free look) ---------------------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let hover = null;
let pendingMove = null;

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
  window.addEventListener('pointermove', (e) => { pendingMove = e; });
  canvas.addEventListener('click', (e) => {
    const hit = pickWork(e.clientX, e.clientY);
    stopTour();
    if (hit) openWork(hit);
    else if (active) showOverview();
  });
}

// ---- Camera ------------------------------------------------------------------
const OVERVIEW_POS = new THREE.Vector3(7.9, 2.5, 6.4);
const OVERVIEW_LOOK = new THREE.Vector3(-1.5, 1.2, -2.6);
const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const camNow = new THREE.Vector3().copy(OVERVIEW_POS);
const lookNow = new THREE.Vector3().copy(OVERVIEW_LOOK);
const stand = new THREE.Vector3();

function setCameraGoal(t) {
  if (active) {
    stand.copy(active.center).addScaledVector(active.normal, active.dist);
    stand.y = active.eyeY;
    camGoal.copy(stand);
    lookGoal.copy(active.center);
    return;
  }
  // The standing overview, with the faintest breathing sway.
  const amp = reduceMotion ? 0 : 1;
  camGoal.set(OVERVIEW_POS.x + Math.sin(t * 0.1) * 0.12 * amp, OVERVIEW_POS.y + Math.sin(t * 0.13) * 0.03 * amp, OVERVIEW_POS.z);
  lookGoal.copy(OVERVIEW_LOOK);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 80 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Adaptive resolution: step the pixel ratio down if frames run slow ------
let avgDt = 0.016;
let slowFor = 0;
function adapt(dt) {
  avgDt += (dt - avgDt) * 0.05;
  if (avgDt > 0.034 && pixelRatio > 0.75) {
    slowFor += dt;
    if (slowFor > 1.5) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      resize();
      slowFor = 0;
      avgDt = 0.02;
    }
  } else {
    slowFor = 0;
  }
}

// ---- Frame loop ---------------------------------------------------------------
const clock = new THREE.Clock();
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = isFrozen ? frozenT : (elapsed += dt * timeScale);
  const ease = isFrozen ? 1 : 1 - Math.exp(-dt * 2.4);
  frameNo++;
  if (!isFrozen) adapt(dt);

  if (tour.playing) {
    tour.timer += dt;
    if (tour.timer >= TOUR_HOLD) {
      tour.timer = 0;
      openWork(NAV[(index + 1) % NAV.length]);
    }
  }

  if (pendingMove) {
    hover = pickWork(pendingMove.clientX, pendingMove.clientY);
    canvas.style.cursor = hover ? 'pointer' : 'default';
    pendingMove = null;
  }

  setCameraGoal(t);
  camNow.lerp(camGoal, ease);
  lookNow.lerp(lookGoal, ease);
  camera.position.copy(camNow);
  camera.lookAt(lookNow);
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

  const tScript = debug ? performance.now() : 0;
  if (debug) { renderer.info.autoReset = false; renderer.info.reset(); }
  works.forEach((w, i) => {
    if (w.plate) {
      const goal = !isFrozen && (w === hover || w === active) ? 0.85 : 0.5;
      w.plate.surface.emissiveIntensity += (goal - w.plate.surface.emissiveIntensity) * (isFrozen ? 1 : 1 - Math.exp(-dt * 6));
      // Paintings move slowly, so each visible one redraws every third frame.
      const turn = w === active || (frameNo + i) % 3 === 0;
      if (isFrozen || !w.drawn || (turn && frustum.intersectsObject(w.plate.canvas))) {
        w.plate.update(t, quad, quadCamera, quadScene);
        w.drawn = true;
      }
    }
    if (w.sculpture) {
      const ts = debug ? performance.now() : 0;
      w.sculpture.update(t);
      if (debug) stats.sculptMs += performance.now() - ts;
    }
  });

  if (debug) {
    stats.paintCalls += renderer.info.render.calls;
    stats.paintTris += renderer.info.render.triangles;
    renderer.info.reset();
    stats.scriptMs += performance.now() - tScript;
  }
  const tRender = debug ? performance.now() : 0;
  renderer.render(scene, camera);
  if (debug) {
    stats.renderMs += performance.now() - tRender;
    stats.sceneCalls += renderer.info.render.calls;
    stats.sceneTris += renderer.info.render.triangles;
    stats.frames++;
    stats.memory = { ...renderer.info.memory };
    stats.programs = renderer.info.programs ? renderer.info.programs.length : 0;
  }
  if (!isFrozen) requestAnimationFrame(frame);
}

canvas.style.cursor = 'default';
setTourLabel();
setMusicLabel('Music off');
if (focusId && byId[focusId]) openWork(byId[focusId]);

frame();
window.__museumReady = true;
if (!isFrozen) requestAnimationFrame(frame);

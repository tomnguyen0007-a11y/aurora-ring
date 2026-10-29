import * as THREE from 'three';
import { paintingDefs } from './paintings/index.js';
import { createPainting } from './paintings/common.js';
import { createSculptures } from './sculptures.js';
import { loadHall, frameGlass } from './hall.js';
import { HALL } from './hall-data.js';
import { createAmbient } from './audio.js';
import { CONFIG } from './config.js';

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
// Paintings redraw at a resolution that matches how big they look: small in the overview, sharp
// when focused. ?q=low keeps everything small, for tests.
const RES_OVERVIEW = quality === 'low' ? [256, 320] : [384, 480];
const RES_NEIGHBOUR = quality === 'low' ? [256, 320] : [512, 640];
const RES_FOCUS = quality === 'low' ? [256, 320] : [1024, 1280];
const FRAME_MS = 29; // draws every 2nd frame on a 60 Hz screen, which halves the heat

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, 2); // sharp on Retina; adapt() only drops it on a very slow device
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// The same view transform as the Blender renders (Khronos PBR Neutral, plus the exposure
// the hall was baked with), so the live works and the baked room agree.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 2 ** HALL.exposureEV;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfcac1');

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

// Offscreen quad that draws each painting shader into its plate.
const quadScene = new THREE.Scene();
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quadScene.add(quad);

// ---- Room -------------------------------------------------------------
// The room is baked in Blender and arrives as a few files; the gallery is usable straight
// away and the room fills in underneath. The floor mirror re-renders the whole scene, so it
// refreshes every other frame.
let frameNo = 0;
const loading = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const hallReady = loadHall(renderer, scene, { reflections: quality !== 'low', onProgress: (p) => { if (loadingBar) loadingBar.style.transform = `scaleX(${p})`; } })
  .then(({ mirror }) => {
    if (mirror) {
      const original = mirror.onBeforeRender;
      mirror.onBeforeRender = function (...args) {
        if (isFrozen || frameNo % 2 === 0) original.apply(this, args);
      };
    }
    if (loading) loading.classList.add('is-done');
    window.__hallReady = true;
  })
  .catch((err) => {
    console.error('The hall could not be loaded', err);
    window.__hallError = String(err && err.message || err);
    if (loading) loading.textContent = 'The hall could not be loaded. Please reload the page.';
  });

// Every work (painting or sculpture) shares one shape: where it is, where to
// stand to see it, what to click, and its text.
const works = [];
const SPOT_COLOUR = '#ffe6c8';

paintingDefs.forEach((def) => {
  const spec = HALL.art.find((a) => a.id === def.meta.id);
  const [w, h] = spec.size;
  const centre = new THREE.Vector3(...spec.centre);
  const normal = new THREE.Vector3(...spec.normal);
  const plate = createPainting(def, renderer, RES_OVERVIEW, [w, h]);

  // The canvas sits just proud of the wall, with the glass a little further out.
  const yaw = Math.atan2(normal.x, normal.z);
  plate.canvas.position.copy(centre).addScaledVector(normal, 0.0135);
  plate.canvas.rotation.y = yaw;
  scene.add(plate.canvas);
  const matWidth = 0.07 + 0.015 * (h - 1.5);
  const glass = frameGlass(w + 2 * matWidth, h + 2 * matWidth);
  glass.position.copy(centre).addScaledVector(normal, 0.031);
  glass.rotation.y = yaw;
  scene.add(glass);

  const work = {
    meta: def.meta, center: centre, normal, dist: spec.wall === 'alcove' ? 3.3 : h > 1.7 ? 3.7 : 3.2, eyeY: 1.6,
    pick: [plate.canvas], plate, hover: 0, drawn: false,
  };
  plate.canvas.userData.work = work;
  works.push(work);
});

createSculptures().forEach((s) => {
  scene.add(s.group);
  if (s.light) {
    const spot = new THREE.SpotLight(SPOT_COLOUR, s.light.intensity, 0, s.light.angle, 0.8, 2);
    spot.position.set(...s.light.position);
    spot.target.position.copy(s.center);
    scene.add(spot, spot.target);
  }
  const work = {
    meta: s.meta, center: s.center, normal: s.normal, dist: s.dist, eyeY: s.eyeY,
    pick: [s.group], sculpture: s, hover: 0,
  };
  s.group.userData.work = work;
  works.push(work);
});

const byId = Object.fromEntries(works.map((w) => [w.meta.id, w]));
// Arrow order: a lap of the hall. The left wall from the door, the corner, the back wall,
// the alcove, the window side, then the sculptures across the floor.
const NAV = ['lattice', 'grid', 'moire', 'strata', 'amphora', 'drift', 'planes', 'fracture', 'deco', 'tide', 'dots', 'cloud', 'doric', 'halftone', 'knot', 'mobile', 'column'].map((id) => byId[id]);
const TOUR_HOLD = 8; // seconds on each work
const pickables = works.flatMap((w) => w.pick);

// ---- Details panel and controls -----------------------------------------
const panel = document.getElementById('plate-panel');
const el = (id) => document.getElementById(id);
const panelEls = {
  count: el('plate-count'), series: el('plate-series'), title: el('plate-title'), note: el('plate-note'), home: el('plate-home'),
  after: el('plate-after'), medium: el('plate-medium'), year: el('plate-year'),
};
const dockCount = el('dock-count');
const moreButton = el('plate-more');
const toast = el('toast');
const prevButton = el('prev-work');
const nextButton = el('next-work');
const overviewButton = el('overview');
const tourButton = el('tour-toggle');
const musicButton = el('music-toggle');

let active = null;
let index = -1; // -1 is the overview

// The camera's view is shifted so the work stays visible next to the panel (desktop)
// or above the bottom sheet (phone). The shift is measured from the panel itself.
const shift = new THREE.Vector2(0, 0);
const shiftGoal = new THREE.Vector2(0, 0);
function measureShift() {
  const r = panel.getBoundingClientRect();
  const sheet = window.innerWidth <= 720;
  if (sheet) shiftGoal.set(0, (window.innerHeight - r.top) / 2);
  else shiftGoal.set((window.innerWidth - r.left) / 2, 0);
}

// Plates redraw sharp when focused and small when they are only a thumbnail in the overview.
function applyResolutions() {
  works.forEach((w) => {
    if (!w.plate) return;
    const [rw, rh] = !active ? RES_OVERVIEW : w === active ? RES_FOCUS : RES_NEIGHBOUR;
    if (w.res !== rw) {
      w.plate.setRes(rw, rh);
      w.res = rw;
      w.drawn = false;
    }
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-shown');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-shown'), 4200);
}

moreButton.addEventListener('click', () => {
  const open = panel.classList.toggle('is-expanded');
  moreButton.textContent = open ? 'Less' : 'More';
  requestAnimationFrame(measureShift);
});

// Enquire: a ready-made email if a contact address is set, otherwise the text is copied.
el('enquire').addEventListener('click', async () => {
  if (!active) return;
  const m = active.meta;
  const subject = `Enquiry: ${m.title}`;
  const body = `Hello, I would like to enquire about "${m.title}" (${m.series}) in ${CONFIG.studioName}.`;
  if (CONFIG.contactEmail) {
    window.location.href = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  try {
    await navigator.clipboard.writeText(body);
    showToast('Enquiry text copied. Set contactEmail in js/config.js to send it by email.');
  } catch (err) {
    showToast(body);
  }
});

const introPanel = el('intro-panel');
function hideIntro() {
  introPanel.classList.remove('is-open');
  introPanel.setAttribute('aria-hidden', 'true');
}
el('intro-close').addEventListener('click', hideIntro);
el('intro-start').addEventListener('click', () => { stopTour(); openWork(NAV[0]); });
if (!isFrozen && !focusId) {
  introPanel.classList.add('is-open');
  introPanel.setAttribute('aria-hidden', 'false');
}

function openWork(work) {
  hideIntro();
  active = work;
  index = NAV.indexOf(work);
  const m = work.meta;
  panelEls.count.textContent = `No. ${String(index + 1).padStart(2, '0')}`;
  panel.classList.remove('is-expanded');
  moreButton.textContent = 'More';
  panelEls.series.textContent = m.series;
  panelEls.title.textContent = m.title;
  panelEls.note.textContent = m.note;
  panelEls.home.textContent = m.home;
  panelEls.after.textContent = m.after;
  panelEls.medium.textContent = m.medium;
  panelEls.year.textContent = m.year;
  dockCount.textContent = `${String(index + 1).padStart(2, '0')} / ${NAV.length}`;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  applyResolutions();
  measureShift();
}

function showOverview() {
  active = null;
  index = -1;
  dockCount.textContent = 'Overview';
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  applyResolutions();
  shiftGoal.set(0, 0);
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
  tourButton.querySelector('.lbl').textContent = tour.playing ? 'Pause tour' : 'Play tour';
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
  musicButton.querySelector('.state').textContent = text.replace(/^Music/, '');
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
  // A horizontal swipe on a touch screen moves to the next or previous work.
  let swipe = null;
  canvas.addEventListener('pointerdown', (e) => { swipe = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null; });
  canvas.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
  });
  canvas.addEventListener('click', (e) => {
    const hit = pickWork(e.clientX, e.clientY);
    stopTour();
    if (hit) openWork(hit);
    else if (active) showOverview();
  });
}

// ---- Camera ------------------------------------------------------------------
// The standing overview: just inside the door, at eye height, looking down the hall.
const OVERVIEW_POS = new THREE.Vector3(-10.2, 1.62, 5.6);
const OVERVIEW_LOOK = new THREE.Vector3(2.5, 1.45, -4.5);
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
  if (active) measureShift();
}
window.addEventListener('resize', resize);
resize();

// ---- Adaptive resolution: step the pixel ratio down if frames run slow ------
let avgDt = 0.016;
let slowFor = 0;
function adapt(dt) {
  avgDt += (dt - avgDt) * 0.05;
  if (avgDt > 0.075 && pixelRatio > 1) {
    slowFor += dt;
    if (slowFor > 2) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
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

let lastDraw = 0;
function frame() {
  if (!isFrozen) {
    // Cap at roughly 30 frames a second: it looks the same for slow art and halves the heat.
    const now = performance.now();
    if (now - lastDraw < FRAME_MS) {
      requestAnimationFrame(frame);
      return;
    }
    lastDraw = now;
  }
  const dt = Math.min(clock.getDelta(), 0.1);
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
  shift.lerp(shiftGoal, isFrozen ? 1 : 1 - Math.exp(-dt * 5));
  camera.setViewOffset(window.innerWidth, window.innerHeight, shift.x, shift.y, window.innerWidth, window.innerHeight);
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

  const tScript = debug ? performance.now() : 0;
  if (debug) { renderer.info.autoReset = false; renderer.info.reset(); }
  works.forEach((w, i) => {
    if (w.plate) {
      const goal = !isFrozen && (w === hover || w === active) ? 0.8 : 0.72;
      const gain = w.plate.surface.uniforms.uGain;
      gain.value += (goal - gain.value) * (isFrozen ? 1 : 1 - Math.exp(-dt * 6));
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
applyResolutions();
setTourLabel();
setMusicLabel('Music off');
if (focusId && byId[focusId]) openWork(byId[focusId]);

// A frozen still waits for the room, so it never captures an empty hall.
if (isFrozen) {
  hallReady.then(() => { frame(); window.__museumReady = true; }, () => { frame(); window.__museumReady = true; });
} else {
  frame();
  window.__museumReady = true;
}

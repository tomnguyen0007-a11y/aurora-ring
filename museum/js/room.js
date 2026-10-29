// The gallery shell: plaster walls, polished concrete floor with real
// reflections, a coffered ceiling with track rails, a glazed wall with daylight,
// soft furniture, and the track-spot fixtures that light each work.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { concreteMaps, plasterBump, skyTexture, glowTexture } from './textures.js';

export const ROOM = { w: 18, h: 5.2, d: 14 };
const HW = ROOM.w / 2;
const HD = ROOM.d / 2;
const WINDOW = { z0: -5.5, z1: 3.5, y0: 0.35, y1: 4.5 };
export const RAIL_Y = 4.68;
export const HEAD_Y = 4.55;

const blackMat = new THREE.MeshStandardMaterial({ color: '#131313', roughness: 0.5, metalness: 0.6 });
const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.2), toneMapped: false });

export function buildRoom(scene, renderer, { reflections }) {
  RectAreaLightUniformsLib.init();

  // ---- Walls ----------------------------------------------------------
  const bump = plasterBump();
  bump.repeat.set(3, 2);
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#e6e2da', roughness: 0.93, bumpMap: bump, bumpScale: 0.6,
  });

  // A flat wall piece. rotY orients its normal into the room.
  function piece(w, h, x, y, z, rotY, material = wallMat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  piece(ROOM.w, ROOM.h, 0, ROOM.h / 2, -HD, 0); // back
  piece(ROOM.d, ROOM.h, -HW, ROOM.h / 2, 0, Math.PI / 2); // left
  piece(ROOM.w, ROOM.h, 0, ROOM.h / 2, HD, Math.PI); // front (behind the camera)

  // Right wall: four pieces around the window opening.
  const R = -Math.PI / 2;
  const zMid = (WINDOW.z0 + WINDOW.z1) / 2;
  const wLen = WINDOW.z1 - WINDOW.z0;
  piece(WINDOW.z0 + HD, ROOM.h, HW, ROOM.h / 2, (-HD + WINDOW.z0) / 2, R);
  piece(HD - WINDOW.z1, ROOM.h, HW, ROOM.h / 2, (HD + WINDOW.z1) / 2, R);
  piece(wLen, ROOM.h - WINDOW.y1, HW, (ROOM.h + WINDOW.y1) / 2, zMid, R);
  piece(wLen, WINDOW.y0, HW, WINDOW.y0 / 2, zMid, R);

  // Ceiling.
  const ceiling = piece(ROOM.w, ROOM.d, 0, ROOM.h, 0, 0);
  ceiling.rotation.set(Math.PI / 2, 0, 0);

  // ---- Floor: a mirror layer under a semi-transparent concrete layer -------
  const maps = concreteMaps();
  maps.color.repeat.set(6, 5);
  maps.rough.repeat.set(6, 5);
  let mirror = null;
  if (reflections) {
    const size = Math.min(768, Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 2) * 0.5));
    mirror = new Reflector(new THREE.PlaneGeometry(ROOM.w, ROOM.d), {
      color: 0x5f5e5b, textureWidth: size, textureHeight: size, clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    scene.add(mirror);
  }
  const concrete = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshStandardMaterial({
      map: maps.color, roughnessMap: maps.rough, roughness: 1, metalness: 0,
      transparent: reflections, opacity: reflections ? 0.86 : 1,
    }),
  );
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = 0.004;
  concrete.receiveShadow = true;
  scene.add(concrete);

  // Shadow-gap reveal at the base of each wall.
  const gapMat = new THREE.MeshStandardMaterial({ color: '#24211e', roughness: 0.8 });
  const gap = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), gapMat);
    m.position.set(x, 0.035, z);
    scene.add(m);
  };
  gap(ROOM.w, 0.03, 0, -HD + 0.015);
  gap(0.03, ROOM.d, -HW + 0.015, 0);
  gap(0.03, ROOM.d, HW - 0.015, 0);

  // ---- Coffered ceiling and rails -------------------------------------------
  const beamMat = new THREE.MeshStandardMaterial({ color: '#e8e5de', roughness: 0.9 });
  const beam = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), beamMat);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = true;
    scene.add(m);
  };
  [-6.5, -2.2, 2.2, 6.5].forEach((x) => beam(0.32, 0.5, ROOM.d, x, ROOM.h - 0.25, 0));
  [-3.8, 0.4, 4.6].forEach((z) => beam(ROOM.w, 0.4, 0.3, 0, ROOM.h - 0.2, z));

  const rail = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, d), blackMat);
    m.position.set(x, RAIL_Y, z);
    scene.add(m);
  };
  rail(ROOM.w - 0.6, 0.045, 0, -HD + 2.2); // washes the back wall
  rail(0.045, ROOM.d - 0.6, -HW + 2.2, 0); // washes the left wall

  // ---- Window wall: frame, mullions, and sky ------------------------------------
  const frameMat = new THREE.MeshStandardMaterial({ color: '#181818', roughness: 0.4, metalness: 0.7 });
  const mull = (w, h, d, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(HW - 0.05, y, z);
    scene.add(m);
  };
  const winH = WINDOW.y1 - WINDOW.y0;
  const winY = (WINDOW.y0 + WINDOW.y1) / 2;
  mull(0.1, winH, 0.08, winY, WINDOW.z0);
  mull(0.1, winH, 0.08, winY, WINDOW.z1);
  mull(0.1, 0.08, wLen, WINDOW.y0, zMid);
  mull(0.1, 0.08, wLen, WINDOW.y1, zMid);
  for (let i = 1; i < 4; i++) mull(0.08, winH, 0.05, winY, WINDOW.z0 + (wLen * i) / 4);
  mull(0.08, 0.05, wLen, winY + 0.55, zMid);

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(wLen + 4, winH + 3),
    new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }),
  );
  sky.position.set(HW + 2.2, winY + 0.4, zMid);
  sky.rotation.y = -Math.PI / 2;
  scene.add(sky);

  // Cool daylight spilling in, against the warm track lights.
  const daylight = new THREE.RectAreaLight('#e4efff', 6, wLen, winH);
  daylight.position.set(HW - 0.25, winY, zMid);
  daylight.lookAt(0, 1.5, zMid);
  scene.add(daylight);

  // ---- Furniture ---------------------------------------------------------
  const fabric = new THREE.MeshPhysicalMaterial({
    color: '#e9e4da', roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'),
  });
  const soft = (w, h, d, x, z, rotY) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 8, Math.min(h, d) * 0.4), fabric);
    m.position.set(x, h / 2, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  soft(1.7, 0.42, 1.05, 0.5, -0.4, 0.25);
  soft(1.3, 0.34, 0.9, -1.6, 0.4, -0.4);
  soft(2.4, 0.44, 0.7, 7.9, -0.4, Math.PI / 2);

  // A low rug under the seating anchors it to the floor.
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 4.2),
    new THREE.MeshStandardMaterial({ color: '#4a463f', roughness: 1, bumpMap: bump, bumpScale: 1.2 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.2, 0.007, 1.2);
  rug.receiveShadow = false;
  scene.add(rug);

  // Light: a soft warm key, a hemisphere fill, and the window. No shadow maps.
  const key = new THREE.DirectionalLight('#fff0dc', 1.0);
  key.position.set(4, 8, 6);
  scene.add(key);
  scene.add(new THREE.HemisphereLight('#fbf6ee', '#8c8277', 0.35));

  return { mirror };
}

const glow = glowTexture();
const poolMat = new THREE.MeshBasicMaterial({
  map: glow, color: '#ffd9a8', transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const shadowMat = new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });

// A pool of warm light on a wall, where a spot would land.
export function wallPool(scene, center, normal) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 5.0), poolMat);
  m.position.copy(center).addScaledVector(normal, 0.015);
  m.rotation.y = Math.atan2(normal.x, normal.z);
  scene.add(m);
}

// A pool of light and a soft contact shadow on the floor under a sculpture.
export function floorPool(scene, x, z, radius) {
  const light = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.2, radius * 3.2), poolMat);
  light.rotation.x = -Math.PI / 2;
  light.position.set(x, 0.009, z);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(radius * 1.8, radius * 1.8), shadowMat);
  shade.rotation.x = -Math.PI / 2;
  shade.position.set(x, 0.008, z);
  scene.add(light, shade);
}

// A track-spot fixture: housing, glowing lens, and a yoke to the rail or ceiling.
// With `light` set it also casts a real SpotLight; wall paintings use a decal pool
// instead, which looks the same and costs almost nothing.
export function createFixture(scene, { position, target, light = null, yokeTo = RAIL_Y }) {
  const housing = new THREE.Group();
  housing.position.copy(position);
  housing.lookAt(target);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 20), blackMat);
  body.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.064, 20), lensMat);
  lens.position.z = 0.141;
  housing.add(body, lens);
  scene.add(housing);

  const yokeH = Math.max(0.05, yokeTo - position.y);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, yokeH, 8), blackMat);
  yoke.position.set(position.x, position.y + yokeH / 2, position.z);
  scene.add(yoke);

  if (!light) return null;
  const spot = new THREE.SpotLight('#ffe9cf', light.intensity, 0, light.angle, 0.8, 2);
  spot.position.copy(position);
  spot.target.position.copy(target);
  scene.add(spot, spot.target);
  return spot;
}

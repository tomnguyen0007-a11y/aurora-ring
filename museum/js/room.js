// The gallery shell: plaster walls, polished concrete floor with real
// reflections, a coffered ceiling with track rails, a glazed wall with daylight,
// soft furniture, and the track-spot fixtures that light each work.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { concreteMaps, plasterBump, skyTexture } from './textures.js';

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
  if (reflections) {
    const size = Math.min(1024, Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 2) * 0.5));
    const mirror = new Reflector(new THREE.PlaneGeometry(ROOM.w, ROOM.d), {
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
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  soft(1.7, 0.42, 1.05, 0.5, -0.4, 0.25);
  soft(1.3, 0.34, 0.9, -1.6, 0.4, -0.4);
  soft(2.4, 0.44, 0.7, 7.1, 1.2, Math.PI / 2);

  return { group: null };
}

// A track spot: housing, glowing lens, SpotLight, and a faint beam of light.
export function createTrackSpot(scene, { position, target, intensity = 90, angle = 0.42, castShadow = false, yokeTo = RAIL_Y, color = '#ffe9cf' }) {
  const light = new THREE.SpotLight(color, intensity, 0, angle, 0.8, 2);
  light.position.copy(position);
  light.target.position.copy(target);
  if (castShadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0004;
    light.shadow.radius = 4;
  }
  scene.add(light, light.target);

  const housing = new THREE.Group();
  housing.position.copy(position);
  housing.lookAt(target);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.28, 24), blackMat);
  body.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.064, 24), lensMat);
  lens.position.z = 0.141;
  housing.add(body, lens);
  scene.add(housing);

  // Yoke up to the rail (or the ceiling, for a hanging spot).
  const yokeH = Math.max(0.05, yokeTo - position.y);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, yokeH, 8), blackMat);
  yoke.position.set(position.x, position.y + yokeH / 2, position.z);
  scene.add(yoke);

  // Light cone, from the lens to the target.
  const length = position.distanceTo(target);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(angle) * length, length, 40, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.011, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
  );
  cone.position.copy(position).lerp(target, 0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position.clone().sub(target).normalize());
  scene.add(cone);

  return { light, baseIntensity: intensity };
}

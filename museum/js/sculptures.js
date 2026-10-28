// Three animated sculptures, each a self-contained component:
//   Lumen Column  - a twisting stack of brass blades
//   Knot Study I  - a mirror-chrome torus knot on a black plinth
//   Cloud Form    - a slowly morphing iridescent resin body
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const glossBlack = new THREE.MeshPhysicalMaterial({ color: '#0e0e10', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
const whiteStone = new THREE.MeshPhysicalMaterial({ color: '#f2eee7', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 });

function shadows(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

function lumenColumn() {
  const group = new THREE.Group();
  group.position.set(-3.4, 0, 1.2);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.18, 64), glossBlack);
  base.position.y = 0.09;
  group.add(base);

  const brass = new THREE.MeshPhysicalMaterial({ color: '#caa45a', metalness: 1, roughness: 0.26, clearcoat: 0.25 });
  const geometry = new RoundedBoxGeometry(1, 0.05, 1, 4, 0.02);
  const COUNT = 30;
  const blades = [];
  for (let i = 0; i < COUNT; i++) {
    const blade = new THREE.Mesh(geometry, brass);
    const swell = Math.pow(Math.sin((Math.PI * (i + 0.5)) / COUNT), 0.8);
    blade.scale.set(0.28 + 0.34 * swell, 1, (0.28 + 0.34 * swell) * 0.55);
    blade.position.y = 0.28 + i * 0.075;
    group.add(blade);
    blades.push(blade);
  }
  shadows(group);

  return {
    meta: {
      id: 'column',
      title: 'Lumen Column',
      series: 'Kinetic sculpture',
      medium: 'Thirty brass blades, procedural 3D, slow twist',
      year: '2026',
      note: 'Each blade turns a little ahead of the one below, so the column never holds one shape.',
    },
    group,
    center: new THREE.Vector3(-3.4, 1.45, 1.2),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 3.6,
    update(t) {
      blades.forEach((blade, i) => {
        blade.rotation.y = i * 0.19 + t * 0.15 + 0.5 * Math.sin(t * 0.2 + i * 0.1);
      });
    },
  };
}

function knotStudy() {
  const group = new THREE.Group();
  group.position.set(3.4, 0, 2.0);

  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.95, 0.8, 6, 0.03), glossBlack);
  plinth.position.y = 0.475;
  group.add(plinth);

  const chrome = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.04, clearcoat: 0, envMapIntensity: 1.6 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.34, 0.085, 320, 36, 2, 3), chrome);
  knot.position.y = 1.5;
  group.add(knot);
  shadows(group);

  return {
    meta: {
      id: 'knot',
      title: 'Knot Study I',
      series: 'Mirror sculpture',
      medium: 'Mirror-polished chrome torus knot, procedural 3D',
      year: '2026',
      note: 'A single loop that passes through itself three times. The room folds into its surface.',
    },
    group,
    center: new THREE.Vector3(3.4, 1.5, 2.0),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 3.2,
    update(t) {
      knot.rotation.y = t * 0.25;
      knot.rotation.x = 0.3 * Math.sin(t * 0.3);
    },
  };
}

function cloudForm() {
  const group = new THREE.Group();
  group.position.set(6.2, 0, -2.2);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.05, 64), whiteStone);
  plinth.position.y = 0.525;
  group.add(plinth);

  // Merge duplicate vertices so normals are smooth across the whole surface.
  let geometry = new THREE.IcosahedronGeometry(0.52, 20);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const base = Float32Array.from(position.array);

  const resin = new THREE.MeshPhysicalMaterial({
    color: '#e8e2ff', roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 900],
  });
  const body = new THREE.Mesh(geometry, resin);
  body.position.y = 1.05 + 0.62;
  group.add(body);
  shadows(group);

  function morph(t) {
    for (let i = 0; i < position.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      const d = 1
        + 0.16 * Math.sin(3.1 * x + t * 0.6 + 1.3 * Math.sin(2.2 * y + t * 0.4))
        + 0.12 * Math.sin(2.7 * y - t * 0.5 + 2.0 * Math.sin(1.9 * z))
        + 0.1 * Math.sin(3.4 * z + t * 0.45 + Math.sin(2.3 * x));
      position.setXYZ(i, x * d, y * d, z * d);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  morph(0);

  return {
    meta: {
      id: 'cloud',
      title: 'Cloud Form',
      series: 'Iridescent resin',
      medium: 'Thin-film iridescent resin, procedural 3D, slow morph',
      year: '2026',
      note: 'The colour comes from the thickness of the surface, not from pigment. It shifts as you move.',
    },
    group,
    center: new THREE.Vector3(6.2, 1.65, -2.2),
    normal: new THREE.Vector3(-0.95, 0, 0.31).normalize(),
    dist: 3.3,
    update(t) {
      morph(t);
      body.rotation.y = t * 0.08;
    },
  };
}

export function createSculptures() {
  return [lumenColumn(), knotStudy(), cloudForm()];
}

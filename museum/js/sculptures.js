// Six sculptures, each a self-contained component that returns:
//   meta, group, center (where the camera looks), normal + dist (where it stands),
//   eyeY (camera height), and update(t).
//   Lumen Column, Knot Study I, Cloud Form  - modern
//   Amphora, Doric Ruin                     - antiquity
//   Mobile                                  - kinetic
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { marbleTexture, amphoraTexture } from './textures.js';

const glossBlack = new THREE.MeshPhysicalMaterial({ color: '#0e0e10', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
const whiteStone = new THREE.MeshPhysicalMaterial({ color: '#f2eee7', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 });
const wireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.6 });

function lumenColumn() {
  const group = new THREE.Group();
  group.position.set(-3.4, 0, 1.2);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.18, 64), glossBlack);
  base.position.y = 0.09;
  group.add(base);

  const brass = new THREE.MeshPhysicalMaterial({ color: '#caa45a', metalness: 1, roughness: 0.26, clearcoat: 0.25 });
  const geometry = new RoundedBoxGeometry(1, 0.05, 1, 3, 0.02);
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

  return {
    meta: {
      id: 'column',
      title: 'Lumen Column',
      series: 'Kinetic',
      after: 'Stacked-module sculpture of early modernism',
      medium: 'Thirty brass blades, procedural 3D',
      year: '2026',
      note: 'Thirty brass blades, each turned slightly ahead of the one below. Walk around it: it never holds one shape for long.',
      home: 'In a hallway corner or beside a staircase, where the brass catches passing light.',
    },
    group,
    center: new THREE.Vector3(-3.4, 1.45, 1.2),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 3.6,
    eyeY: 1.55,
    floorPool: [-3.4, 1.2, 0.9],
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

  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.95, 0.8, 4, 0.03), glossBlack);
  plinth.position.y = 0.475;
  group.add(plinth);

  const chrome = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.04, envMapIntensity: 1.6 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.34, 0.085, 200, 28, 2, 3), chrome);
  knot.position.y = 1.5;
  group.add(knot);

  return {
    meta: {
      id: 'knot',
      title: 'Knot Study I',
      series: 'Mathematics',
      after: 'The trefoil knot; Kelvin’s knotted-vortex atoms, 1867',
      medium: 'Mirror-polished chrome, procedural 3D',
      year: '2026',
      note: 'One loop that crosses itself three times. Nineteenth-century physicists once thought atoms might be knots like this. Look into the chrome and the room folds into it.',
      home: 'On a plinth by a window, where the room and the street both fold into its surface.',
    },
    group,
    center: new THREE.Vector3(3.4, 1.5, 2.0),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 3.2,
    eyeY: 1.55,
    floorPool: [3.4, 2.0, 0.7],
    update(t) {
      knot.rotation.y = t * 0.25;
      knot.rotation.x = 0.3 * Math.sin(t * 0.3);
    },
  };
}

function cloudForm() {
  const group = new THREE.Group();
  group.position.set(6.2, 0, -2.2);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.05, 48), whiteStone);
  plinth.position.y = 0.525;
  group.add(plinth);

  // Merge duplicate vertices so normals are smooth across the whole surface.
  let geometry = new THREE.IcosahedronGeometry(0.52, 11);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const base = Float32Array.from(position.array);
  const colors = new Float32Array(position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Oil-slick colour: the hue follows the surface direction and drifts over time.
  const resin = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.1, metalness: 0.75,
    clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.6, iridescenceIOR: 1.7, envMapIntensity: 1.6,
  });
  const tint = new THREE.Color();
  const body = new THREE.Mesh(geometry, resin);
  body.position.y = 1.05 + 0.62;
  group.add(body);

  function morph(t) {
    for (let i = 0; i < position.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      const d = 1
        + 0.26 * Math.sin(4.2 * x + t * 0.6 + 1.3 * Math.sin(2.2 * y + t * 0.4))
        + 0.2 * Math.sin(3.6 * y - t * 0.5 + 2.0 * Math.sin(1.9 * z))
        + 0.16 * Math.sin(4.4 * z + t * 0.45 + Math.sin(2.3 * x));
      position.setXYZ(i, x * d, y * d, z * d);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      const hue = (0.6 + 0.4 * normal.getY(i) + 0.25 * normal.getX(i) + t * 0.015) % 1;
      tint.setHSL(hue < 0 ? hue + 1 : hue, 0.6, 0.6);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    geometry.attributes.color.needsUpdate = true;
  }
  morph(0);

  let tick = 0;
  return {
    meta: {
      id: 'cloud',
      title: 'Cloud Form',
      series: 'Light',
      after: 'Newton’s rings and thin-film colour, 17th century',
      medium: 'Glossy resin with oil-slick colour, procedural 3D',
      year: '2026',
      note: 'Soap bubbles and oil slicks take their colour from light bouncing between layers. This surface borrows that colour, and it changes as you move around it.',
      home: 'On a dining table or console, as a single object that gets everyone talking.',
    },
    group,
    center: new THREE.Vector3(6.2, 1.65, -2.2),
    normal: new THREE.Vector3(-0.95, 0, 0.31).normalize(),
    dist: 3.3,
    eyeY: 1.6,
    floorPool: [6.2, -2.2, 0.8],
    update(t) {
      // The morph is the most expensive animation, so it runs every third frame.
      if (tick++ % 3 === 0) morph(t);
      body.rotation.y = t * 0.08;
    },
  };
}

function amphora() {
  const group = new THREE.Group();
  group.position.set(-6.4, 0, -1.3);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.9, 48), whiteStone);
  plinth.position.y = 0.45;
  group.add(plinth);

  // Vase profile from the foot to the rim, as (radius, height) pairs.
  const profile = [
    [0.0, 0.0], [0.11, 0.0], [0.13, 0.03], [0.1, 0.07], [0.09, 0.12], [0.16, 0.2],
    [0.25, 0.34], [0.3, 0.5], [0.31, 0.62], [0.28, 0.76], [0.2, 0.9], [0.12, 1.0],
    [0.09, 1.08], [0.09, 1.16], [0.13, 1.22], [0.16, 1.26],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 72),
    new THREE.MeshStandardMaterial({ map: amphoraTexture(), roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  );
  vase.position.y = 0.9;
  const turntable = new THREE.Group();
  turntable.add(vase);

  // Two handles from shoulder to neck.
  const clay = new THREE.MeshStandardMaterial({ color: '#16100d', roughness: 0.5 });
  [-1, 1].forEach((side) => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 12, 28, Math.PI), clay);
    handle.position.set(side * 0.2, 0.9 + 0.95, 0);
    handle.rotation.set(0, 0, side > 0 ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.35);
    turntable.add(handle);
  });
  group.add(turntable);

  return {
    meta: {
      id: 'amphora',
      title: 'Amphora',
      series: 'Antiquity',
      after: 'Attic pottery, 6th century BCE',
      medium: 'Terracotta and black slip, procedural 3D',
      year: '2026',
      note: 'The vase shape Greek potters made for wine and oil, with a meander band at the neck. Walk around it and every side gets its turn.',
      home: 'On a limestone plinth or an oak sideboard, where the terracotta warms a pale room.',
    },
    group,
    center: new THREE.Vector3(-6.4, 1.55, -1.3),
    normal: new THREE.Vector3(0.9, 0, 0.44).normalize(),
    dist: 3.0,
    eyeY: 1.5,
    floorPool: [-6.4, -1.3, 0.8],
    update(t) {
      turntable.rotation.y = t * 0.2;
    },
  };
}

// A shaft with shallow flutes and a slight swell, as on a Greek Doric column.
function flutedShaft(height, bottom, top, flutes = 20, rings = 36, segments = 140) {
  const positions = [];
  const indices = [];
  for (let j = 0; j <= rings; j++) {
    const k = j / rings;
    const radius = bottom + (top - bottom) * k + 0.02 * Math.sin(Math.PI * k);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const q = Math.abs(Math.sin((a * flutes) / 2));
      const r = radius * (1 - 0.05 * Math.sqrt(q));
      // The broken top edge is jagged.
      const chip = j === rings ? 0.16 * (0.5 + 0.5 * Math.sin(a * 2.3 + 1.0)) * (0.5 + 0.5 * Math.sin(a * 5.1)) : 0;
      positions.push(r * Math.cos(a), k * height - chip, r * Math.sin(a));
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function doricRuin() {
  const group = new THREE.Group();
  group.position.set(3.4, 0, -3.6);
  const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.4, metalness: 0, side: THREE.DoubleSide });

  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.12, 48), marble);
  step.position.y = 0.06;
  group.add(step);
  const shaft = new THREE.Mesh(flutedShaft(2.0, 0.42, 0.34), marble);
  shaft.position.y = 0.12;
  group.add(shaft);

  // A fallen capital and a drum lie on the floor beside it.
  const capital = new THREE.Group();
  const echinus = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.36, 0.24, 36), marble);
  const abacus = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.13, 1.15, 2, 0.01), marble);
  abacus.position.y = 0.185;
  capital.add(echinus, abacus);
  capital.position.set(1.0, 0.3, 0.5);
  capital.rotation.set(0.15, 0.6, 1.35);
  group.add(capital);
  const drum = new THREE.Mesh(flutedShaft(0.5, 0.4, 0.4), marble);
  drum.position.set(-0.8, 0.4, 0.9);
  drum.rotation.set(0, 0.5, Math.PI / 2);
  group.add(drum);

  return {
    meta: {
      id: 'doric',
      title: 'Doric Ruin',
      series: 'Antiquity',
      after: 'The Doric order, 7th to 5th century BCE',
      medium: 'Fluted marble, procedural 3D',
      year: '2026',
      note: 'Twenty shallow flutes, a slight swell in the middle and a broken top. It is the oldest of the Greek column orders, left as a ruin.',
      home: 'In a garden room or conservatory, where stone feels natural.',
    },
    group,
    center: new THREE.Vector3(3.4, 1.2, -3.6),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 4.4,
    eyeY: 1.5,
    floorPool: [3.6, -3.4, 1.3],
    update() {},
  };
}

function mobile() {
  const group = new THREE.Group();
  group.position.set(-0.8, 0, -2.6);
  const colours = ['#d9362b', '#2447b8', '#e8b923', '#151515', '#f1ede4'];
  const arms = [];
  let shapeCount = 0;

  function shape() {
    const radius = 0.1 + 0.07 * ((shapeCount * 7) % 3);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 12),
      new THREE.MeshStandardMaterial({ color: colours[shapeCount % colours.length], roughness: 0.55, metalness: 0.05 }),
    );
    mesh.scale.set(radius * (1 + 0.5 * (shapeCount % 2)), 0.025, radius * (1.3 - 0.4 * (shapeCount % 2)));
    shapeCount++;
    return mesh;
  }

  function wire(length) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, length, 6), wireMat);
    w.position.y = -length / 2;
    return w;
  }

  // One balanced arm: a rod, with a wire at each end holding a shape or a smaller arm.
  function arm(depth, length, drop) {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, length * 2, 6), wireMat);
    rod.rotation.z = Math.PI / 2;
    g.add(rod);
    [-1, 1].forEach((side) => {
      const hang = new THREE.Group();
      hang.position.set(side * length, 0, 0);
      hang.add(wire(drop));
      const child = depth > 0 ? arm(depth - 1, length * 0.6, drop) : shape();
      child.position.y = -drop;
      hang.add(child);
      g.add(hang);
    });
    arms.push({ group: g, speed: 0.25 + 0.12 * arms.length, phase: arms.length * 1.7 });
    return g;
  }

  const top = arm(2, 0.9, 0.5);
  top.position.y = 4.1;
  group.add(top);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 5.2 - 4.1, 6), wireMat);
  line.position.y = (5.2 + 4.1) / 2;
  group.add(line);

  return {
    meta: {
      id: 'mobile',
      title: 'Mobile',
      series: 'Kinetic',
      after: 'Kinetic art, 1930s',
      medium: 'Painted metal shapes on wire, procedural 3D',
      year: '2026',
      note: 'Balanced arms carrying flat shapes, moved only by air. Each arm keeps its own rhythm, so the composition rearranges itself all day.',
      home: 'In a stairwell or double-height space, where it can turn freely.',
    },
    group,
    center: new THREE.Vector3(-0.8, 3.0, -2.6),
    normal: new THREE.Vector3(0, 0, 1),
    dist: 5.0,
    eyeY: 2.0,
    floorPool: null,
    update(t) {
      arms.forEach((a) => {
        a.group.rotation.y = Math.sin(t * a.speed + a.phase) * 0.9;
      });
    },
  };
}

export function createSculptures() {
  return [lumenColumn(), knotStudy(), cloudForm(), amphora(), doricRuin(), mobile()];
}

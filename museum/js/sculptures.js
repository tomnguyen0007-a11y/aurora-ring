// Six works in three dimensions, built to match the Blender hall exactly: the same sizes,
// standing on the same plinths (the plinths and the Doric ruin are baked into the room).
// Each returns:
//   meta, group, center (where the camera looks), normal + dist (where it stands),
//   eyeY (camera height), light (the spot that picks it out), and update(t).
//   Lumen Column, Knot Study I, Cloud Form  - modern
//   Amphora, Doric Ruin                     - antiquity
//   Mobile                                  - kinetic
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { amphoraTexture } from './textures.js';
import { HALL } from './hall-data.js';

const wireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.6 });
const base = (id) => HALL.sculptures.find((s) => s.id === id).base;
const ROOM_H = HALL.room.height;
// Each work has a spot hung from the ceiling, up and to one side, like the ones in the Blender room.
const pendant = (x, z, intensity, angle = 0.32) => ({ position: [x + 1.0, ROOM_H - 0.9, z + 1.2], intensity, angle });

function lumenColumn() {
  const [bx, top, bz] = base('column');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);

  const brass = new THREE.MeshPhysicalMaterial({ color: '#c99a52', metalness: 1, roughness: 0.24, clearcoat: 0.2 });
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.95, 16), wireMat);
  spine.position.y = top + 0.975;
  group.add(spine);

  const geometry = new RoundedBoxGeometry(1, 0.035, 1, 2, 0.004);
  const COUNT = 30;
  const blades = [];
  for (let i = 0; i < COUNT; i++) {
    const blade = new THREE.Mesh(geometry, brass);
    const swell = Math.pow(Math.sin((Math.PI * (i + 0.5)) / COUNT), 0.8);
    const w = 0.22 + 0.27 * swell;
    blade.scale.set(w, 1, w * 0.55);
    blade.position.y = 0.19 + i * 0.056;
    group.add(blade);
    blades.push(blade);
  }

  return {
    meta: {
      id: 'column',
      title: 'Lumen Column',
      series: 'Kinetic',
      after: 'Stacked-module sculpture of early modernism',
      medium: "Thirty brass blades on a steel spine",
      year: "H 2.1 m",
      note: "Constantin Brâncuși’s Endless Column (1938) in Romania is a stack of identical modules that seems to climb forever. This one is thirty brass blades, each turned a little further than the one below, and all of them turning. Walk around it: it never holds one shape.",
      home: "In a hallway corner or beside a staircase, where passing light runs up the brass.",
    },
    group,
    center: new THREE.Vector3(bx, 1.15, bz),
    normal: new THREE.Vector3(0.55, 0, 0.84).normalize(),
    dist: 4.0,
    eyeY: 1.55,
    light: pendant(bx, bz, 90),
    update(t) {
      blades.forEach((blade, i) => {
        blade.rotation.y = i * 0.19 + t * 0.15 + 0.5 * (Math.sin(t * 0.2 + i * 0.1) - Math.sin(i * 0.1));
      });
    },
  };
}

function knotStudy() {
  const [bx, top, bz] = base('knot');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);

  const chrome = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.04, envMapIntensity: 1.4 });
  const turn = new THREE.Group();
  turn.position.y = top + 0.133;
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.034, 320, 18, 2, 3), chrome);
  knot.rotation.x = -Math.PI / 2;          // lies flat, its lowest point resting on the plinth
  turn.add(knot);
  group.add(turn);

  return {
    meta: {
      id: 'knot',
      title: 'Knot Study I',
      series: 'Mathematics',
      after: 'The trefoil knot; Kelvin’s knotted-vortex atoms, 1867',
      medium: "Mirror-polished chrome on black steel",
      year: "60 \u00d7 60 cm",
      note: "In 1867 Lord Kelvin proposed that atoms were knots of vortex in the ether. The idea was wrong, but it started the mathematical study of knots. This is the simplest one: a single loop that crosses itself three times. Look into the chrome and the room folds into it.",
      home: "On a plinth by a window, where the room and the garden both fold into its surface.",
    },
    group,
    center: new THREE.Vector3(bx, top + 0.13, bz),
    normal: new THREE.Vector3(-0.15, 0, 0.99).normalize(),
    dist: 2.9,
    eyeY: 1.55,
    light: pendant(bx, bz, 55, 0.3),
    update(t) {
      turn.rotation.y = t * 0.25;
    },
  };
}

function cloudForm() {
  const [bx, top, bz] = base('cloud');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);

  // Merge duplicate vertices so normals are smooth across the whole surface.
  let geometry = new THREE.IcosahedronGeometry(0.5, 11);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const rest = Float32Array.from(position.array);
  const colors = new Float32Array(position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Oil-slick colour: the hue follows the surface direction and drifts over time.
  const resin = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.1, metalness: 0.7,
    clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.6, iridescenceIOR: 1.7, envMapIntensity: 1.5,
  });
  const tint = new THREE.Color();
  const body = new THREE.Mesh(geometry, resin);
  group.add(body);

  function morph(t) {
    let lowest = Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const z = rest[i * 3 + 2];
      const d = 1
        + 0.26 * Math.sin(4.2 * x + t * 0.6 + 1.3 * Math.sin(2.2 * y + t * 0.4))
        + 0.2 * Math.sin(3.6 * y - t * 0.5 + 2.0 * Math.sin(1.9 * z))
        + 0.16 * Math.sin(4.4 * z + t * 0.45 + Math.sin(2.3 * x));
      position.setXYZ(i, x * d, y * d, z * d);
      if (y * d < lowest) lowest = y * d;
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
    body.position.y = top - lowest;       // always resting on the plinth, whatever shape it takes
  }
  morph(0);

  let tick = 0;
  return {
    meta: {
      id: 'cloud',
      title: 'Cloud Form',
      series: 'Light',
      after: 'Newton’s rings and thin-film colour, 17th century',
      medium: "Glossy resin with oil-slick colour",
      year: "\u00d8 60 cm",
      note: "Soap bubbles and oil slicks take their colour from light bouncing between two surfaces a few hundred nanometres apart. Newton studied the coloured rings in the 1670s and published them in 1704. This surface borrows that colour, and it changes as you walk around it.",
      home: "On a console or a dining table, as the one object that gets everyone talking.",
    },
    group,
    center: new THREE.Vector3(bx, top + 0.4, bz),
    normal: new THREE.Vector3(-0.95, 0, 0.31).normalize(),
    dist: 3.4,
    eyeY: 1.6,
    light: pendant(bx, bz, 70, 0.3),
    update(t) {
      // The morph is the most expensive animation, so it runs every third frame.
      if (tick++ % 3 === 0) morph(t);
      body.rotation.y = t * 0.08;
    },
  };
}

function amphora() {
  const [bx, top, bz] = base('amphora');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);

  // The profile from the foot to the rim, as (radius, height) pairs, as modelled in Blender.
  const S = 1.3;
  const profile = [
    [0.0, 0.0], [0.045, 0.0], [0.052, 0.012], [0.04, 0.03], [0.036, 0.05], [0.065, 0.085], [0.1, 0.14], [0.12, 0.21],
    [0.124, 0.26], [0.112, 0.32], [0.08, 0.38], [0.05, 0.42], [0.036, 0.45], [0.036, 0.49], [0.052, 0.515], [0.064, 0.53],
  ].map(([r, y]) => new THREE.Vector2(r * S, y * S));
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 96),
    new THREE.MeshStandardMaterial({ map: amphoraTexture(), roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
  );
  vase.position.y = top;
  const turntable = new THREE.Group();
  turntable.add(vase);

  // Two handles from shoulder to neck.
  [-1, 1].forEach((side) => {
    const points = [];
    for (let j = 0; j <= 14; j++) {
      const k = j / 14;
      points.push(new THREE.Vector3(side * (0.085 + 0.075 * Math.sin(Math.PI * k)) * S, top + (0.385 + 0.11 * k) * S, 0));
    }
    turntable.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, 0.014, 8), wireMat));
  });
  group.add(turntable);

  return {
    meta: {
      id: 'amphora',
      title: 'Amphora',
      series: 'Antiquity',
      after: 'Attic pottery, 6th century BCE',
      medium: "Terracotta with black slip",
      year: "H 70 cm",
      note: "Athenian potters of the 6th century BCE painted in black slip, then fired the pot three times to turn the slip black and leave the clay orange. This one wears a meander and palmettes instead of a story. Walk around it and every side takes a turn.",
      home: "On a limestone plinth or an oak sideboard, where terracotta warms a pale room.",
    },
    group,
    center: new THREE.Vector3(bx, top + 0.38, bz),
    normal: new THREE.Vector3(0.8, 0, 0.6).normalize(),
    dist: 3.0,
    eyeY: 1.5,
    light: pendant(bx, bz, 45, 0.28),
    update(t) {
      turntable.rotation.y = t * 0.2;
    },
  };
}

// The ruin itself is part of the baked room (it is stone, and never moves). This stands in
// for it so it can be picked and focused like any other work.
function doricRuin() {
  const [bx, , bz] = base('doric');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 3.0), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(0, 1.2, 0.2);
  group.add(pick);

  return {
    meta: {
      id: 'doric',
      title: 'Doric Ruin',
      series: 'Antiquity',
      after: 'The Doric order, 7th to 5th century BCE',
      medium: "Fluted marble",
      year: "H 2.3 m",
      note: "Doric is the oldest of the three Greek orders: heavy, plain, no base. Twenty shallow flutes, a slight swell near the middle so the shaft never looks thin, and a broken top. The Parthenon is Doric. This one was left as a ruin on purpose.",
      home: "In a garden room or conservatory, where stone feels natural.",
    },
    group,
    center: new THREE.Vector3(bx, 1.15, bz),
    normal: new THREE.Vector3(0.1, 0, -1).normalize(),
    dist: 4.4,
    eyeY: 1.5,
    light: null,
    update() {},
  };
}

function mobile() {
  const [bx, , bz] = base('mobile');
  const group = new THREE.Group();
  group.position.set(bx, 0, bz);
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
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, length * 2, 8), wireMat);
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

  const TOP = 3.75;
  const top = arm(2, 0.8, 0.45);
  top.position.y = TOP;
  group.add(top);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, ROOM_H - TOP, 6), wireMat);
  line.position.y = (ROOM_H + TOP) / 2;
  group.add(line);

  return {
    meta: {
      id: 'mobile',
      title: 'Mobile',
      series: 'Kinetic',
      after: 'Kinetic art, 1930s',
      medium: "Painted metal shapes on wire",
      year: "W 1.9 m",
      note: "In 1931 Marcel Duchamp gave Alexander Calder’s moving sculptures a name: mobiles. They hang in balance and move with the air alone. Five painted shapes on wire, each arm keeping its own rhythm, so the composition rearranges itself all day.",
      home: "In a stairwell or a double-height room, where it can turn freely.",
    },
    group,
    center: new THREE.Vector3(bx, 2.9, bz),
    normal: new THREE.Vector3(0.3, 0, 0.95).normalize(),
    dist: 5.4,
    eyeY: 2.0,
    light: { position: [bx + 1.2, ROOM_H - 0.9, bz + 1.4], intensity: 70, angle: 0.5 },
    update(t) {
      arms.forEach((a) => {
        a.group.rotation.y = 0.4 + Math.sin(t * a.speed + a.phase) * 0.9;
      });
    },
  };
}

export function createSculptures() {
  return [lumenColumn(), knotStudy(), cloudForm(), amphora(), doricRuin(), mobile()];
}

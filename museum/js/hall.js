// The hall itself. Its geometry and lighting were built and baked in Blender
// (blender/build_hall.py, blender/bake_hall.py), so what the camera sees here is the same
// room as the Blender renders: real light pools, soft shadows, plaster, oak, steel.
//
// What stays live: the paintings, the sculptures, the glass on the frames, and the
// reflection in the floor. Everything else is a texture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HALL } from './hall-data.js';

// In the single-file build every asset is inlined as a data URI under window.__ASSETS.
const assetUrl = (name) => (window.__ASSETS && window.__ASSETS[name]) || `./assets/hall/${name}`;

// Binary files are decoded straight from the inlined data URI. A sandboxed page (an artifact
// viewer, say) may forbid fetch() on data: URLs, so the single-file build never uses it.
async function assetBuffer(name) {
  const inline = window.__ASSETS && window.__ASSETS[name];
  if (inline) {
    const bytes = Uint8Array.from(atob(inline.slice(inline.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    return bytes.buffer;
  }
  const res = await fetch(assetUrl(name));
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.arrayBuffer();
}

const FLOOR_VERTEX = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vReflect;
  varying vec2 vBaked;
  varying vec3 vWorld;
  void main() {
    vReflect = textureMatrix * vec4(position, 1.0);
    vBaked = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// The baked floor has the light on it but no shine. The shine is added here: the room
// mirrored in a satin varnish, strongest at a low angle (Fresnel), blurred a little more
// the farther away it is.
const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform sampler2D tBaked;
  uniform float uShine;
  uniform float uBlur;
  varying vec4 vReflect;
  varying vec2 vBaked;
  varying vec3 vWorld;
  void main() {
    vec3 base = texture2D(tBaked, vBaked).rgb;
    base = mix(vec3(dot(base, vec3(0.299, 0.587, 0.114))), base, 0.78) * 0.94;   // paler, like the reference oak
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    float cosT = clamp(toEye.y / dist, 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
    vec2 uv = vReflect.xy / vReflect.w;
    float radius = uBlur * (0.35 + 0.05 * dist);
    vec3 refl = texture2D(tDiffuse, uv).rgb * 0.28;
    for (int i = 0; i < 8; i++) {
      float a = 0.785398 * float(i);
      refl += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * radius).rgb * 0.09;
    }
    refl *= color;
    vec3 col = mix(base, refl, clamp(fresnel * uShine, 0.0, 0.9));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function loadTexture(name, { flipY = false, srgb = true } = {}) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(assetUrl(name), (t) => {
      t.flipY = flipY;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(t);
    }, undefined, reject);
  });
}

// Builds the room into the scene. Resolves with { mirror } once everything has loaded;
// the gallery is usable immediately, and the room fills in as the files arrive.
export async function loadHall(renderer, scene, { reflections = true, onProgress = () => {} } = {}) {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const total = 7;
  let done = 0;
  const tick = (p) => p.then((v) => { onProgress(++done / total); return v; });

  const [gltf, shellTex, propsTex, exteriorTex, floorTex, skyTex, envHdr] = await Promise.all([
    tick(assetBuffer('hall.glb').then((buf) => new GLTFLoader().parseAsync(buf, ''))),
    tick(loadTexture(HALL.atlases.shell.file)),
    tick(loadTexture(HALL.atlases.props.file)),
    tick(loadTexture(HALL.atlases.exterior.file)),
    tick(loadTexture(HALL.atlases.floor.file)),
    tick(loadTexture(HALL.sky, { flipY: true })),
    tick(assetBuffer(HALL.env).then((buf) => {
      const data = new RGBELoader().parse(buf);
      const tex = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.flipY = true;
      tex.needsUpdate = true;
      return tex;
    })),
  ]);
  [shellTex, propsTex, exteriorTex, floorTex].forEach((t) => { t.anisotropy = maxAniso; });

  // Baked meshes: the texture is the finished picture, so no lights and no tone mapping.
  const bakedMaterial = (map, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ map, side, toneMapped: false });
  const materials = {
    HALL_shell: bakedMaterial(shellTex),
    HALL_props: bakedMaterial(propsTex, THREE.DoubleSide),
    HALL_exterior: bakedMaterial(exteriorTex),
    HALL_floor: bakedMaterial(floorTex),
  };

  const root = new THREE.Group();
  root.name = 'hall';
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  let mirror = null;
  meshes.forEach((mesh) => {
    const material = materials[mesh.name] || materials[mesh.parent?.name];
    if (!material) return;
    if (material === materials.HALL_floor) {
      if (!reflections) {
        mesh.material = material;
        root.add(mesh.clone());
      }
      return;
    }
    mesh.material = material;
    mesh.frustumCulled = true;
    root.add(mesh.clone());
  });

  if (reflections) {
    const { width, depth } = HALL.room;
    const T = 0.4;
    const geometry = new THREE.PlaneGeometry(width + 2 * T, depth + 2 * T);
    // glTF's texture origin is the top left, so the v coordinate runs the other way.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const size = Math.min(1024, Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 2) * 0.6));
    mirror = new Reflector(geometry, {
      color: 0xf2efe8,
      textureWidth: size,
      textureHeight: size,
      clipBias: 0.003,
      multisample: 2,
      shader: {
        name: 'SatinFloor',
        uniforms: {
          color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
          tBaked: { value: null }, uShine: { value: 0.1 }, uBlur: { value: 0.003 },
        },
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
      },
    });
    mirror.material.uniforms.tBaked.value = floorTex;
    mirror.rotation.x = -Math.PI / 2;
    root.add(mirror);
  }
  scene.add(root);

  // The far scenery behind the window: a panorama that follows the camera, so it never swims.
  scene.background = skyTex;
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.minFilter = THREE.LinearFilter;
  skyTex.generateMipmaps = false;

  // The room's own reflection, for the metal, the glass and the varnish on the live works.
  const pmrem = new THREE.PMREMGenerator(renderer);
  envHdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(envHdr).texture;
  scene.environmentIntensity = 1.0;
  envHdr.dispose();
  pmrem.dispose();

  return { mirror, root };
}

// The glass in front of a work: it adds only the room's reflection (a black dielectric,
// blended additively), clear head-on and mirror-like at a grazing angle.
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0x000000, roughness: 0.03, metalness: 0, envMapIntensity: 1.0,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});

export function frameGlass(width, height) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMaterial);
  mesh.renderOrder = 2;
  return mesh;
}

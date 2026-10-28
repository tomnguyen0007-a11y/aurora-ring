// Shared pipeline for motion paintings.
// Each painting is a GLSL body that writes one colour per pixel of its plate.
// The shader renders into a render target every frame, and that texture is
// wrapped in a lit-wall material. The glass in front of the frame (see hall.js) adds
// the room's reflections.
import * as THREE from 'three';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const HEADER = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + vec2(19.19, 7.37))); }

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

// Four-stop palette ramp, x in [0, 1].
vec3 ramp(float x) {
  x = clamp(x, 0.0, 1.0);
  if (x < 0.333) return mix(uC0, uC1, x * 3.0);
  if (x < 0.666) return mix(uC1, uC2, (x - 0.333) * 3.0);
  return mix(uC2, uC3, (x - 0.666) * 3.0);
}
`;

const FOOTER = /* glsl */ `
void main() {
  vec4 c = paint(vUv);
  // Static paper grain. It is fixed to the plate, so it never shimmers.
  float grain = hash(floor(vUv * uRes)) - 0.5;
  gl_FragColor = vec4(c.rgb + grain * 0.025, 1.0);
}`;

// Builds a painting definition into a reusable plate component.
export function createPainting(def, renderer, uRes = [1024, 1280], size = null) {
  const palette = def.palette.map((hex) => new THREE.Color(hex));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: HEADER + def.glsl + FOOTER,
    uniforms: {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(uRes[0], uRes[1]) },
      uC0: { value: palette[0] },
      uC1: { value: palette[1] },
      uC2: { value: palette[2] },
      uC3: { value: palette[3] },
    },
    depthTest: false,
    depthWrite: false,
  });

  const target = new THREE.WebGLRenderTarget(uRes[0], uRes[1], {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });

  const [w, h] = size || def.size;
  // The painting is lit like the wall around it: a spot from above, so the top of the work is a
  // touch brighter than the bottom. It goes through the scene's tone mapping with everything else.
  const surface = new THREE.ShaderMaterial({
    uniforms: { tPaint: { value: target.texture }, uGain: { value: 0.72 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tPaint;
      uniform float uGain;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tPaint, vUv).rgb;
        gl_FragColor = vec4(c * uGain * (0.84 + 0.16 * vUv.y), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), surface);

  return {
    meta: def.meta,
    canvas,
    material,
    target,
    surface,
    size: [w, h],
    // Redraw resolution: high for the focused work, low for small plates in the overview.
    setRes(width, height) {
      target.setSize(width, height);
      material.uniforms.uRes.value.set(width, height);
    },
    // Advances the painting to time t (seconds) and redraws it into its plate.
    update(t, quad, quadCamera, scene) {
      material.uniforms.uTime.value = t;
      quad.material = material;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, quadCamera);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      target.dispose();
      material.dispose();
      surface.dispose();
    },
  };
}

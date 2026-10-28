// Halftone: a dot screen whose dot size follows a moving field, red into blue.
export default {
  meta: {
    id: 'halftone',
    title: 'Halftone VIII',
    series: 'Print',
    medium: 'Generative shader, animated dot screen, varnished',
    year: '2026',
    note: 'Nothing here is a gradient. Every shade is a dot of a different size.',
  },
  size: [2.2, 2.75],
  palette: ['#101014', '#e8344e', '#2a5bd7', '#f6efe0'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.2;
  float field = 0.5 + 0.5 * sin(length(p - vec2(0.25 * sin(t), 0.2 * cos(t * 1.2))) * 7.0 - t * 2.0);
  field = mix(field, fbm(p * 3.0 + t * 0.3), 0.5);
  vec2 g = mat2(0.866, -0.5, 0.5, 0.866) * (p * 38.0);
  vec2 cell = fract(g) - 0.5;
  float r = 0.15 + 0.4 * field;
  float d = 1.0 - smoothstep(r - 0.05, r + 0.05, length(cell));
  vec3 ink = mix(uC1, uC2, field);
  return vec4(mix(uC3, ink, d), 1.0);
}`,
};

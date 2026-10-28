// Bloom: five soft discs drifting across a dark field, like light through glass.
export default {
  meta: {
    id: 'bloom',
    title: 'Bloom V',
    series: 'Colour Field',
    medium: 'Generative shader, drifting colour fields, varnished',
    year: '2026',
    note: 'Five slow discs passing through one another. Nothing is ever fully still.',
  },
  size: [2.2, 2.75],
  palette: ['#1a0f1f', '#8a2b4f', '#f08a4b', '#f7e6c4'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.08;
  vec3 col = uC0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * (0.7 + fi * 0.13) + fi * 2.1), cos(t * (0.5 + fi * 0.17) + fi * 1.7)) * 0.32;
    float r = 0.3 + 0.06 * sin(t + fi);
    float m = 1.0 - smoothstep(r * 0.2, r, length(p - c));
    col = mix(col, ramp(fi / 4.0), m * 0.85);
  }
  col += uC3 * 0.06 * (1.0 - length(p));
  return vec4(col, 1.0);
}`,
};

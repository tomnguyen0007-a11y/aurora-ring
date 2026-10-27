// Tide: layered horizon lines that breathe with the noise field.
export default {
  meta: {
    id: 'tide',
    title: 'Tide III',
    series: 'Drift',
    medium: 'Generative shader, layered wave lines, varnished',
    year: '2026',
    note: 'Twenty-four lines of different weight, moving at different speeds.',
  },
  size: [2.2, 2.75],
  palette: ['#0a1420', '#c2597a', '#6fb3a4', '#f5efe3'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec3 col = mix(uC0, uC0 * 1.8, uv.y);
  float t = uTime * 0.25;
  for (int k = 0; k < 24; k++) {
    float fk = float(k);
    float y0 = fk / 24.0;
    float n = fbm(vec2(uv.x * 2.0, fk * 0.3 + t * 0.2));
    float wave = sin(uv.x * 6.0 + fk * 0.45 + t + n * 2.5) * 0.05;
    float yy = y0 + wave * 0.5;
    float w = 0.0015 + 0.0035 * fract(fk * 0.618);
    float line = 1.0 - smoothstep(0.0, w, abs(uv.y - yy));
    vec3 c = mix(uC1, uC2, fract(fk * 0.37));
    col = mix(col, c, line * 0.9);
  }
  col = mix(col, uC3, smoothstep(0.92, 1.0, uv.y) * 0.15);
  return vec4(col, 1.0);
}`,
};

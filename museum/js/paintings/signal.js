// Signal: scanlines that tear on random rows, like a dying transmission.
export default {
  meta: {
    id: 'signal',
    title: 'Signal VI',
    series: 'Scan',
    medium: 'Generative shader, scanline distortion, varnished',
    year: '2026',
    note: 'Rows shift and flicker on their own clock. The bright lines are the signal.',
  },
  size: [2.2, 2.75],
  palette: ['#06100c', '#1f8a6a', '#b6f2d2', '#e8fff4'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  float t = uTime * 0.5;
  float band = floor(uv.y * 64.0);
  float n = hash(vec2(band, floor(t * 6.0)));
  float shift = (n - 0.5) * 0.12 * step(0.8, n);
  vec2 q = vec2(fract(uv.x + shift), uv.y);
  float wave = 0.5 + 0.5 * sin(q.x * 40.0 + uTime * 2.0 + band * 0.3);
  float scan = 0.85 + 0.15 * sin(uv.y * 900.0);
  vec3 col = mix(uC0, uC1, wave * wave);
  col = mix(col, uC2, smoothstep(0.92, 1.0, wave) * 0.9);
  col *= scan;
  col += uC3 * 0.6 * step(0.995, hash(vec2(floor(uv.x * 200.0), floor(t * 3.0))));
  return vec4(col, 1.0);
}`,
};

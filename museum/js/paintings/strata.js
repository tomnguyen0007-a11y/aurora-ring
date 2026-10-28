// Strata: sediment layers that fold and shift, with a dark seam between each.
export default {
  meta: {
    id: 'strata',
    title: 'Strata IX',
    series: 'Earth',
    after: 'Ochre, the oldest paint',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'Iron-rich earth was among the first pigments people ever used. Here it is laid down in slow layers, each one a different afternoon.',
    home: 'In a living room with linen and oak, where the earth tones feel at home.',
  },
  size: [2.2, 2.75],
  palette: ['#2b1d16', '#8a5a3a', '#d4a36a', '#f1e2c6'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.05;
  float h = p.y * 9.0 + 1.6 * fbm(vec2(p.x * 1.6, p.y * 0.9 + t)) + 0.3 * sin(p.x * 3.0 + t * 2.0);
  float band = floor(h);
  float f = fract(h);
  float id = hash(vec2(band, 3.0));
  vec3 col = ramp(id);
  col *= 0.8 + 0.25 * fbm(vec2(p.x * 20.0, h * 3.0));
  col = mix(col, uC0 * 0.5, smoothstep(0.92, 1.0, f) * 0.7);
  col += uC3 * 0.12 * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.08, 0.2, f));
  return vec4(col, 1.0);
}`,
};

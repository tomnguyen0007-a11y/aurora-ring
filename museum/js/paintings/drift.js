// Drift: domain-warped fbm. Slow, tidal, mostly ink with an ember glow.
export default {
  meta: {
    id: 'drift',
    title: 'Drift I',
    series: 'Marbling',
    after: 'Ebru paper marbling, 15th century',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'Look for the place where teal slides under amber. Marbling is the oldest way to make a painting nobody can repeat, and this one never settles.',
    home: 'Over a console in an entrance hall, where a passing glance catches a new pattern each day.',
  },
  size: [2.2, 2.75],
  palette: ['#0c1b2b', '#1d7a7e', '#e6793f', '#f3ead9'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.2;
  float t = uTime * 0.06;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.126 * t));
  float f = fbm(p + 4.0 * r);
  vec3 col = ramp(f * 1.1 - 0.05);
  col = mix(col, uC3, smoothstep(0.55, 1.0, length(r)) * 0.35);
  float glow = exp(-dot(p, p) * 0.9) * 0.35;
  col += uC2 * glow * (0.5 + 0.5 * sin(t * 4.0 + f * 6.0));
  return vec4(col, 1.0);
}`,
};

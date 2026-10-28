// Lattice: a warped grid of cobalt and coral lines around a dot at each cell centre.
export default {
  meta: {
    id: 'lattice',
    title: 'Lattice IV',
    series: 'Grid',
    after: 'The modernist grid, 1920s',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'A grid that refuses to stay straight. The order is still there, but it breathes.',
  },
  size: [2.2, 2.75],
  palette: ['#0f1115', '#2c4fd6', '#ff6a4d', '#f2efe8'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.3;
  vec2 w = p + 0.06 * vec2(sin(p.y * 5.0 + t), cos(p.x * 4.0 - t));
  vec2 g = fract(w * 9.0) - 0.5;
  float line = max(smoothstep(0.46, 0.5, abs(g.x)), smoothstep(0.46, 0.5, abs(g.y)));
  float dot = 1.0 - smoothstep(0.1, 0.16, length(g));
  vec3 col = mix(uC0, uC1, 0.5 + 0.5 * sin(t + p.y * 2.0));
  col = mix(col, uC2, line * 0.85);
  col = mix(col, uC3, dot * 0.9);
  return vec4(col, 1.0);
}`,
};

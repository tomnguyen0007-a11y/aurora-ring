// Fracture: drifting Voronoi cells with dark seams and gilt ground.
export default {
  meta: {
    id: 'fracture',
    title: 'Fracture II',
    series: 'Fracture',
    medium: 'Generative shader, animated Voronoi cells, varnished',
    year: '2026',
    note: 'Cells slowly reshape their seams. The edges are where the light sits.',
  },
  size: [2.2, 2.75],
  palette: ['#3a0f16', '#a2402a', '#d9a441', '#efe6d2'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 6.0;
  vec2 ip = floor(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(ip + g);
      o = 0.5 + 0.5 * sin(uTime * 0.35 + 6.2831 * o);
      vec2 r = g + o - fract(p);
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(ip + g);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float edge = smoothstep(0.0, 0.07, sqrt(d2) - sqrt(d1));
  vec3 col = ramp(id);
  col *= 0.75 + 0.35 * fbm(p * 0.6 + id * 10.0);
  col = mix(uC0 * 0.5, col, edge);
  // Gilt highlight on the seams, brighter where cells are crowded.
  col += uC2 * (1.0 - edge) * 0.25 * (1.0 - smoothstep(0.0, 0.5, d1));
  return vec4(col, 1.0);
}`,
};

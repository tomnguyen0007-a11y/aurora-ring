// Primary Divisions: black lines, three primaries and white, slowly rebalancing.
export default {
  meta: {
    id: 'grid',
    title: 'Primary Divisions',
    series: 'De Stijl',
    after: 'De Stijl, 1917',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'Black lines, three primary colours and white, rebalancing slowly. The rectangles trade space with each other, so the picture is never quite finished.',
    home: 'In a kitchen or living room, as the one confident splash of colour.',
  },
  size: [2.2, 2.75],
  palette: ['#101010', '#d1342a', '#1f3f9e', '#f3f0e8'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  float t = uTime * 0.05;
  float x1 = 0.30 + 0.04 * sin(t);
  float x2 = 0.68 + 0.04 * sin(t * 1.3 + 1.0);
  float y1 = 0.28 + 0.04 * sin(t * 0.9 + 2.0);
  float y2 = 0.62 + 0.05 * sin(t * 1.1);
  float y3 = 0.84 + 0.02 * sin(t * 0.7);
  vec3 yellow = vec3(0.94, 0.76, 0.12);
  vec3 col = uC3;
  col = mix(col, uC1, step(uv.x, x1) * step(y2, uv.y));
  col = mix(col, uC2, step(x2, uv.x) * step(uv.y, y1));
  col = mix(col, yellow, step(x2, uv.x) * step(y3, uv.y));
  float w = 0.008;
  float line = 0.0;
  line = max(line, 1.0 - smoothstep(w, w + 0.003, abs(uv.x - x1)));
  line = max(line, 1.0 - smoothstep(w, w + 0.003, abs(uv.x - x2)));
  line = max(line, 1.0 - smoothstep(w, w + 0.003, abs(uv.y - y1)));
  line = max(line, 1.0 - smoothstep(w, w + 0.003, abs(uv.y - y2)));
  line = max(line, (1.0 - smoothstep(w, w + 0.003, abs(uv.y - y3))) * step(x2, uv.x));
  col = mix(col, uC0, line);
  col *= 0.97 + 0.05 * fbm(uv * 8.0);
  return vec4(col, 1.0);
}`,
};

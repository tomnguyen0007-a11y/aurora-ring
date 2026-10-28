// Moire: two gratings, one straight and one concentric, turning against each other.
export default {
  meta: {
    id: 'moire',
    title: 'Moire VII',
    series: 'Op Art',
    after: 'Op Art, 1960s',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'Two patterns that barely move create shapes that are not on the canvas. Your eye does the painting.',
  },
  size: [2.2, 2.75],
  palette: ['#0c0c10', '#3a3fb8', '#ff3d6e', '#f4f1ea'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.12;
  float a = t * 0.5;
  float b = -t * 0.37;
  vec2 pa = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  vec2 pb = mat2(cos(b), -sin(b), sin(b), cos(b)) * (p + vec2(0.18 * sin(t), 0.12 * cos(t * 1.3)));
  float ga = 0.5 + 0.5 * sin(pa.x * 140.0);
  float gb = 0.5 + 0.5 * sin(length(pb) * 120.0);
  float m = smoothstep(0.35, 0.65, ga * gb + (1.0 - ga) * (1.0 - gb));
  vec3 col = mix(uC0, uC3, m);
  col = mix(col, uC1, smoothstep(0.0, 0.6, length(p)) * 0.25);
  col += uC2 * 0.25 * pow(abs(sin(length(p) * 9.0 - t * 3.0)), 8.0);
  return vec4(col, 1.0);
}`,
};

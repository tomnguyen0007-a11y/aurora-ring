// Sunrise in Dots: no colour is mixed, only placed side by side.
export default {
  meta: {
    id: 'dots',
    title: 'Sunrise in Dots',
    series: 'Colour theory',
    after: 'Pointillism, 1880s',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'No colour is mixed on a palette here. Pure dots sit side by side and your eye blends them into a sunrise.',
  },
  size: [2.2, 2.75],
  palette: ['#243a8c', '#2f9aa0', '#f08a3c', '#f2a5b5'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 g = vec2(uv.x * aspect, uv.y) * 46.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 jitter = (hash2(id) - 0.5) * 0.35;
  float r = 0.34 + 0.12 * hash(id + 7.0);
  float dotMask = 1.0 - smoothstep(r - 0.06, r, length(f - jitter));

  vec2 c = vec2((id.x + 0.5) / 46.0 / aspect, (id.y + 0.5) / 46.0);
  float t = uTime * 0.08;
  float horizon = 0.42 + 0.01 * sin(t * 2.0);
  vec2 sun = vec2(0.5 + 0.1 * sin(t), horizon + 0.07 + 0.05 * sin(t * 0.7));
  vec3 sky = mix(uC2, uC3, smoothstep(horizon, 0.7, c.y));
  sky = mix(sky, uC0, smoothstep(0.7, 1.0, c.y));
  float wave = 0.5 + 0.5 * sin(c.x * 40.0 + c.y * 60.0 + t * 6.0);
  vec3 sea = mix(uC1, uC0, smoothstep(horizon, 0.0, c.y));
  sea = mix(sea, uC2, wave * smoothstep(0.55, 0.0, abs(c.x - sun.x)) * 0.5 * smoothstep(0.0, horizon, c.y));
  vec3 col = c.y > horizon ? sky : sea;
  col = mix(col, vec3(1.0, 0.93, 0.6), 1.0 - smoothstep(0.07, 0.13, length(c - sun)));
  col *= 0.9 + 0.2 * hash(id);
  return vec4(mix(vec3(0.96, 0.93, 0.86), col, dotMask), 1.0);
}`,
};

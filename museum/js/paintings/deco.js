// Deco Fan: a gilt fan of arcs and rays, opening and closing.
export default {
  meta: {
    id: 'deco',
    title: 'Deco Fan',
    series: 'Ornament',
    after: 'Art Deco, 1920s',
    medium: 'Generative shader, varnished',
    year: '2026',
    note: 'A gilt fan that opens and closes slowly, the sunburst that decorated cinemas and ocean liners in the 1920s. Watch the rays move against each other.',
    home: 'Above a sideboard, where the teal and gold pick up brass and glass.',
  },
  size: [2.2, 2.75],
  palette: ['#0b1412', '#0f6b6b', '#d8a736', '#efe6cf'],
  glsl: /* glsl */ `
vec4 paint(vec2 uv) {
  vec2 p = vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.1);
  float t = uTime * 0.15;
  float r = length(p);
  float ang = atan(p.x, p.y) + 0.08 * sin(t);
  float inFan = (1.0 - smoothstep(1.25, 1.3, abs(ang))) * (1.0 - smoothstep(0.78, 0.8, r)) * step(0.0, p.y + 0.1);
  float radial = r * 9.0 + 0.4 * sin(t);
  float rayPos = (ang + 1.3) / 0.26;
  float chk = mod(floor(radial) + floor(rayPos), 2.0);
  vec3 fan = mix(uC0, uC1, chk);
  vec3 col = mix(uC3 * 0.94, fan, inFan);
  float fr = fract(radial);
  float lineR = 1.0 - smoothstep(0.0, 0.05, min(fr, 1.0 - fr));
  float fa = fract(rayPos);
  float lineA = 1.0 - smoothstep(0.0, 0.04, min(fa, 1.0 - fa));
  col = mix(col, uC2, max(lineR, lineA) * inFan);
  col *= 0.97 + 0.05 * fbm(uv * 7.0);
  return vec4(col, 1.0);
}`,
};

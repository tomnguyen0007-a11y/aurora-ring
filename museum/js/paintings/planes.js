// Floating Planes: a few flat shapes on an empty ground, adrift.
export default {
  meta: {
    id: 'planes',
    title: "Floating Planes",
    series: "Geometry",
    after: "Suprematism, 1915",
    medium: 'Live generative painting, behind glass',
    year: "90 × 115 cm",
    note: "In December 1915 Kazimir Malevich hung a black square in the corner of a Petrograd gallery, high up, where a Russian home keeps its icon. He wanted to know what a picture is once it stops showing things. A black bar, a red square and a blue slab float on an empty ground: still no subject, only balance.",
    home: "Alone on a wide white wall, with a metre of empty plaster all around it.",
  },
  size: [2.2, 2.75],
  palette: ['#efe9dc', '#d2352a', '#1b1b1d', '#2b4fa8'],
  glsl: /* glsl */ `
float shape(vec2 p, vec2 c, vec2 s, float a) {
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p - c);
  vec2 d = abs(q) - s;
  return 1.0 - smoothstep(0.0, 0.004, max(d.x, d.y));
}

vec4 paint(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.15;
  vec3 col = uC0;
  col = mix(col, uC2, shape(p, vec2(-0.08 + 0.05 * sin(t), 0.12 + 0.04 * cos(t * 0.8)), vec2(0.36, 0.06), -0.45 + 0.1 * sin(t * 0.7)));
  col = mix(col, uC1, shape(p, vec2(0.12 * sin(t * 0.6), -0.18), vec2(0.17, 0.17), 0.3 + 0.2 * sin(t * 0.5)));
  col = mix(col, uC3, shape(p, vec2(0.18 + 0.04 * cos(t), 0.3), vec2(0.07, 0.2), 0.9 + 0.1 * sin(t * 0.9)));
  float disc = 1.0 - smoothstep(0.0, 0.004, length(p - vec2(-0.2, -0.3 + 0.03 * sin(t))) - 0.1);
  col = mix(col, uC2, disc);
  col = mix(col, uC2, shape(p, vec2(0.0, -0.05), vec2(0.5, 0.004), 0.25 * sin(t * 0.4)));
  col = mix(col, uC1, shape(p, vec2(-0.24, 0.34 + 0.02 * sin(t * 1.3)), vec2(0.03, 0.03), 0.0));
  col *= 0.96 + 0.06 * fbm(p * 3.0);
  return vec4(col, 1.0);
}`,
};

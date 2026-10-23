/**
 * Moving looks for liquids (lava, water), shared by the planet's smooth surface (look.js) and the
 * droplets let loose in space (effects/Liquids.js): 3D value noise flowing with time, so no two
 * places — and no two droplets (each has its own `seed`) — look the same.
 *
 * LIQUID_TIME is the one clock (seconds) every liquid material reads; Game3D moves it on.
 */
export const LIQUID_TIME = { value: 0 };

/** GLSL: value noise and fbm in 3D, lava and water colours. */
export const LIQUID_GLSL = /* glsl */ `
float lqHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lqNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lqHash(i), lqHash(i + vec3(1, 0, 0)), f.x), mix(lqHash(i + vec3(0, 1, 0)), lqHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lqHash(i + vec3(0, 0, 1)), lqHash(i + vec3(1, 0, 1)), f.x), mix(lqHash(i + vec3(0, 1, 1)), lqHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lqFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * lqNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
// lava: dark crust cracked by glowing orange veins, slowly churning
vec3 lavaColor(vec3 p, float t) {
  vec3 q = vec3(lqFbm(p + vec3(0.0, t * 0.22, 0.0)), lqFbm(p + vec3(5.2, 1.3, t * 0.17)), 0.0);
  float n = lqFbm(p + 2.5 * vec3(q.xy, q.x * q.y) + vec3(t * 0.08));
  vec3 crust = vec3(0.16, 0.03, 0.01), hot = vec3(1.0, 0.36, 0.04), white = vec3(1.0, 0.86, 0.42);
  vec3 c = mix(crust, hot, smoothstep(0.38, 0.62, n));
  return mix(c, white, smoothstep(0.66, 0.82, n));
}
// water: brightness that ripples and drifts (0.75 … 1.35) and a glint now and then
float waterShade(vec3 p, float t) {
  float w = lqFbm(p + vec3(t * 0.35, -t * 0.12, t * 0.2));
  float r = 0.5 + 0.5 * sin(dot(p, vec3(4.0, 5.0, 3.0)) + t * 2.2 + w * 7.0);
  return 0.75 + 0.45 * w + 0.15 * r;
}
float waterGlint(vec3 p, float t) {
  float r = 0.5 + 0.5 * sin(dot(p, vec3(3.0, -4.0, 5.0)) * 1.3 - t * 1.7 + lqFbm(p * 1.5 + t * 0.3) * 6.0);
  // only here and there (patches drifting with the water), not stripes all over
  return pow(r, 16.0) * smoothstep(0.5, 0.7, lqFbm(p * 0.7 - vec3(t * 0.1)));
}
`;

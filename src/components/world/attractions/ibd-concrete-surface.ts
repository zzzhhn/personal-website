/** Metre-scale concrete joints and restrained aggregate, only on the marked paving top.
 * No texture allocation or animated uniforms. Derivative filtering removes fine grain at distance.
 */
export const IBD_CONCRETE_GLSL = /* glsl */`
float ibdConcreteHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float ibdConcreteNoise(vec2 p) {
  vec2 a = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ibdConcreteHash(a), ibdConcreteHash(a + vec2(1, 0)), f.x),
    mix(ibdConcreteHash(a + vec2(0, 1)), ibdConcreteHash(a + vec2(1, 1)), f.x), f.y);
}
// The installed Three bump-map chunk uses this surface-gradient construction.
// Here the height field is procedural, so there is no UV or texture dependency.
vec3 ibdConcreteNormal(vec3 position, vec3 surfaceNormal, float height, float faceSign) {
  vec3 dx = normalize(dFdx(position)), dy = normalize(dFdy(position));
  vec3 r1 = cross(dy, surfaceNormal), r2 = cross(surfaceNormal, dx);
  float determinant = dot(dx, r1) * faceSign;
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(determinant) * surfaceNormal - gradient);
}
`;

export const IBD_CONCRETE_COLOR = /* glsl */`
float ibdConcreteHeight = 0.0;
if (vIbdSurface.w > 1.5) {
  vec2 p = vIbdPavingXZ;
  // Offset poured bays, independent of the 2 m mesh cells used for light baking.
  p.x += mod(floor(p.y / 4.0), 2.0) * 2.5;
  vec2 bay = floor(p / vec2(5.0, 4.0));
  vec2 edge = abs(fract(p / vec2(5.0, 4.0) + .5) - .5) * vec2(5.0, 4.0);
  float distanceToJoint = min(edge.x, edge.y);
  float footprint = max(length(dFdx(vIbdPavingXZ)), length(dFdy(vIbdPavingXZ)));
  float filterWidth = max(.002, footprint);
  // Two-centimetre joints lose contrast when smaller than a pixel, avoiding distant stripes.
  float joint = (1.0 - smoothstep(.009, .009 + filterWidth, distanceToJoint))
    * min(1.0, .024 / filterWidth);
  float lip = (1.0 - smoothstep(.025, .075 + filterWidth, distanceToJoint)) * (1.0 - joint);
  float mottling = ibdConcreteNoise(vIbdPavingXZ * .65) - .5;
  float grainVisibility = 1.0 - smoothstep(.004, .022, footprint);
  float grain = (ibdConcreteHash(floor(vIbdPavingXZ * 70.0)) - .5) * grainVisibility;
  float bayTone = (ibdConcreteHash(bay) - .5) * .035;
  diffuseColor.rgb *= 1.0 + bayTone + mottling * .11 + grain * .065 + lip * .035 - joint * .32;
  ibdConcreteHeight = grain * .0007 - joint * .003;
}
`;

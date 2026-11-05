/** Outdoor exposed-aggregate concrete, in metres. Detail is filtered in screen
 * space, not animated; all paving stays on its original collision surface. */
export const COASTER_PAVING_GLSL = /* glsl */`
float intentPavingHeight = 0.0;
float pavingHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float pavingNoise(vec2 p) {
  vec2 c = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pavingHash(c), pavingHash(c + vec2(1,0)), f.x),
    mix(pavingHash(c + vec2(0,1)), pavingHash(c + vec2(1,1)), f.x), f.y);
}
IntentFinish intentPaving(vec3 pigment, vec3 p, vec3 n) {
  if (n.y < .8) return IntentFinish(pigment * .86, .94, 0.0);
  vec2 xz = p.xz - vec2(16.0, -140.0);
  float pixel = max(length(dFdx(xz)), length(dFdy(xz)));
  float aa = max(.001, pixel);
  // Large cast bays, staggered cross-joints. They are saw cuts, not tile grout.
  vec2 grid = xz;
  grid.x += mod(floor(grid.y / 3.6), 2.0) * 2.7;
  vec2 cell = floor(grid / vec2(5.4, 3.6));
  vec2 edge = min(fract(grid / vec2(5.4,3.6)), 1.0-fract(grid / vec2(5.4,3.6))) * vec2(5.4,3.6);
  float jointDistance = min(edge.x, edge.y);
  float joint = (1.0-smoothstep(.006, .006+aa, jointDistance)) * min(1.0,.019/aa);
  float shoulder = (1.0-smoothstep(.025,.11+aa,jointDistance)) * (1.0-joint);
  float cloud = pavingNoise(xz*.53);
  float castGrain = pavingNoise(xz*2.7 + vec2(12.3,7.1));
  float aggregate = pavingNoise(xz*28.0);
  float aggregateVisible = 1.0-smoothstep(.024,.11,pixel);
  float pores = pavingHash(floor(xz*165.0));
  float poresVisible = 1.0-smoothstep(.002,.014,pixel);
  float stone = smoothstep(.53,.8,aggregate) * aggregateVisible;
  float pit = (1.0-smoothstep(.18,.34,aggregate)) * aggregateVisible;
  // The entrance-to-gate aisle is cleaner and worn smoother than the sides.
  float pathDistance = (p.x-48.0+(p.z+130.0)*.12)/3.8;
  float path = exp(-pathDistance*pathDistance);
  float dust = (1.0-path) * smoothstep(.3,.75,cloud) * .10;
  vec3 concrete = pigment * (1.0 + (cloud-.5)*.19 + (castGrain-.5)*.085
    + (pavingHash(cell)-.5)*.026 + stone*.10 - pit*.14
    + (pores-.5)*poresVisible*.09 + shoulder*.035 - joint*.55);
  concrete = mix(concrete, concrete*vec3(1.05,1.015,.94), dust);
  intentPavingHeight = (aggregate-.5)*.0035*aggregateVisible
    + (pores-.5)*.0012*poresVisible - joint*.005 - shoulder*.0007;
  return IntentFinish(concrete, clamp(.86 + (castGrain-.5)*.11 + pit*.07 - path*.025, .76,.96), 0.0);
}
vec3 intentPavingNormal(vec3 eyePosition, vec3 surfaceNormal, float height, float faceSign) {
  vec3 dx = dFdx(eyePosition), dy = dFdy(eyePosition);
  vec3 r1 = cross(dy,surfaceNormal), r2 = cross(surfaceNormal,dx);
  float determinant = dot(dx,r1)*faceSign;
  vec3 gradient = sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
  return normalize(abs(determinant)*surfaceNormal-gradient);
}
`;

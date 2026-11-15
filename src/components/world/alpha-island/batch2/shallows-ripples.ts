/** Eight fixed vec4 slots: local X/Z, game-time age, active. No render objects or timers. */
export const SHALLOWS_RIPPLE_SLOTS = 8;
export const SHALLOWS_RIPPLE_SECONDS = 1.4;
export const createShallowsRipples = () => ({ values: new Float32Array(SHALLOWS_RIPPLE_SLOTS * 4), active: { value: 0 }, pending: 0 });
export type ShallowsRipples = ReturnType<typeof createShallowsRipples>;
export function clearShallowsRipples(ripples: ShallowsRipples) {
  ripples.values.fill(0); ripples.active.value = 0; ripples.pending = 0;
}
/** Only freshly advanced mechanism motion can earn an effect. Clearing on pause/leave
 * discards a final-pose confirmation that would otherwise replay on returning. */
export function armShallowsRipple(ripples: ShallowsRipples, index: number) {
  if (Number.isInteger(index) && index >= 0 && index < SHALLOWS_RIPPLE_SLOTS) ripples.pending |= 1 << index;
}
/** Call only after the existing arrival receipt confirms the actual final body pose. */
export function takeShallowsRipple(ripples: ShallowsRipples, index: number, x: number, z: number) {
  if (!Number.isInteger(index) || index < 0 || index >= SHALLOWS_RIPPLE_SLOTS || !Number.isFinite(x) || !Number.isFinite(z)
    || !(ripples.pending & (1 << index))) return false;
  ripples.pending &= ~(1 << index);
  ripples.values.set([x, z, 0, 1], index * 4);
  ripples.active.value = 1;
  return true;
}
export function stepShallowsRipples(ripples: ShallowsRipples, delta: number, active: boolean) {
  if (!active) { clearShallowsRipples(ripples); return; }
  if (!Number.isFinite(delta) || delta <= 0) return;
  const dt = Math.min(delta, .05);
  let activeSlots = 0;
  for (let i = 0; i < SHALLOWS_RIPPLE_SLOTS; i++) {
    const at = i * 4;
    if (!ripples.values[at + 3]) continue;
    ripples.values[at + 2] = Math.min(SHALLOWS_RIPPLE_SECONDS, ripples.values[at + 2] + dt);
    if (ripples.values[at + 2] >= SHALLOWS_RIPPLE_SECONDS - 1e-6) ripples.values[at + 3] = 0;
    if (ripples.values[at + 3]) activeSlots = 1;
  }
  ripples.active.value = activeSlots;
}

/** Localized normal disturbance on the existing water, never a separate ring mesh. */
export const SHALLOWS_RIPPLE_SHADER = `
uniform vec4 uShallowsRipples[${SHALLOWS_RIPPLE_SLOTS}];
uniform float uShallowsRippleActive;
float shallowsImpactHeight(vec2 p) {
  if (uShallowsRippleActive < .5) return 0.;
  float height = 0.;
  for (int i = 0; i < ${SHALLOWS_RIPPLE_SLOTS}; i++) {
    vec4 ripple = uShallowsRipples[i];
    if (ripple.w < .5) continue;
    float distanceToImpact = length(p - ripple.xy);
    if (distanceToImpact > 3.) continue;
    float age = ripple.z, offset = distanceToImpact - (.85 + age * 1.2);
    float fade = pow(max(0., 1. - age / ${SHALLOWS_RIPPLE_SECONDS.toFixed(1)}), 2.) * smoothstep(0., .07, age);
    height += sin(offset * 7.) * exp(-pow(offset / .38, 2.)) * fade * .018;
  }
  return height;
}
`;

/** Validate Three's injection boundaries instead of silently accepting a changed shader layout. */
export function withShallowsRippleShader(fragment: string) {
  const roughness = '#include <roughnessmap_fragment>', normals = '#include <normal_fragment_maps>';
  if (fragment.indexOf(roughness) < 0 || fragment.indexOf(normals) < fragment.indexOf(roughness)) throw new Error('Shallows water shader injection boundaries changed');
  return SHALLOWS_RIPPLE_SHADER + fragment.replace(roughness, `${roughness}\nfloat alphaImpactHeight=shallowsImpactHeight(vAlphaP.xz);`)
    .replace(normals, `${normals}
      if (uShallowsRippleActive > .5) {
        vec3 impactDx=dFdx(-vViewPosition),impactDy=dFdy(-vViewPosition);
        vec3 impactRx=cross(impactDy,normal),impactRy=cross(normal,impactDx);
        float impactDet=dot(impactDx,impactRx);
        normal=normalize(max(abs(impactDet),.000001)*normal-sign(impactDet)*(dFdx(alphaImpactHeight)*impactRx+dFdy(alphaImpactHeight)*impactRy));
      }`);
}

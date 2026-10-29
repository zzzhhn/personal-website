/** Finite-depth linear wave packets. Metres and seconds; not a full fluid solver.
 * Long waves move the basin surface, short waves only shade it (avoid mesh aliasing).
 * GPU Gems, Effective Water Simulation from Physical Models, section 1.2. */
export const POOL_WAVE_DEPTH = .65;
export const POOL_WAVES = [
  { length: 9.3, amplitude: .025, angle: .64, phase: .3, geometry: true },
  { length: 6.1, amplitude: .015, angle: 1.04, phase: 2.1, geometry: true },
  { length: 2.2, amplitude: .008, angle: -.28, phase: 4.3, geometry: false },
  { length: .75, amplitude: .0035, angle: 2.35, phase: 1.4, geometry: false },
] as const;

export function waterDispersion(length: number, depth: number) {
  const k = 2 * Math.PI / length, kd = k * depth;
  const omega = Math.sqrt(9.81 * k * Math.tanh(kd));
  const speed = omega / k;
  return { k, omega, speed, groupSpeed: speed * .5 * (1 + 2 * kd / Math.sinh(2 * kd)) };
}

/** Numerical reference for height/normal consistency and bounded-motion checks. */
export function samplePoolWaves(x: number, z: number, time: number, wind = 1, geometryOnly = false) {
  let height = 0, dx = 0, dz = 0;
  for (const w of POOL_WAVES) {
    if (geometryOnly && !w.geometry) continue;
    const d = waterDispersion(w.length, POOL_WAVE_DEPTH), ux = Math.cos(w.angle), uz = Math.sin(w.angle);
    const along = x * ux + z * uz, phase = d.k * along - d.omega * time + w.phase;
    const groupK = d.k * .19, group = groupK * (along - d.groupSpeed * time) + w.phase * 2.7;
    const envelope = .72 + .28 * Math.cos(group), envelopeSlope = -.28 * groupK * Math.sin(group);
    const a = w.amplitude * wind;
    height += a * envelope * Math.sin(phase);
    const slope = a * (envelope * d.k * Math.cos(phase) + envelopeSlope * Math.sin(phase));
    dx += ux * slope; dz += uz * slope;
  }
  return { height, dx, dz };
}

export function poolWaveGlsl(geometryOnly = false) {
  const f = (n: number) => n.toFixed(8);
  const waves = POOL_WAVES.filter(w => !geometryOnly || w.geometry).map(w => {
    const d = waterDispersion(w.length, POOL_WAVE_DEPTH);
    return `poolWavePacket(p,time,vec2(${f(Math.cos(w.angle))},${f(Math.sin(w.angle))}),${f(d.k)},${f(d.omega)},${f(d.groupSpeed)},${f(w.amplitude)},${f(w.phase)},field);`;
  }).join('\n');
  return /* glsl */`
void poolWavePacket(vec2 p,float time,vec2 direction,float k,float omega,float groupSpeed,float amplitude,float offset,inout vec3 field){
  float along=dot(p,direction),phase=k*along-omega*time+offset;
  float groupK=k*.19,group=groupK*(along-groupSpeed*time)+offset*2.7;
  float envelope=.72+.28*cos(group),s=sin(phase);
  field.xy+=direction*amplitude*(envelope*k*cos(phase)-.28*groupK*sin(group)*s);
  field.z+=amplitude*envelope*s;
}
vec3 poolWindField(vec2 p,float time,float wind){
  vec3 field=vec3(0.);
  ${waves}
  return field*wind;
}`;
}

import { Vector4 } from 'three';

export const WATER_IMPACT_CAPACITY = 8;
export const WATER_IMPACT_LIFETIME = 2.8;
export type WaterContact = { id: string; x: number; y: number; z: number; bottom: number; radius: number; kind: 'player' | 'vehicle' };
export type WaterImpact = { x: number; z: number; y: number; at: number; strength: number; radius: number; splash: number; vx?: number; vz?: number };
type History = { x: number; z: number; bottom: number; wet: boolean; y: number; distance: number; last: number };

/** Physical contact is sampled once from the existing actor tracker. Rendering consumes a
 * fixed ring buffer; standing still is not a perpetual fountain. No per-impact timers or scene objects. */
export class WaterContactSystem {
  readonly impacts: WaterImpact[] = Array.from({ length: WATER_IMPACT_CAPACITY }, () => ({ x: 0, z: 0, y: 0, at: -100, strength: 0, radius: 0, splash: 0 }));
  private history = new Map<string, History>();
  private cursor = 0;
  private lastTime = -1;
  emitted = 0;
  emit(impact: WaterImpact) {
    // Thrown objects/entry impulses must not inherit the overwritten wake's direction.
    Object.assign(this.impacts[this.cursor], {vx:0,vz:0}, impact);
    this.cursor = (this.cursor + 1) % WATER_IMPACT_CAPACITY;
    this.emitted++;
  }
  reset() { this.history.clear(); this.cursor = 0; this.lastTime = -1; this.emitted = 0; for (const p of this.impacts) p.strength = 0; }
  step(actors: readonly WaterContact[], time: number, surface: (x: number, z: number) => number | null) {
    if (!Number.isFinite(time) || time === this.lastTime) return;
    const dt = this.lastTime < 0 ? 0 : Math.min(.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    for (const a of actors) {
      const y = surface(a.x, a.z);
      const wet = y !== null && a.bottom < y + .06 && a.y + a.radius > y - .2;
      const old = this.history.get(a.id);
      const distance = old ? Math.hypot(a.x - old.x, a.z - old.z) : 0;
      // Recovery, portals, and spawn jumps must not spray a line across the island.
      const teleported = distance > 4 || (!!old && Math.abs(a.bottom - old.bottom) > 4);
      const speed = dt > 0 ? distance / dt : 0;
      const fall = old && dt > 0 ? Math.max(0, (old.bottom - a.bottom) / dt) : 0;
      const h = old ?? { x: a.x, z: a.z, bottom: a.bottom, wet: false, y: y ?? 0, distance: 0, last: -10 };
      if (wet && !teleported) {
        h.distance += distance;
        const entry = !h.wet || Math.abs((y ?? 0) - h.y) > .1;
        const wake = h.distance > (a.kind === 'player' ? .42 : .85) && time - h.last > .18;
        if (entry || wake) {
          const strength = Math.min(1, (entry ? .5 : .24) + speed * .045 + fall * .055);
          this.emit({ x: a.x, z: a.z, y: y!, at: time, strength,
            radius: a.kind === 'player' ? .12 : Math.min(1.2, a.radius * .5), splash: entry ? Math.min(1, .32 + fall * .11) : Math.min(.38, speed * .04),
            vx: !entry && old && distance>.001 ? (a.x-old.x)/distance*Math.min(12,speed) : 0,
            vz: !entry && old && distance>.001 ? (a.z-old.z)/distance*Math.min(12,speed) : 0 });
          h.distance = 0; h.last = time;
        }
      } else h.distance = 0;
      h.x = a.x; h.z = a.z; h.bottom = a.bottom; h.wet = wet; h.y = y ?? 0;
      this.history.set(a.id, h);
    }
    for (const id of this.history.keys()) if (!actors.some(a => a.id === id)) this.history.delete(id);
  }
}

export const waterContacts = new WaterContactSystem();
export const waterImpactUniforms = {
  uWaterImpact: { value: Array.from({ length: WATER_IMPACT_CAPACITY }, () => new Vector4(0, 0, -100, 0)) },
  uWaterImpactMeta: { value: Array.from({ length: WATER_IMPACT_CAPACITY }, () => new Vector4()) },
  uWaterImpactMotion: { value: Array.from({ length: WATER_IMPACT_CAPACITY }, () => new Vector4()) },
};
export function publishWaterImpacts(time: number) {
  waterContacts.impacts.forEach((p, i) => {
    const alive = time - p.at >= 0 && time - p.at < WATER_IMPACT_LIFETIME;
    waterImpactUniforms.uWaterImpact.value[i].set(p.x, p.z, p.at, alive ? p.strength : 0);
    waterImpactUniforms.uWaterImpactMeta.value[i].set(p.y, p.radius, p.splash, 0);
    waterImpactUniforms.uWaterImpactMotion.value[i].set(p.vx??0,p.vz??0,0,0);
  });
}

/** Returns surface slope x/z, height, and a short broken foam crest. World-space positions
 * and surface elevation keep the pool's wake out of the sea below it. */
export const WATER_IMPACT_GLSL = /* glsl */`
uniform vec4 uWaterImpact[${WATER_IMPACT_CAPACITY}];
uniform vec4 uWaterImpactMeta[${WATER_IMPACT_CAPACITY}];
uniform vec4 uWaterImpactMotion[${WATER_IMPACT_CAPACITY}];
// Two diverging wave packets trail a moving body. Their envelope travels at group
// velocity while crests travel at phase velocity; this is not a chain of painted rings.
vec3 waterWakeLobe(vec2 delta,vec2 direction,float age,float strength){
  vec2 side=vec2(-direction.y,direction.x);
  float along=dot(delta,direction),across=dot(delta,side);
  float width=.44+age*.22,spread=.32+age*.36;
  float q=along-age*.715,r2=q*q/(width*width)+across*across/(spread*spread);
  if(r2>9.)return vec3(0.);
  float envelope=exp(-r2-age*.9)*strength*.032/(1.+age);
  float phase=along*4.8-age*6.862,crest=sin(phase);
  vec2 slope=direction*(4.8*cos(phase)-2.*q/(width*width)*crest)-side*(2.*across/(spread*spread)*crest);
  return vec3(slope*envelope,crest*envelope);
}
vec4 waterDisturbance(vec2 p, float surfaceY, float time) {
  vec4 result = vec4(0.0);
  for (int i = 0; i < ${WATER_IMPACT_CAPACITY}; i++) {
    vec4 a = uWaterImpact[i]; vec4 meta = uWaterImpactMeta[i];
    float age = time - a.z;
    if (a.w <= 0.0 || age < 0.0 || age > ${WATER_IMPACT_LIFETIME.toFixed(1)} || abs(surfaceY - meta.x) > 0.35) continue;
    vec2 delta = p - a.xy; float r = length(delta);
    if(r>meta.y+age*1.65+1.)continue;
    vec2 motion=uWaterImpactMotion[i].xy;float speed=length(motion);
    if(speed>.05){
      vec2 forward=motion/speed,side=vec2(-forward.y,forward.x);
      vec3 wake=waterWakeLobe(delta,-forward*.4+side*.916515,age,a.w)
        +waterWakeLobe(delta,-forward*.4-side*.916515,age,a.w);
      result.xyz+=wake;
      result.w+=abs(wake.z)*6.*max(0.,1.-age/.85);
      // Brief aeration near the foot/body, never a bright moving circular outline.
      result.w+=exp(-r*r*16.)*max(0.,1.-age/.3)*meta.z*a.w*.3;
      continue;
    }
    // Entry and dropped objects can radiate outward; spreading and damping remove energy.
    float front = meta.y + age * .62;
    float d = r - front;
    float width=.24+age*.12,invWidth=1./(width*width);
    if (abs(d) > width*3.) continue;
    float envelope = exp(-d*d*invWidth-age*1.1) * a.w/sqrt(1.+r);
    float phase=(r-meta.y)*6.4-age*7.924,wave=sin(phase);
    float slope = (6.4*cos(phase)-(2.*d*invWidth+.5/(1.+r))*wave) * envelope * .022;
    result.xy += delta/max(r,0.02) * slope;
    result.z += wave * envelope * .022;
    result.w += exp(-r*r*8.)*max(0.,1.-age/.45)*meta.z*a.w;
  }
  return result;
}`;

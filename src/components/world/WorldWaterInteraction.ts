import { Vector4 } from 'three';

export const WATER_IMPACT_CAPACITY = 8;
export const WATER_IMPACT_LIFETIME = 2.8;
export type WaterContact = { id: string; x: number; y: number; z: number; bottom: number; radius: number; kind: 'player' | 'vehicle' };
export type WaterImpact = { x: number; z: number; y: number; at: number; strength: number; radius: number; splash: number };
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
    Object.assign(this.impacts[this.cursor], impact);
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
            radius: a.kind === 'player' ? .12 : Math.min(1.2, a.radius * .5), splash: entry ? Math.min(1, .32 + fall * .11) : Math.min(.38, speed * .04) });
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
};
export function publishWaterImpacts(time: number) {
  waterContacts.impacts.forEach((p, i) => {
    const alive = time - p.at >= 0 && time - p.at < WATER_IMPACT_LIFETIME;
    waterImpactUniforms.uWaterImpact.value[i].set(p.x, p.z, p.at, alive ? p.strength : 0);
    waterImpactUniforms.uWaterImpactMeta.value[i].set(p.y, p.radius, p.splash, 0);
  });
}

/** Returns surface slope x/z, height, and a short broken foam crest. World-space positions
 * and surface elevation keep the pool's wake out of the sea below it. */
export const WATER_IMPACT_GLSL = /* glsl */`
uniform vec4 uWaterImpact[${WATER_IMPACT_CAPACITY}];
uniform vec4 uWaterImpactMeta[${WATER_IMPACT_CAPACITY}];
vec4 waterDisturbance(vec2 p, float surfaceY, float time) {
  vec4 result = vec4(0.0);
  for (int i = 0; i < ${WATER_IMPACT_CAPACITY}; i++) {
    vec4 a = uWaterImpact[i]; vec4 meta = uWaterImpactMeta[i];
    float age = time - a.z;
    if (a.w <= 0.0 || age < 0.0 || age > ${WATER_IMPACT_LIFETIME.toFixed(1)} || abs(surfaceY - meta.x) > 0.35) continue;
    vec2 delta = p - a.xy; float r = length(delta);
    float front = meta.y + age * 1.65;
    float d = r - front;
    if (abs(d) > 0.8) continue;
    float envelope = exp(-d*d*13.0) * exp(-age*1.1) * a.w;
    float wave = sin(d*13.0);
    float slope = (13.0*cos(d*13.0)-26.0*d*wave) * envelope * 0.025;
    result.xy += delta/max(r,0.02) * slope;
    result.z += wave * envelope * 0.025;
    result.w += envelope * (1.0-smoothstep(0.0,0.16,abs(d))) * max(0.0,1.0-age/1.3);
  }
  return result;
}`;

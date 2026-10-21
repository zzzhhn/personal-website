import { Matrix4, PropertyBinding, Quaternion, Vector3, type Bone, type Interpolant, type Object3D, type SkinnedMesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Locomotion phase model for the G24 guide, precomputed once from the loaded GLB.
 *
 * It answers one question for Walk<->Run crossfades: at which target clip time does the
 * displayed, blended pose keep every grounded sole vertex in place for the whole fade?
 * The prediction replays the crossfade the way AnimationMixer does it (per-bone local TRS,
 * slerp-accumulated rotations, linear weight ramps) through forward kinematics of the leg
 * chains, and measures the same deformed rigid-sole vertices and 6 mm band that runtime QA
 * uses (including WorldGuide's 1.5 mm / 2.5 cm blend-dip lift). It does not lock feet, add IK,
 * loosen thresholds or shorten fades; when nothing fits it says so.
 *
 * Model space is the parent of the skeleton's top bone (the G24 root node), +X forward, +Y up,
 * ground at y = 0. Nothing here touches the live scene or skins meshes per frame.
 */

export type GuideSide = 'left' | 'right';
/** 'uniform': clip time advances by travel / authored speed (current WorldGuide).
 * 'contact': clip time advances by travel / planted-sole speed of the clip at that phase. */
export type PhaseTiming = 'uniform' | 'contact';
export interface PhaseClipState { clip: string; time: number; weight: number }
export interface GuidePhaseOptions {
  /** Ground speed (m per clip second at timeScale 1) of every locomotion clip, e.g. { Walk: 1.5, Run: 4.2 }. */
  authoredSpeed: Record<string, number>;
  /** Clips to tabulate; non-locomotion clips (no authored speed) may be sources only. */
  clips?: string[];
  /** Table samples per clip (default 240; G24 clips are keyed at 60 Hz, so the table is finer than the keys). */
  samples?: number;
  /** Contact band above the physical sole plane, metres (default 0.006, same as QA). */
  band?: number;
  /** WorldGuide blend-dip lift: y += clamp(liftTarget - minSole, 0, liftMax). */
  liftTarget?: number;
  liftMax?: number;
}
export interface EntryRequest {
  /** Every action currently contributing to the displayed pose, with its effective weight. */
  sources: readonly PhaseClipState[];
  target: string;
  /** Measured ground speed now (m/s) and, optionally, the speed expected at the end of the fade. */
  speed: number;
  speedEnd?: number;
  fade: number;
  timing?: PhaseTiming;
  /** Accept only if predicted sole drift <= tolerance (default 0.012 m). Not a QA threshold. */
  tolerance?: number;
  /** Simulation step (default 1/60 s). */
  stepDt?: number;
}
export interface EntryResult {
  accepted: boolean;
  /** Best target clip time found (also when not accepted), or null when no support window exists. */
  time: number | null;
  /** Predicted maximum horizontal drift of any grounded sole vertex across the fade, metres. */
  drift: number;
  side: GuideSide | null;
  reason: 'ok' | 'no-support' | 'no-window' | 'over-tolerance' | 'unknown-clip';
  evaluated: number;
}

const FLOATS = 10; // position xyz, quaternion xyzw, scale xyz
const SIDES: GuideSide[] = ['left', 'right'];
const FOOT = { left: /^foot[._]?L$/, right: /^foot[._]?R$/ };

interface ClipTable {
  name: string; duration: number; samples: number; authored: number;
  trs: Float32Array;     // samples * bones * FLOATS
  minY: Float32Array;    // samples * 2, lowest contact-candidate vertex per side (model y, no lift)
  speed: Float32Array;   // samples, ground speed implied by the planted sole (m per clip second)
}

export class GuidePhaseModel {
  readonly band: number;
  readonly liftTarget: number;
  readonly liftMax: number;
  readonly contactVertexCount: Record<GuideSide, number>;
  private readonly bones: Bone[];
  private readonly parent: Int16Array;
  private readonly rest: Float32Array;
  private readonly footIndex: Record<GuideSide, number>;
  private readonly local: Record<GuideSide, Float32Array>;
  private readonly skinToModel = new Matrix4();
  private readonly tables = new Map<string, ClipTable>();
  // scratch, reused by every evaluation
  private readonly model: Matrix4[];
  private readonly foot: Record<GuideSide, Matrix4> = { left: new Matrix4(), right: new Matrix4() };
  private readonly verts: Record<GuideSide, Float32Array>;
  private readonly blend = new Float32Array(FLOATS);
  private readonly sample = new Float32Array(FLOATS);
  private readonly tp = new Vector3(); private readonly tq = new Quaternion(); private readonly ts = new Vector3();
  private readonly tm = new Matrix4(); private readonly tv = new Vector3();
  private stClip: ClipTable[] = []; private stTime = new Float64Array(8); private stWeight = new Float64Array(8); private stCount = 0;

  static fromGLTF(gltf: GLTF, options: GuidePhaseOptions) { return new GuidePhaseModel(gltf, options); }

  constructor(gltf: GLTF, options: GuidePhaseOptions) {
    this.band = options.band ?? .006;
    this.liftTarget = options.liftTarget ?? .0015;
    this.liftMax = options.liftMax ?? .025;
    const samples = options.samples ?? 240;
    gltf.scene.updateMatrixWorld(true);
    const meshes: SkinnedMesh[] = [];
    gltf.scene.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh); });
    if (!meshes.length) throw new Error('GuidePhaseModel: no skinned mesh');
    const skeleton = meshes[0].skeleton;
    const feet = {} as Record<GuideSide, Bone>;
    for (const side of SIDES) {
      const bone = skeleton.bones.find(b => FOOT[side].test(b.name));
      if (!bone) throw new Error(`GuidePhaseModel: missing foot bone (${side})`);
      feet[side] = bone;
    }
    // Leg chains from the top bone down to each foot; parents always precede children.
    const chains = SIDES.map(side => {
      const chain: Bone[] = [];
      for (let n: Object3D | null = feet[side]; n && (n as Bone).isBone; n = n.parent) chain.unshift(n as Bone);
      return chain;
    });
    this.bones = [];
    for (const chain of chains) for (const b of chain) if (!this.bones.includes(b)) this.bones.push(b);
    this.parent = Int16Array.from(this.bones.map(b => this.bones.indexOf(b.parent as Bone)));
    this.footIndex = { left: this.bones.indexOf(feet.left), right: this.bones.indexOf(feet.right) };
    this.model = this.bones.map(() => new Matrix4());
    this.rest = new Float32Array(this.bones.length * FLOATS);
    this.bones.forEach((b, i) => this.writeTRS(this.rest, i * FLOATS, b.position, b.quaternion, b.scale));

    // Rigid sole vertices (>= 98 % foot weight), expressed in the foot bone's model frame.
    const modelRoot = this.bones[0].parent!;
    const rootInv = modelRoot.matrixWorld.clone().invert();
    const candidates: Record<GuideSide, number[]> = { left: [], right: [] };
    const seen = new Set<string>();
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.getAttribute('skinIndex'), wt = mesh.geometry.getAttribute('skinWeight');
      if (!pos || !idx || !wt) continue;
      // model = R^-1 * meshWorld * bindInverse * R * footModel * (boneInverse * bind * v)
      this.skinToModel.copy(rootInv).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(modelRoot.matrixWorld);
      for (let i = 0; i < pos.count; i++) for (const side of SIDES) {
        const boneId = mesh.skeleton.bones.indexOf(feet[side]);
        let w = 0;
        for (let k = 0; k < 4; k++) if (idx.getComponent(i, k) === boneId) w += wt.getComponent(i, k);
        if (w < .98) continue;
        this.tv.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[boneId]);
        const key = `${side}:${this.tv.x.toFixed(4)}:${this.tv.y.toFixed(4)}:${this.tv.z.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates[side].push(this.tv.x, this.tv.y, this.tv.z);
      }
    }
    this.local = { left: Float32Array.from(candidates.left), right: Float32Array.from(candidates.right) };
    this.verts = { left: new Float32Array(this.local.left.length), right: new Float32Array(this.local.right.length) };

    const names = options.clips ?? ['Idle', 'Walk', 'Run'];
    for (const name of names) {
      const clip = gltf.animations.find(c => c.name === name);
      if (!clip) continue;
      const interps: (Interpolant | null)[] = [];
      for (const b of this.bones) for (const prop of ['position', 'quaternion', 'scale']) {
        const track = clip.tracks.find(t => { const p = PropertyBinding.parseTrackName(t.name); return p.nodeName === b.name && p.propertyName === prop; });
        // Same interpolant the mixer builds for this track (LINEAR for G24; quaternion tracks slerp).
        interps.push(track ? (track as unknown as { createInterpolant(): Interpolant }).createInterpolant() : null);
      }
      const trs = new Float32Array(samples * this.bones.length * FLOATS);
      for (let s = 0; s < samples; s++) {
        const t = clip.duration * s / samples;
        for (let b = 0; b < this.bones.length; b++) {
          const o = (s * this.bones.length + b) * FLOATS;
          trs.set(this.rest.subarray(b * FLOATS, b * FLOATS + FLOATS), o);
          const [ip, iq, is] = [interps[b * 3], interps[b * 3 + 1], interps[b * 3 + 2]];
          if (ip) trs.set(ip.evaluate(t).subarray(0, 3), o);
          if (iq) trs.set(iq.evaluate(t).subarray(0, 4), o + 3);
          if (is) trs.set(is.evaluate(t).subarray(0, 3), o + 7);
        }
      }
      this.tables.set(name, { name, duration: clip.duration, samples, authored: options.authoredSpeed[name] ?? 0, trs,
        minY: new Float32Array(samples * 2), speed: new Float32Array(samples) });
    }

    // Keep only vertices that reach the support region (within 1 cm of the pose's lowest sole
    // point) in some tabulated pose: heel, toe and outer sole, not the boot shaft.
    const keep: Record<GuideSide, Set<number>> = { left: new Set(), right: new Set() };
    for (const table of this.tables.values()) for (let s = 0; s < table.samples; s++) {
      this.loadSingle(table, table.duration * s / table.samples);
      this.evaluate();
      const low = Math.min(this.vertsMin('left'), this.vertsMin('right'));
      for (const side of SIDES) { const v = this.verts[side]; for (let k = 0; k < v.length / 3; k++) if (v[k * 3 + 1] <= low + .01) keep[side].add(k); }
    }
    for (const side of SIDES) {
      const src = this.local[side], out: number[] = [];
      for (const k of [...keep[side]].sort((a, b) => a - b)) out.push(src[k * 3], src[k * 3 + 1], src[k * 3 + 2]);
      this.local[side] = Float32Array.from(out);
      this.verts[side] = new Float32Array(out.length);
    }
    this.contactVertexCount = { left: this.local.left.length / 3, right: this.local.right.length / 3 };
    if (!this.contactVertexCount.left || !this.contactVertexCount.right) throw new Error('GuidePhaseModel: no sole contact vertices');

    // Per-sample support heights and planted-sole ground speed.
    for (const table of this.tables.values()) {
      const n = table.samples, h = table.duration / n;
      const xs: Record<GuideSide, Float32Array[]> = { left: [], right: [] }, corr = new Float32Array(n);
      for (let s = 0; s < n; s++) {
        this.loadSingle(table, table.duration * s / n);
        this.evaluate();
        for (const side of SIDES) { table.minY[s * 2 + SIDES.indexOf(side)] = this.vertsMin(side); xs[side].push(this.verts[side].slice()); }
        corr[s] = this.lift(Math.min(table.minY[s * 2], table.minY[s * 2 + 1]));
      }
      if (!table.authored) { table.speed.fill(0); continue; }
      let contactDistance = 0, flight = 0;
      for (let s = 0; s < n; s++) {
        const s1 = (s + 1) % n;
        let best: { v: number; count: number } | null = null;
        for (const side of SIDES) {
          const a = xs[side][s], b = xs[side][s1];
          let lo = Infinity, hi = -Infinity, count = 0;
          for (let k = 0; k < a.length / 3; k++) {
            if (a[k * 3 + 1] + corr[s] > this.band || b[k * 3 + 1] + corr[s1] > this.band) continue;
            const v = -(b[k * 3] - a[k * 3]) / h;
            lo = Math.min(lo, v); hi = Math.max(hi, v); count++;
          }
          // Mid-range minimises the largest slip among the vertices touching the ground.
          if (count && (!best || count > best.count)) best = { v: (lo + hi) / 2, count };
        }
        if (best) { table.speed[s] = Math.min(1.6 * table.authored, Math.max(.5 * table.authored, best.v)); contactDistance += table.speed[s] * h; }
        else { table.speed[s] = NaN; flight++; }
      }
      // Flight samples absorb the remainder of the authored stride (keeps cycle length).
      const rest = flight ? (table.authored * table.duration - contactDistance) / (flight * h) : 0;
      for (let s = 0; s < n; s++) if (Number.isNaN(table.speed[s])) table.speed[s] = rest > .25 * table.authored ? rest : table.authored;
    }
  }

  duration(clip: string) { return this.tables.get(clip)?.duration ?? 0; }
  /** Planted-sole ground speed of a clip at a clip time (m per clip second); QA/diagnostics. */
  contactSpeed(clip: string, time: number) { const t = this.tables.get(clip); return t ? t.speed[this.index(t, time)] : 0; }

  /** Clip time after the body travels `travel` metres (or `dt` seconds for non-locomotion clips). Unwrapped. */
  advance(clip: string, time: number, travel: number, dt: number, timing: PhaseTiming = 'uniform') {
    const t = this.tables.get(clip);
    if (!t || !t.authored) return time + dt;
    if (timing === 'uniform') return time + travel / t.authored;
    const n = t.samples, h = t.duration / n;
    let u = ((time % t.duration) + t.duration) % t.duration / h, left = travel, out = time;
    for (let guard = 0; left > 1e-9 && guard < 4 * n; guard++) {
      const i = Math.floor(u) % n, part = 1 - (u - Math.floor(u)), v = t.speed[i], room = part * h * v;
      if (room >= left) { out += left / v; left = 0; } else { out += part * h; left -= room; u = Math.floor(u) + 1; }
    }
    return out;
  }
  /** Effective timeScale for an action this frame (set with action.setEffectiveTimeScale). */
  timeScale(clip: string, time: number, travel: number, dt: number, timing: PhaseTiming = 'uniform') {
    return (this.advance(clip, time, travel, dt, timing) - time) / Math.max(dt, 1e-6);
  }

  /** Support side of the current blended pose, or null when no sole is within the band. */
  supportSide(sources: readonly PhaseClipState[]): GuideSide | null {
    if (!this.loadStates(sources)) return null;
    this.evaluate();
    const l = this.vertsMin('left'), r = this.vertsMin('right'), lift = this.lift(Math.min(l, r));
    const side: GuideSide = l <= r ? 'left' : 'right';
    return Math.min(l, r) + lift <= this.band ? side : null;
  }

  /** Best target time for a crossfade from `sources` into `target`. Cost: ~0.5-3 ms; call only on switch requests. */
  findEntry(req: EntryRequest): EntryResult {
    const target = this.tables.get(req.target);
    const fail = (reason: EntryResult['reason'], side: GuideSide | null = null): EntryResult => ({ accepted: false, time: null, drift: Infinity, side, reason, evaluated: 0 });
    if (!target || !target.authored || req.sources.some(s => !this.tables.has(s.clip))) return fail('unknown-clip');
    const side = this.supportSide(req.sources);
    if (!side) return fail('no-support');
    const timing = req.timing ?? 'uniform', step = req.stepDt ?? 1 / 60, tolerance = req.tolerance ?? .012;
    const travel = .5 * (req.speed + (req.speedEnd ?? req.speed)) * req.fade;
    const n = target.samples, h = target.duration / n;
    const found = { drift: Infinity, time: NaN, evaluated: 0 };
    const tryTime = (t: number) => {
      found.evaluated++;
      const d = this.simulate(req, target, t, side, timing, step, found.drift);
      if (d < found.drift) { found.drift = d; found.time = t; }
    };
    for (let s = 0; s < n; s++) {
      const t = target.duration * s / n;
      // The target must hold the same support foot through the fade on its own.
      if (!this.stance(target, t, side) || !this.stance(target, this.advance(target.name, t, travel / 2, req.fade / 2, timing), side)
        || !this.stance(target, this.advance(target.name, t, travel, req.fade, timing), side)) continue;
      tryTime(t);
    }
    if (!Number.isFinite(found.drift)) return { ...fail('no-window', side), evaluated: found.evaluated };
    // Sub-sample refinement around the best grid time (table keys are 60 Hz; grid is finer).
    for (let delta = h / 2; delta > h / 16; delta /= 2) { const c = found.time; tryTime(c - delta); tryTime(c + delta); }
    const time = ((found.time % target.duration) + target.duration) % target.duration, ok = found.drift <= tolerance;
    return { accepted: ok, time, drift: found.drift, side, reason: ok ? 'ok' : 'over-tolerance', evaluated: found.evaluated };
  }

  /** Predicted drift (m) for a given entry time; Infinity if the support foot lifts mid-fade. */
  predictDrift(req: EntryRequest, entryTime: number) {
    const target = this.tables.get(req.target), side = this.supportSide(req.sources);
    if (!target || !side) return Infinity;
    return this.simulate(req, target, entryTime, side, req.timing ?? 'uniform', req.stepDt ?? 1 / 60, Infinity);
  }

  // ---------------------------------------------------------------- internals
  private simulate(req: EntryRequest, target: ClipTable, entry: number, side: GuideSide, timing: PhaseTiming, step: number, budget: number) {
    const steps = Math.max(1, Math.ceil(req.fade / step)), total = steps + 2;
    const srcCount = req.sources.length, times = new Float64Array(srcCount + 1), weights = new Float64Array(srcCount + 1);
    let weightSum = 0;
    req.sources.forEach((s, i) => { times[i] = s.time; weightSum += Math.max(0, s.weight); });
    times[srcCount] = entry;
    const nl = this.local.left.length / 3, nr = this.local.right.length / 3;
    const first = new Float32Array((nl + nr) * 2), active = new Uint8Array(nl + nr);
    let x = 0, worst = 0;
    for (let k = 0; k <= total; k++) {
      const elapsed = k * step, w = Math.min(1, elapsed / req.fade);
      for (let i = 0; i < srcCount; i++) weights[i] = weightSum > 0 ? Math.max(0, req.sources[i].weight) / weightSum * (1 - w) : 0;
      weights[srcCount] = w;
      this.stCount = 0;
      for (let i = 0; i <= srcCount; i++) if (weights[i] > 1e-6) this.pushState(i < srcCount ? this.tables.get(req.sources[i].clip)! : target, times[i], weights[i]);
      this.evaluate();
      const l = this.vertsMin('left'), r = this.vertsMin('right'), lift = this.lift(Math.min(l, r));
      if (k <= steps && (side === 'left' ? l : r) + lift > this.band) return Infinity;
      let o = 0;
      for (const s of SIDES) {
        const v = this.verts[s];
        for (let i = 0; i < v.length / 3; i++, o++) {
          if (v[i * 3 + 1] + lift > this.band) { active[o] = 0; continue; }
          const gx = v[i * 3] + x, gz = v[i * 3 + 2];
          if (!active[o]) { active[o] = 1; first[o * 2] = gx; first[o * 2 + 1] = gz; continue; }
          const d = Math.hypot(gx - first[o * 2], gz - first[o * 2 + 1]);
          if (d > worst) { worst = d; if (worst >= budget) return worst; }
        }
      }
      const speed = req.speed + ((req.speedEnd ?? req.speed) - req.speed) * Math.min(1, elapsed / req.fade);
      const travel = speed * step;
      x += travel;
      for (let i = 0; i < srcCount; i++) times[i] = this.advance(req.sources[i].clip, times[i], travel, step, timing);
      times[srcCount] = this.advance(target.name, times[srcCount], travel, step, timing);
    }
    return worst;
  }

  private lift(minSole: number) { return Math.min(this.liftMax, Math.max(0, this.liftTarget - minSole)); }
  private index(t: ClipTable, time: number) { return Math.floor((((time % t.duration) + t.duration) % t.duration) / t.duration * t.samples) % t.samples; }
  private stance(t: ClipTable, time: number, side: GuideSide) {
    const u = (((time % t.duration) + t.duration) % t.duration) / t.duration * t.samples, i = Math.floor(u) % t.samples, j = (i + 1) % t.samples, f = u - Math.floor(u);
    const l = t.minY[i * 2] * (1 - f) + t.minY[j * 2] * f, r = t.minY[i * 2 + 1] * (1 - f) + t.minY[j * 2 + 1] * f;
    return (side === 'left' ? l : r) + this.lift(Math.min(l, r)) <= this.band;
  }
  private loadSingle(table: ClipTable, time: number) { this.stCount = 0; this.pushState(table, time, 1); }
  private loadStates(states: readonly PhaseClipState[]) {
    this.stCount = 0;
    for (const s of states) { const t = this.tables.get(s.clip); if (!t) return false; if (s.weight > 1e-6) this.pushState(t, s.time, s.weight); }
    return this.stCount > 0;
  }
  private pushState(table: ClipTable, time: number, weight: number) {
    if (this.stCount >= this.stTime.length) { const grow = this.stCount * 2; const t = new Float64Array(grow), w = new Float64Array(grow); t.set(this.stTime); w.set(this.stWeight); this.stTime = t; this.stWeight = w; }
    this.stClip[this.stCount] = table; this.stTime[this.stCount] = time; this.stWeight[this.stCount] = weight; this.stCount++;
  }
  private vertsMin(side: GuideSide) { const v = this.verts[side]; let m = Infinity; for (let i = 1; i < v.length; i += 3) m = Math.min(m, v[i]); return m; }
  private writeTRS(out: Float32Array, o: number, p: Vector3, q: Quaternion, s: Vector3) {
    out[o] = p.x; out[o + 1] = p.y; out[o + 2] = p.z; out[o + 3] = q.x; out[o + 4] = q.y; out[o + 5] = q.z; out[o + 6] = q.w; out[o + 7] = s.x; out[o + 8] = s.y; out[o + 9] = s.z;
  }
  /** Interpolated table TRS of one bone into this.sample (lerp; shortest-arc nlerp for rotation). */
  private sampleBone(t: ClipTable, time: number, bone: number) {
    const u = (((time % t.duration) + t.duration) % t.duration) / t.duration * t.samples, i = Math.floor(u) % t.samples, j = (i + 1) % t.samples, f = u - Math.floor(u);
    const a = (i * this.bones.length + bone) * FLOATS, b = (j * this.bones.length + bone) * FLOATS, d = t.trs, out = this.sample;
    const dot = d[a + 3] * d[b + 3] + d[a + 4] * d[b + 4] + d[a + 5] * d[b + 5] + d[a + 6] * d[b + 6], sign = dot < 0 ? -1 : 1;
    for (let k = 0; k < FLOATS; k++) out[k] = d[a + k] * (1 - f) + (k >= 3 && k <= 6 ? sign : 1) * d[b + k] * f;
    const len = Math.hypot(out[3], out[4], out[5], out[6]) || 1;
    out[3] /= len; out[4] /= len; out[5] /= len; out[6] /= len;
  }
  /** Mixer-equivalent blend of the loaded states, FK of the leg chains, contact vertices in model space. */
  private evaluate() {
    const out = this.blend;
    for (let b = 0; b < this.bones.length; b++) {
      let sum = 0;
      for (let s = 0; s < this.stCount; s++) {
        const w = this.stWeight[s];
        this.sampleBone(this.stClip[s], this.stTime[s], b);
        const smp = this.sample;
        if (sum === 0) { for (let k = 0; k < FLOATS; k++) out[k] = smp[k]; sum = w; continue; }
        sum += w;
        const mix = w / sum;
        // PropertyMixer: positions/scales lerp; quaternions slerp-accumulate by weight / running sum.
        for (const k of [0, 1, 2, 7, 8, 9]) out[k] += (smp[k] - out[k]) * mix;
        Quaternion.slerpFlat(out as unknown as number[], 3, out as unknown as number[], 3, smp as unknown as number[], 3, mix);
      }
      if (sum === 0) out.set(this.rest.subarray(b * FLOATS, b * FLOATS + FLOATS));
      this.tp.set(out[0], out[1], out[2]); this.tq.set(out[3], out[4], out[5], out[6]); this.ts.set(out[7], out[8], out[9]);
      this.tm.compose(this.tp, this.tq, this.ts);
      const p = this.parent[b];
      if (p < 0) this.model[b].copy(this.tm); else this.model[b].multiplyMatrices(this.model[p], this.tm);
    }
    for (const side of SIDES) {
      this.foot[side].multiplyMatrices(this.skinToModel, this.model[this.footIndex[side]]);
      const e = this.foot[side].elements, src = this.local[side], dst = this.verts[side];
      for (let i = 0; i < src.length; i += 3) {
        const x = src[i], y = src[i + 1], z = src[i + 2];
        dst[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
        dst[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        dst[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
    }
  }
}

/** Bounded-wait gate for locomotion switches. Timeouts are counted and exposed, never treated as matches. */
export class PhaseGate {
  pending: string | null = null;
  pendingSeconds = 0;
  timeouts = 0;
  last: EntryResult | null = null;
  readonly maxWait: number;
  constructor(maxWait = .2) { this.maxWait = maxWait; }
  /** Call every frame while `desired` differs from the current locomotion clip. */
  request(desired: string, dt: number, solve: () => EntryResult) {
    if (this.pending !== desired) { this.pending = desired; this.pendingSeconds = 0; }
    const result = this.last = solve();
    if (result.accepted) { this.clear(); return { switchNow: true, entry: result.time, timedOut: false, result }; }
    this.pendingSeconds += dt;
    if (this.pendingSeconds < this.maxWait) return { switchNow: false, entry: null, timedOut: false, result };
    this.timeouts++;
    this.clear();
    // Best available entry (lowest predicted drift), still reported as a timeout.
    return { switchNow: true, entry: result.time, timedOut: true, result };
  }
  clear() { this.pending = null; this.pendingSeconds = 0; }
}

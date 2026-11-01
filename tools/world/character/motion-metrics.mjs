/** G24 motion metrics from the per-frame guide recorder (WorldGuide worldGuideRecord).
 *
 * slip: a sole vertex is "planted" while it stays within 6 mm of its ground; its horizontal travel over
 *   each continuous planted interval (consecutive frames, grounded, not Air/Start) is measured.
 *   Spec A3: steady <= 17.2 mm; start/stop <= 8 cm; switches <= 4 cm.
 * pose jump: per frame, the largest model-space joint second difference (|x[i]-2x[i-1]+x[i-2]|), i.e. how
 *   much a joint's per-frame motion changed. A pop is a spike above the steady motion's own value; we
 *   report the max within +-2 frames of every clip switch and the steady 99th percentile.
 * float/sink: per stance sample (clip contact >= 0.5, grounded, not air) the lowest sole height above its
 *   probed ground, per foot (spec 10.1 clarification 2026-10-22 17:12).
 */
export function slipIntervals(frames, band = 0.006) {
  const active = new Map(), out = [];
  let prevT = -1, prevF = null, prevTurn = false;
  for (const f of frames) {
    // Turn-in-place frames (body yaw rate > 1 rad/s at < 0.5 m/s) are reported separately (turnSlip):
    // there the whole body, feet included, is rotated about the root by design (ART-LOCK v3.3).
    const yaw = f.shownYaw ?? f.facing, previousYaw = prevF?.shownYaw ?? prevF?.facing;
    const elapsed = prevF ? Math.max(1e-3, f.t - prevF.t) : 1;
    const yawRate = prevF ? Math.abs(Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw))) / elapsed : 0;
    const displaySpeed = prevF?.root && f.root ? Math.hypot(f.root[0]-prevF.root[0], f.root[2]-prevF.root[2])/elapsed : f.speed;
    const turning = yawRate > 1 && Math.max(f.speed, displaySpeed) < .5;
    prevF = f;
    if (f.cut || !f.grounded || /Air|Start/.test(f.anim) || f.t - prevT > 0.05 || turning !== prevTurn) { for (const v of active.values()) out.push(v); active.clear(); }
    prevT = f.t; prevTurn = turning;
    const seen = new Set();
    for (const [id, x, z, h] of f.soles) {
      if (h > band) continue;
      seen.add(id);
      const a = active.get(id);
      if (!a) active.set(id, { id, t0: f.t, t1: f.t, x0: x, z0: z, drift: 0, anims: new Set([f.anim]), turning });
      else { a.t1 = f.t; a.drift = Math.max(a.drift, Math.hypot(x - a.x0, z - a.z0)); a.anims.add(f.anim); }
    }
    for (const [id, a] of active) if (!seen.has(id)) { out.push(a); active.delete(id); }
  }
  for (const v of active.values()) out.push(v);
  return out.filter(v => v.t1 - v.t0 >= 0.05).map(v => ({ ...v, anims: [...v.anims].join('>') }));
}

export function poseJumps(frames) {
  const acc = [];
  for (let i = 2; i < frames.length; i++) {
    const a = frames[i - 2].joints, b = frames[i - 1].joints, c = frames[i].joints;
    if (!a || !b || !c || frames[i].cut || frames[i-1].cut || frames[i].t - frames[i - 2].t > 0.06) { acc.push(null); continue; }
    let m = 0, bone = -1;
    for (let j = 0; j < c.length; j += 3) {
      const d = Math.hypot(c[j] - 2 * b[j] + a[j], c[j + 1] - 2 * b[j + 1] + a[j + 1], c[j + 2] - 2 * b[j + 2] + a[j + 2]);
      if (d > m) { m = d; bone = j / 3; }
    }
    acc.push({ i, t: frames[i].t, d: m, bone, anim: frames[i].anim, prev: frames[i - 1].anim });
  }
  return acc;
}

export const BONES = ['root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'upperarm.R', 'forearm.R', 'hand.R', 'upperarm.L', 'forearm.L', 'hand.L', 'thigh.R', 'shin.R', 'foot.R', 'thigh.L', 'shin.L', 'foot.L'];

export function summarize(frames, boneNames = BONES) {
  const all = slipIntervals(frames), slips = all.filter(s => !s.turning), turnSlips = all.filter(s => s.turning);
  const by = {};
  for (const s of slips) { const r = by[s.anims] ??= { n: 0, max_mm: 0 }; r.n++; r.max_mm = Math.max(r.max_mm, +(s.drift * 1000).toFixed(1)); }
  const jumps = poseJumps(frames).filter(Boolean);
  const sw = [], steady = [], switches = [];
  for (let k = 0; k < jumps.length; k++) {
    const near = jumps.slice(Math.max(0, k - 2), k + 3).some(x => x.anim !== x.prev);
    (near ? sw : steady).push(jumps[k]);
    if (jumps[k].anim !== jumps[k].prev) {
      const w = jumps.slice(Math.max(0, k - 2), k + 3).reduce((a, b) => (b.d > a.d ? b : a));
      switches.push({ t: jumps[k].t, from: jumps[k].prev, to: jumps[k].anim, maxJump_mm: +(w.d * 1000).toFixed(1), bone: boneNames[w.bone] ?? w.bone });
    }
  }
  const pct = (arr, p) => { if (!arr.length) return 0; const s = arr.map(x => x.d).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const stance = [];
  for (const f of frames) {
    if (!f.grounded || /Air|Start/.test(f.anim) || !f.contact) continue;
    const per = [Infinity, Infinity];
    for (const [id, , , h] of f.soles) { const side = id >= 1000000 ? 1 : 0; per[side] = Math.min(per[side], h); }
    for (const side of [0, 1]) if (f.contact[side] >= 0.5 && Number.isFinite(per[side])) stance.push(per[side]);
  }
  return {
    frames: frames.length,
    slipByAnim: by,
    turnSlipMax_mm: +(Math.max(0, ...turnSlips.map(s => s.drift)) * 1000).toFixed(1),
    slipMax_mm: +(Math.max(0, ...slips.map(s => s.drift)) * 1000).toFixed(1),
    worstSlips: [...slips].sort((a, b) => b.drift - a.drift).slice(0, 6).map(s => ({ t0: s.t0, t1: s.t1, mm: +(s.drift * 1000).toFixed(1), anims: s.anims })),
    poseJumpSteadyP99_mm: +(pct(steady, 0.99) * 1000).toFixed(1),
    poseJumpSwitchMax_mm: +(Math.max(0, ...sw.map(x => x.d)) * 1000).toFixed(1),
    stanceSamples: stance.length,
    stanceMinH_mm: stance.length ? +(Math.min(...stance) * 1000).toFixed(1) : null,
    stanceMaxH_mm: stance.length ? +(Math.max(...stance) * 1000).toFixed(1) : null,
    switches,
  };
}

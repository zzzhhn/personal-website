/** Pure slope report reducer. Retain legacy height-window totals; never censor sole heights. */
export function summarizeSlope(frames) {
  const st = [], missing = [];
  for (const f of frames) {
    if (!f.grounded || /Air|Start/.test(f.anim) || !f.contact) continue;
    const per = [Infinity, Infinity];
    for (const [id, , , h] of f.soles) { const side = id >= 1000000 ? 1 : 0; per[side] = Math.min(per[side], h); }
    for (const side of [0, 1]) if (f.contact[side] >= .5) {
      const slope = f.slope?.[side ? 'right' : 'left'] ?? null;
      const row = { t: f.t, side, h: per[side], anim: f.anim, stepping: !!f.stepping?.[side], slope, pelvisDrop: f.slope?.pelvisDrop, y: f.root[1] };
      if (Number.isFinite(row.h)) st.push(row); else missing.push({ ...row, h: null });
    }
  }
  const stats = arr => ({ n: arr.length, maxFloat_mm: arr.length ? +(Math.max(...arr.map(s => s.h)) * 1000).toFixed(1) : null,
    maxSink_mm: arr.length ? +(Math.min(...arr.map(s => s.h)) * 1000).toFixed(1) : null,
    floatOver20: arr.filter(s => s.h > .02).length, sinkOver15: arr.filter(s => s.h < -.015).length });
  const legacy = st.filter(s => s.y > 1.4 && s.y < 4.6);
  // Ground ownership is the foot's actual tilted probe plane, never the actor's root height.
  // Keep every old window sample in the headline union, including probe gaps / edge cases.
  const onProbedRamp = s => !!s.slope?.hit && !!s.slope?.plane && s.slope.slopeDeg > 1;
  const onRamp = st.filter(s => onProbedRamp(s) || (s.y > 1.4 && s.y < 4.6));
  const byClipCurve = stats(onRamp);
  return {
    membership: 'union of legacy root-height window and actual tilted foot probe; all stance separately retained',
    byClipCurve, excludingStopStepSwing: stats(onRamp.filter(s => !s.stepping)),
    legacyHeightWindow: { byClipCurve: stats(legacy), excludingStopStepSwing: stats(legacy.filter(s => !s.stepping)) },
    probedRamp: stats(st.filter(onProbedRamp)), allStance: stats(st),
    unclassified: { stats: stats(st.filter(s => !s.slope?.hit || !s.slope?.plane)), missingSoleCount: missing.length, missingSoles: missing },
    floatsByAnim: onRamp.filter(s => s.h > .02).reduce((a, s) => { const k = s.anim + (s.stepping ? '(stop-step swing)' : ''); a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    stance: { samples: st.length, rampSamples: onRamp.length, ...byClipCurve,
      worst: onRamp.filter(s => !s.stepping).sort((a, b) => b.h - a.h).slice(0, 8).map(s => ({ t: s.t, side: s.side, mm: +(s.h * 1000).toFixed(1), anim: s.anim,
        reachError: s.slope?.reachError, pelvisDrop: s.pelvisDrop, shift: s.slope?.shift, maxShift: s.slope?.maxShift })) },
  };
}

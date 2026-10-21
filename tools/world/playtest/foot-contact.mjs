/** Measure the same deformed boot vertices while they stay near the foot plane.
 * A changing lowest vertex is not a trajectory. Contact intervals end when a
 * vertex lifts off, a sampling gap exceeds 150 ms, or the scenario changes.
 */
export function footContactEvidence(samples) {
  const phaseStart = new Map();
  for (const s of samples) if (!phaseStart.has(s.label)) phaseStart.set(s.label, s.t);
  const summarize = steadyOnly => {
    const active = new Map(), phases = {};
    let previousLabel = null, previousT = -Infinity;
    for (const s of samples) {
      if (!s.actor || !s.snapshot) continue;
      const row = phases[s.label] ??= { samples: 0, continuousPairs: 0, maxStep_m: 0, maxIntervalDrift_m: 0, maxIntervalArc_m: 0, worstArc: null, longestInterval_s: 0, worst: null };
      if (s.label !== previousLabel || s.t - previousT > .15) active.clear();
      previousLabel = s.label; previousT = s.t;
      if (steadyOnly && s.t - phaseStart.get(s.label) < .5) { active.clear(); continue; }
      if (!s.snapshot.grounded || s.actor.airborne) { active.clear(); continue; }
      row.samples++;
      const present = new Set();
      for (const side of ['left', 'right']) for (const point of s.actor.contactVertices?.[side] ?? []) {
        const key = `${side}:${point.id}`, p = point.position;
        present.add(key);
        const prev = active.get(key);
        if (prev) {
          const step = Math.hypot(p[0] - prev.last[0], p[2] - prev.last[2]);
          const drift = Math.hypot(p[0] - prev.start[0], p[2] - prev.start[2]);
          prev.arc += step;
          if (prev.arc > row.maxIntervalArc_m) {
            row.maxIntervalArc_m = prev.arc;
            row.worstArc = { startT: prev.startT, t: s.t, side, vertex: point.id, start: prev.start, end: p };
          }
          row.continuousPairs++;
          row.maxStep_m = Math.max(row.maxStep_m, step);
          row.longestInterval_s = Math.max(row.longestInterval_s, s.t - prev.startT);
          if (drift > row.maxIntervalDrift_m) {
            row.maxIntervalDrift_m = drift;
            row.worst = { startT: prev.startT, t: s.t, side, vertex: point.id, start: prev.start, end: p, animation: s.actor.animation, speed: s.actor.speedMps };
          }
          prev.last = p;
        } else active.set(key, { start: p, last: p, startT: s.t, arc: 0 });
      }
      for (const key of active.keys()) if (!present.has(key)) active.delete(key);
    }
    return phases;
  };
  const steady = summarize(true), includingTransitions = summarize(false);
  const threshold_m = .01 * 1.72;
  return {
    method: 'stable deformed vertex IDs within 6 mm of collider foot plane; finite sampling, no slope IK claim',
    steadyDefinition: 'at least 0.5 s after each commanded phase begins; turning/start/stop retained separately',
    threshold_m, steady, includingTransitions,
    steadyWalkRunPassed: ['walk', 'run'].every(k => steady[k]?.continuousPairs >= 2 && steady[k].longestInterval_s >= .05 && steady[k].maxIntervalDrift_m <= threshold_m),
  };
}

import type { Vec3 } from './types';
import type { VehicleLanding } from './safe-landing';

/** Road-centre candidates, with road heading rather than the car's ocean-facing heading.
 * These are proposals only: every selected landing still needs a live physics clearance check. */
export function roadLandingCandidates(position: Vec3, roads: readonly Vec3[]): VehicleLanding[] {
  const points: VehicleLanding[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < roads.length; i++) {
    const a = roads[i - 1], b = roads[i], dx = b[0] - a[0], dz = b[2] - a[2];
    const length = Math.hypot(dx, dz); if (length < 1) continue;
    const projected = Math.max(0, Math.min(1, ((position[0] - a[0]) * dx + (position[2] - a[2]) * dz) / (length * length)));
    // Include interior alternatives: the nearest point may be a bridge end, occupied, or too steep.
    for (const t of [projected, .25, .5, .75]) {
      const p: Vec3 = [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
      const key = `${p[0].toFixed(1)},${p[2].toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key); points.push({ position: p, yaw: Math.atan2(-dz, dx) });
    }
  }
  return points.sort((a, b) => Math.hypot(a.position[0] - position[0], a.position[2] - position[2]) - Math.hypot(b.position[0] - position[0], b.position[2] - position[2]));
}

/** A gate arrival cannot immediately bounce back. Require both elapsed time and walking away. */
export function portalRearmed(cooldown: number, position: Vec3, gates: readonly { position: Vec3 }[]) {
  return cooldown <= 0 && gates.every(g => Math.hypot(g.position[0] - position[0], g.position[2] - position[2]) > 3.5);
}

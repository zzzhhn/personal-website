/** Writes probes.json for physics.mjs from WorldLandform (rendered/collided mesh heights). */
import { writeFileSync } from 'node:fs';
import { meshHeight, campRadius, terrainHeight } from '../../../src/components/world/WorldLandform';
import { CAMP_CENTER } from '../../../src/components/world/layout';
const pts: [number, number, number][] = [];
// Flat-ish probes: beaches, island top, camp plateau, dune foot (local slope < 6 deg).
for (const [x, z] of [[-66, 4], [-60, -20], [-30, -50], [0, -52], [-50, 50], [-20, 54], [-36, 26], [-50, 20], [-40, 44], [-5, 10], [-40, -20], [-68, 20], [-62, 34], [5, 45], [-8, -30]]) {
  const h = meshHeight(x, z); if (h === null) continue;
  const e = .6, s = Math.max(Math.abs(meshHeight(x + e, z)! - meshHeight(x - e, z)!), Math.abs(meshHeight(x, z + e)! - meshHeight(x, z - e)!)) / (2 * e);
  if (Math.atan(s) * 180 / Math.PI < 6) pts.push([x, z, +h.toFixed(3)]);
}
// Slope start: west flank foot (theta 180 deg), facing the camp centre.
const a = 200 * Math.PI / 180, R = campRadius(a), foot = R + (4.8 - 1) / Math.tan(19 * Math.PI / 180) + 3;
const sx = CAMP_CENTER[0] + Math.cos(a) * foot, sz = CAMP_CENTER[2] + Math.sin(a) * foot;
// Terrace foot: SE rock terrace (theta 310 deg).
const b = 310 * Math.PI / 180, Rb = campRadius(b) + 6.2, tx = CAMP_CENTER[0] + Math.cos(b) * Rb, tz = CAMP_CENTER[2] + Math.sin(b) * Rb;
writeFileSync(new URL('./probes.json', import.meta.url), JSON.stringify({
  points: pts,
  slopeStart: [sx, terrainHeight(sx, sz) + .93, sz], slopeDir: [-Math.cos(a), -Math.sin(a)],
  terraceStart: [tx, terrainHeight(tx, tz) + .93, tz], terraceDir: [-Math.cos(b), -Math.sin(b)], terraceGround: terrainHeight(tx, tz),
}, null, 1));
console.log(pts.length, [sx, sz, terrainHeight(sx, sz)], [tx, tz, terrainHeight(tx, tz)]);

/** Emit exact named TS geometry for editable Blender source / fresh-export comparison.
 * This is a bounded data job; never starts Blender, a build, a server or a browser. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { families, loadWorldModule, ROOT } from './runtime.mjs';

const out = path.join(ROOT, 'tools/world/facility-craft/street/source');
const reviewAssets = path.join(ROOT, 'public/assets/world/facility-craft/street');
mkdirSync(out, { recursive: true });
mkdirSync(reviewAssets, { recursive: true });
const hash = x => createHash('sha256').update(x).digest('hex');
const A = loadWorldModule(), current = families(A), original = families(loadWorldModule('WorldStreetAssets.ts', '', true));
const sourceFiles = ['WorldStreetAssets.ts', 'WorldStreetFacilityCraft.ts', 'WorldStreetGeometry.ts'];
const provenance = {
  base: '2f22560fff2174195d8ce70b855ae4b871a388a7', units: 'metres', runtimeUp: '+Y', nativeConversion: '(x, -z, y)',
  runtimeSourceSHA256: Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(path.join(ROOT, 'src/components/world', f)))])),
  baselineSourceSHA256: hash(execFileSync('git', ['show', '2f22560:src/components/world/WorldStreetAssets.ts'], { cwd: ROOT })),
  originalGlb: null, originalGlbReason: 'These eight facility families are procedural Builder geometry; no baseline GLB existed.',
  textureSources: [], licence: 'Project-authored geometry; inherited project Art Lock surface vocabulary, no new third-party media.',
};
function node(B, name, translation = [0, 0, 0]) {
  return { name, translation, position: B.pos, normal: B.nrm, color: B.col, aMat: B.mat, aSuv: B.suv, index: B.idx,
    parts: B.parts.map(p => ({ ...p, end: p.end < 0 ? B.pos.length / 3 : p.end })),
    baselineHullSHA256: hash(JSON.stringify(B.hulls().map(h => Array.from(h)))) };
}
function group(all, id, lod) {
  if (id !== 'timberRail') return [node(all[id][lod], id)];
  return [node(all.timberPost[lod], 'timberPost.start', [-2.2, 0, 0]), node(all.timberPost[lod], 'timberPost.end', [2.2, 0, 0]), node(all.timberBeam[lod], 'timberBeam', [0, .57, 0])];
}
const manifest = { ...provenance, generatedAt: new Date().toISOString(), assets: {} };
for (const id of ['bench', 'shelter', 'lamp', 'signal', 'bin', 'roadblock', 'seawallBay', 'timberRail']) {
  const data = { ...provenance, id, root: [0, 0, 0], front: id === 'shelter' || id === 'signal' ? '-X' : '-Z',
    baseline: { L0: group(original, id, 0), L1: group(original, id, 1) },
    candidate: { L0: group(current, id, 0), L1: group(current, id, 1) } };
  const text = JSON.stringify(data), filename = `${id}.source.json`;
  writeFileSync(path.join(out, filename), text);
  const summary = nodes => ({ triangles: nodes.reduce((sum, n) => sum + n.index.length / 3, 0),
    parts: nodes.reduce((sum, n) => sum + n.parts.length, 0),
    materialResponses: new Set(nodes.flatMap(n => n.aMat.filter((_, i) => i % 4 === 0).map((_, i) => n.aMat.slice(i * 4, i * 4 + 4).join(',')))).size });
  manifest.assets[id] = { source: `tools/world/facility-craft/street/source/${filename}`, sourceBytes: Buffer.byteLength(text), sourceSHA256: hash(text),
    baseline: summary(data.baseline.L0), candidate: summary(data.candidate.L0), L1: summary(data.candidate.L1), runtimeMaterialBatches: 1 };
}

// Representative instances come from the same real layout data used by the runtime adapters.
const L = loadWorldModule('layout-v4.ts', '?layout=v4'), solids = L.solidsV4(), knock = L.knockablesV4();
const bench = solids.find(s => s.kind === 'bench' && s.position[0] === 30.1);
const shelter = solids.find(s => s.kind === 'shelter');
const seawall = solids.find(s => s.kind === 'rail' && Math.abs(s.position[0] - 31) < .01);
const timber = solids.find(s => s.kind === 'rail' && s.color === '#8E6E55');
const round = x => +x.toFixed(4);
const baseOf = s => [s.position[0], s.position[1] - s.size[1] / 2, s.position[2]];
const entry = (id, root, yaw, offset, targetY, note, extra = {}) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const world = p => [root[0] + c * p[0] + s * p[2], root[1] + p[1], root[2] - s * p[0] + c * p[2]].map(round);
  return { id, root: root.map(round), yaw: round(yaw), contactY: round(root[1]), camera: world(offset), target: world([0, targetY, 0]),
    fov: 45, time: [12, 0], quality: 'balanced', suggestedDistanceM: round(Math.hypot(offset[0], offset[2])), note, ...extra };
};
const cameras = [];
cameras.push(entry('bench', baseOf(bench), bench.yaw + Math.PI / 2, [2.1, 1.15, -2.8], .48, 'Promenade bench; front is local -Z. Seat datum unchanged.'));
cameras.push(entry('shelter', baseOf(shelter), shelter.yaw, [-3.4, 1.7, -3.3], 1.25, 'Look through the open -X street side; show roof frame and cantilever perch.'));
for (const id of ['lamp', 'signal', 'bin']) {
  const k = knock.find(p => p.kind === id && p.road === 'avenue') ?? knock.find(p => p.kind === id);
  cameras.push(entry(id, k.position, k.yaw, id === 'bin' ? [1.35, 1.4, -1.6] : id === 'signal' ? [-5, 3.4, -5.8] : [4.2, 3.3, -6.6], id === 'signal' ? 2.8 : id === 'lamp' ? 2.6 : .7, `Actual ${k.id} on ${k.road}; preserve existing light/traffic interfaces.`, { instanceId: k.id }));
}
const obstruction = L.OBSTACLES_V4[0];
cameras.push(entry('roadblock', [obstruction[0], obstruction[1] - .5, obstruction[2]], 0, [1.8, 1.3, -2.4], .5, 'Actual OBSTACLES_V4[0]; examine folding trestle from an oblique front view.'));
const end = r => [r.position[0] - Math.cos(r.yaw) * r.size[0] / 2, r.position[2] + Math.sin(r.yaw) * r.size[0] / 2];
const seaStart = end(seawall);
cameras.push(entry('seawallBay', [seaStart[0], seawall.position[1] + .14 - .9, seaStart[1]], seawall.yaw, [1, 1.35, -2.6], .6, 'First real seawall bay; post includes the original 0.5 m underground sink.',
  { target: [seaStart[0] + Math.cos(seawall.yaw), seawall.position[1] + .14 - .9 + .6, seaStart[1] - Math.sin(seawall.yaw)].map(round) }));
const timberStart = end(timber);
const ty = L.TRAIL_V4.reduce((best, t) => Math.hypot(t[0] - timberStart[0], t[2] - timberStart[1]) < Math.hypot(best[0] - timberStart[0], best[2] - timberStart[1]) ? t : best)[1];
cameras.push(entry('timberRail', [timberStart[0], ty, timberStart[1]], timber.yaw, [1.5, 1.2, -2.8], .58, 'Real hill rail start post; beam datum postY+0.57, sunk base -0.45. Frame wider if the next bay curves.', { bayLength: timber.size[0] }));
writeFileSync(path.join(reviewAssets, 'cameras.json'), JSON.stringify({ source: 'actual layout-v4 solidsV4/knockablesV4/OBSTACLES_V4, matching current StreetFixed/Rails/Knock adapters', port: 4359,
  note: 'Suggested numerical replay cameras, not browser-verified screenshots. Keep camera/time/exposure/viewport identical for baseline and candidate.', cameras }, null, 2));
writeFileSync(path.join(reviewAssets, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ families: Object.keys(manifest.assets).length, geometryFiles: 8, totalBytes: Object.values(manifest.assets).reduce((s, a) => s + a.sourceBytes, 0), out }));

import { Box3, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type InstancedMesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coasterFrame, coasterRidePose, coasterSupports, coasterWorld, COASTER_LENGTH } from './coaster-track.ts';
import { coasterInfieldHeight, onCoasterInfieldWalk, COASTER_INFIELD_LAMPS, COASTER_RELIEF_FORMATIONS } from './coaster-terrain-relief.ts';
import { onCoasterCliffWalk } from './coaster-landscape-cliffs.ts';
import type { Vec3 } from '../types';

export const COASTER_VEGETATION_BUDGET = Object.freeze({ trees: 48, nearTrees: 8, bushes: 36, visibleBushes: 24,
  nearEnter: 26, nearExit: 32, farDistance: 185, bushDistance: 65, updateSeconds: .1 });
export interface CoasterPlant { id: string; kind: 0 | 1 | 2; local: Vec3; scale: number; yaw: number; bounds: Box3; matrix: Matrix4 }
// Bounds include BOTH authored crown LODs, arbitrary yaw and the shared .13 m wind excursion.
export const PLANT_ENVELOPES = [{ radius: 2.6, height: 4.96 }, { radius: 2.2, height: 6.46 }, { radius: 1.21, height: 1.06 }] as const;
const origin = coasterWorld([0, 0, 0]);
const rocks = [[-43,-65,8,9],[-48,-9,5,8],[70,-81,9,12],[84,-57,7,9],[-36,13,5.8,5.8],[-25,47,7,6],[-44,43,7,8]];
const existingTrees = [[5,-137],[15,-132],[38,-116],[89,-150],[93,-180],[77,-221],[43,-226]];
// Small groves on continuous shoulders; no random scattering into the station or service yards.
const groves = [[-19,-57],[-16,-39],[-13,-20],[7,-53],[13,-31],[28,-17],[38,-40],[38,-3],[39,30],
  [-45,-43],[-44,-24],[-36,-57],[60,-38],[62,-15],[-31,35],[32,43]];

function segmentHitsBox(a: Vec3, b: Vec3, box: Box3) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const min = box.min.getComponent(k), max = box.max.getComponent(k), delta = b[k] - a[k];
    if (Math.abs(delta) < 1e-9) { if (a[k] < min || a[k] > max) return false; }
    else { const t1 = (min - a[k]) / delta, t2 = (max - a[k]) / delta;
      lo = Math.max(lo, Math.min(t1,t2)); hi = Math.min(hi, Math.max(t1,t2)); if (lo > hi) return false; }
  }
  return true;
}
type ClearanceSegment = { a: Vec3; b: Vec3; margin: number };
let safety: Map<string, ClearanceSegment[]> | undefined;
function clearanceBins() {
  if (safety) return safety;
  safety = new Map();
  const add = (a: Vec3, b: Vec3, margin: number) => {
    const s = { a, b, margin };
    for (let x = Math.floor((Math.min(a[0],b[0])-margin)/10); x <= Math.floor((Math.max(a[0],b[0])+margin)/10); x++)
      for (let z = Math.floor((Math.min(a[2],b[2])-margin)/10); z <= Math.floor((Math.max(a[2],b[2])+margin)/10); z++) {
        const key = `${x},${z}`, bin = safety!.get(key) ?? []; bin.push(s); safety!.set(key,bin);
      }
  };
  const samples = Math.ceil(COASTER_LENGTH / .5);
  for (let i = 0; i < samples; i++) {
    const u = i / samples, frame = coasterFrame(u), head = frame.point.clone().addScaledVector(frame.up,2.2).toArray() as Vec3;
    add(frame.point.toArray() as Vec3, head, 2.2);
    for (const mode of ['chase','comfort','first-person'] as const) {
      const pose = coasterRidePose(u,mode);
      add(pose.cameraPosition,pose.cameraTarget,.9);
      if (mode !== 'first-person') add(pose.cameraPosition,head,.9);
    }
  }
  // The two structure LODs sample different support stations. Both must remain free of trees.
  for (const detailed of [true,false]) for (const {a,b,beams} of coasterSupports(detailed)) {
    for (const p of [a,b]) {
      add([p.x,1.2,p.z],p.toArray() as Vec3,.8);
      add([p.x,1.4,p.z],[p.x,1.4,p.z],1.35);
    }
    for(const beam of beams)add(beam.a.toArray() as Vec3,beam.b.toArray() as Vec3,beam.radius+.4);
  }
  return safety;
}
export function coasterPlantBounds(local: Vec3, kind: 0 | 1 | 2, scale: number) {
  const p = coasterWorld(local), e = PLANT_ENVELOPES[kind], r = e.radius * scale;
  return new Box3(new Vector3(p[0]-r,p[1]-.15,p[2]-r),new Vector3(p[0]+r,p[1]+e.height*scale,p[2]+r));
}
export function clearCoasterPlant(bounds: Box3) {
  const bins = clearanceBins(), checked = new Set<ClearanceSegment>(), expanded = new Box3();
  for (let x = Math.floor(bounds.min.x/10); x <= Math.floor(bounds.max.x/10); x++)
    for (let z = Math.floor(bounds.min.z/10); z <= Math.floor(bounds.max.z/10); z++)
      for (const s of bins.get(`${x},${z}`) ?? []) {
        if (checked.has(s)) continue; checked.add(s); expanded.copy(bounds).expandByScalar(s.margin);
        if (segmentHitsBox(s.a,s.b,expanded)) return false;
      }
  return true;
}
function publicOrSolid(x: number, z: number, radius: number) {
  if (onCoasterCliffWalk(x,z,radius+1) || onCoasterInfieldWalk(x,z,radius+.8)) return true;
  if (x > -21-radius && x < 20+radius && z > 29-radius) return true;
  if (z > 50-radius) return true; // station forecourt, planters and workshop routes
  if (Math.abs(x+36) < 8+radius && Math.abs(z-13) < 8+radius) return true;
  if (Math.abs(x+44) < 12+radius && Math.abs(z+150) < 12+radius) return true;
  if (rocks.some(([rx,rz,w,d]) => Math.abs(x-rx) < w*1.2+radius && Math.abs(z-rz) < d*1.2+radius)) return true;
  // These older rock formations do not expose a height sampler; never plant into their skins.
  if (COASTER_RELIEF_FORMATIONS.some(f => x > Math.min(...f.outline.map(p=>p[0]))-radius && x < Math.max(...f.outline.map(p=>p[0]))+radius
    && z > Math.min(...f.outline.map(p=>p[1]))-radius && z < Math.max(...f.outline.map(p=>p[1]))+radius)) return true;
  if (COASTER_INFIELD_LAMPS.some(p => Math.hypot(x-p[0],z-p[1]) < radius+1.2)) return true;
  return existingTrees.some(p => Math.hypot(x+origin[0]-p[0],z+origin[2]-p[1]) < radius+3);
}

let layout: readonly CoasterPlant[] | undefined;
export function coasterVegetationLayout(): readonly CoasterPlant[] {
  if (layout) return layout;
  const plants: CoasterPlant[] = [];
  const place = (id: string, kind: 0 | 1 | 2, x: number, z: number, scale: number, yaw: number, planter = false) => {
    const radius = PLANT_ENVELOPES[kind].radius*scale;
    if (!planter && publicOrSolid(x,z,radius)) return;
    const ground = planter ? 1 : coasterInfieldHeight(x,z) ?? 0;
    // Embed roots slightly, and reject discontinuous/steep support instead of floating on slopes.
    const heights = planter ? [ground] : [[-.3,0],[.3,0],[0,-.3],[0,.3]].map(([dx,dz]) => coasterInfieldHeight(x+dx,z+dz) ?? 0);
    if (Math.max(...heights)-Math.min(...heights) > .42 || Math.max(...heights.map(h=>Math.abs(h-ground))) > .35) return;
    const local: Vec3 = [x,Math.min(ground,...heights)-.06,z], bounds = coasterPlantBounds(local,kind,scale);
    if (!clearCoasterPlant(bounds)) return;
    if (plants.some(p => p.kind !== 2 && kind !== 2 && Math.hypot(p.local[0]-x,p.local[2]-z) < 2.7)) return;
    if (plants.some(p => Math.hypot(p.local[0]-x,p.local[2]-z) < (kind === 2 ? .9 : 1.5))) return;
    plants.push({ id, kind, local, scale, yaw, bounds, matrix: new Matrix4().compose(new Vector3(...coasterWorld(local)),
      new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw),new Vector3().setScalar(scale)) });
  };
  // Round-robin clusters retain distribution when the explicit capacity is reached.
  for (let ring = 0; ring < 16 && plants.length < COASTER_VEGETATION_BUDGET.trees; ring++) groves.forEach(([cx,cz],g) => {
    if (plants.length >= COASTER_VEGETATION_BUDGET.trees) return;
    const angle = ring*2.399+g*.71, radius = ring === 0 ? 0 : 2.8+Math.sqrt(ring)*1.4;
    place(`grove-${g}-${ring}`, (g+ring)%2 as 0|1, cx+Math.cos(angle)*radius,cz+Math.sin(angle)*radius,
      .87+((g*3+ring)%5)*.035,angle);
  });
  // Authored G19 bushes fill the same retained entrance planters, then the foot of each grove.
  let bushes = 0;
  for (const x of [-48,-38,-18,17,29,45]) if (!onCoasterCliffWalk(x,55,3)) for (const dx of [-1.5,0,1.5]) {
    const before = plants.length; place(`planter-${x}-${dx}`,2,x+dx,55,.68,(x+dx)*.31,true); bushes += plants.length-before;
  }
  const trees = plants.filter(p=>p.kind !== 2);
  for (let layer = 0; layer < 4; layer++) for (let i = 0; i < trees.length && bushes < COASTER_VEGETATION_BUDGET.bushes; i++) {
    const tree = trees[i], angle = tree.yaw+layer*2.4, r = 2+layer*.8, before = plants.length;
    place(`understory-${i}-${layer}`,2,tree.local[0]+Math.cos(angle)*r,tree.local[2]+Math.sin(angle)*r,.72+(i%4)*.07,angle);
    bushes += plants.length-before;
  }
  layout = plants; return layout;
}

/** Merge owned clones only; retain the authored leaf colours and branch weights. The L0 trunk
 * is identical in both render LODs and physical geometry, and stays rigid under wind. */
export function mergeCoasterPlantGeometry(scene: Object3D, branches: readonly string[]): BufferGeometry {
  scene.updateMatrixWorld(true);
  const leaves: BufferGeometry[] = [], wood: BufferGeometry[] = [];
  scene.traverse(o => {
    const mesh = o as Mesh; if (!mesh.isMesh) return;
    let node: Object3D | null = o, match = false, trunk = false;
    while (node) { if (branches.includes(node.name)) match = true; if (node.name.includes('trunk')) trunk = true; node = node.parent; }
    if (!match) return;
    const src = mesh.geometry, geo = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(mesh.matrixWorld);
    const n = geo.getAttribute('position').count, colours = new Float32Array(n*3), mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const group of src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }]) {
      const colour = (mats[group.materialIndex ?? 0] as MeshStandardMaterial).color;
      for (let v = group.start; v < Math.min(n,group.start+group.count); v++) colours.set(colour.toArray(),v*3);
    }
    geo.setAttribute('color',new Float32BufferAttribute(colours,3));
    for (const key of Object.keys(geo.attributes)) if (!['position','normal','color','_wind'].includes(key)) geo.deleteAttribute(key);
    const wind = geo.getAttribute('_wind'); if (!wind) throw new Error(`Missing authored wind: ${mesh.name}`);
    if (trunk) for (let i = 0; i < wind.count; i++) wind.setXYZW(i,0,0,0,0);
    geo.clearGroups(); (trunk ? wood : leaves).push(geo);
  });
  const parts = [...leaves,...wood];
  if (!parts.length) throw new Error(`Missing vegetation branches: ${branches.join(',')}`);
  const result = mergeGeometries(parts,false); parts.forEach(p=>p.dispose());
  if (!result) throw new Error('Incompatible vegetation attributes');
  return result;
}

export function coasterTrunkCollider(trunk: BufferGeometry, matrix: Matrix4) {
  const geo = trunk.clone().applyMatrix4(matrix), pos = new Float32Array(geo.getAttribute('position').array);
  const idx = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: pos.length/3 },(_,i)=>i);
  geo.dispose(); return { pos, idx };
}
export function selectCoasterVegetation(plants: readonly CoasterPlant[], eye: Vector3, visible: (p: CoasterPlant)=>boolean, previousNear: ReadonlySet<string>) {
  const b = COASTER_VEGETATION_BUDGET;
  const rows = plants.filter(visible).map(p=>({p,d:p.bounds.getCenter(new Vector3()).distanceTo(eye)})).sort((a,c)=>a.d-c.d || a.p.id.localeCompare(c.p.id));
  const near = new Set(rows.filter(r=>r.p.kind !== 2 && r.d < (previousNear.has(r.p.id) ? b.nearExit : b.nearEnter))
    .sort((a,c)=>(a.d-(previousNear.has(a.p.id)?6:0))-(c.d-(previousNear.has(c.p.id)?6:0)))
    .slice(0,b.nearTrees).map(r=>r.p.id));
  const groups: CoasterPlant[][] = [[],[],[],[],[]];
  for (const {p,d} of rows) {
    if (p.kind === 2) { if (d < b.bushDistance && groups[4].length < b.visibleBushes) groups[4].push(p); }
    else if (d < b.farDistance) groups[p.kind*2+(near.has(p.id)?0:1)].push(p);
  }
  // Stable ordering means camera motion with unchanged membership never causes a buffer upload.
  groups.forEach(g=>g.sort((a,c)=>a.id.localeCompare(c.id)));
  return { groups, near };
}

export function updateCoasterVegetationInstances(mesh: InstancedMesh, group: readonly CoasterPlant[], previous: string) {
  const signature = group.map(p=>p.id).join('|');
  if (signature === previous) return previous;
  mesh.count = group.length; mesh.visible = group.length > 0;
  group.forEach((p,i)=>mesh.setMatrixAt(i,p.matrix));
  // WorldOcclusion caches this sphere for its ray prefilter. LOD membership moves instances,
  // so updating only the GPU buffer would leave an old sphere and miss newly visible blockers.
  mesh.computeBoundingSphere();
  if (group.length) { mesh.instanceMatrix.needsUpdate = true; mesh.userData.matrixUploads = (mesh.userData.matrixUploads ?? 0)+1; }
  return signature;
}

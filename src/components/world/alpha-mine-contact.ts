import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Sphere, Vector3, type Object3D } from 'three';
import receipt from './alpha-mine-contact.generated.json';
import type { Vec3 } from './types';

type Kind = 'surface' | 'solid';
type Buffers = { vertices: Float32Array; indices: Uint32Array };
type Range = readonly number[];
type Recipe = { indexCount: number; parts: Record<string, Range[]> };
export type MineLegacyCollision = Record<Kind,{vertices: number[]; indices: number[]}>;
export const MINE_RACK_ROOT = 'alpha-mine-entry-tool-rack';
export const MINE_POOL_ROOT = 'alpha-mine-backtest-basin';
export const MINE_WEST_RAMP_ROOT = 'alpha-mine-west-ramp';
const veinRoots: Record<string,string> = {
  'vein-lower':'alpha-mine-lower-vein-contact',
  'vein-middle':'alpha-mine-middle-vein-contact',
  'vein-upper':'alpha-mine-upper-vein-contact',
};
export const mineVeinContactRoot = (vein: string) => veinRoots[vein];
export const MINE_ROUTE_ROOTS = {
  west:MINE_WEST_RAMP_ROOT,
  'ramp-east-3-6':'alpha-mine-east-ramp',
  'bridge-middle':'alpha-mine-middle-bridge',
  'gallery-west-entry':'alpha-mine-gallery-west-entry',
  'gallery-west-rise':'alpha-mine-gallery-west-rise',
  'gallery-west-link':'alpha-mine-gallery-west-link',
  'bridge-north-ravine':'alpha-mine-north-ravine-bridge',
} as const;

type ContactDefinition = { root: string; kind?: Kind; reason?: string };
const definitions: Record<string,ContactDefinition> = {
  'rack-frame':{root:MINE_RACK_ROOT,kind:'solid'},
  'rack-hooks':{root:MINE_RACK_ROOT,kind:'solid'},
  'lower-tray':{root:mineVeinContactRoot('vein-lower'),kind:'solid'},
  'middle-tray':{root:mineVeinContactRoot('vein-middle'),kind:'solid'},
  'upper-tray':{root:mineVeinContactRoot('vein-upper'),kind:'solid'},
  'pool-rim':{root:MINE_POOL_ROOT,kind:'solid'},
  'pool-floor':{root:MINE_POOL_ROOT,kind:'surface'},
  'pool-drop-studs':{root:MINE_POOL_ROOT,kind:'solid'},
};
for (const [route, root] of Object.entries(MINE_ROUTE_ROOTS)) {
  definitions[route+'-deck'] = {root,kind:'surface'};
  definitions[route+'-structure'] = {root,kind:'solid'};
  definitions[route+'-fasteners'] = {root,reason:'Small fasteners seated on the fitted timber supports'};
}

function indexedView(source: BufferGeometry, indices: Uint32Array) {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name,attribute);
  geometry.setIndex(new BufferAttribute(indices,1));
  const p=source.getAttribute('position'), bounds=new Box3(), sample=new Vector3();
  for (const index of indices) bounds.expandByPoint(sample.fromBufferAttribute(p,index));
  geometry.boundingBox=bounds;
  geometry.boundingSphere=bounds.getBoundingSphere(new Sphere());
  return geometry;
}

function placedCollider(mesh: Mesh, indices: Uint32Array, matrix: Matrix4): Buffers {
  const positions = mesh.geometry.getAttribute('position'), point = new Vector3(), vertices: number[] = [];
  const offsets = new Map<number, number>();
  const mapped=indices.map(index=>{
    const cached=offsets.get(index);
    if (cached!==undefined) return cached;
    const offset=vertices.length/3;
    offsets.set(index,offset);
    point.fromBufferAttribute(positions,index).applyMatrix4(matrix).toArray(vertices,vertices.length);
    return offset;
  });
  return {vertices:new Float32Array(vertices),indices:mapped};
}

function selectRangeIndices(source: BufferAttribute, ranges: Range[], used: Uint8Array) {
  const result = new Uint32Array(ranges.reduce((n,range)=>n+range[1],0));
  let write = 0;
  for (const [start,length] of ranges) {
    for (let i=start; i<start+length; i++) {
      if (used[i] || i>=source.count) throw new Error('Overlapping or stale mine source range');
      used[i] = 1;
      result[write++] = source.getX(i);
    }
  }
  if (write===0 || write%3!==0) throw new Error('Missing mine triangle range');
  return result;
}

function remainingCollision(old: MineLegacyCollision): Record<Kind,Buffers> {
  const slices = Object.values(receipt.old).flat();
  const remainder = (kind: Kind) => {
    const {vertices,indices}=old[kind];
    if (indices.length!==receipt.legacyLengths[kind]) throw new Error('Stale legacy mine collider receipt');
    const remove=new Uint8Array(indices.length);
    for (const [group,start,length] of slices) if (group===kind) remove.fill(1,Number(start),Number(start)+Number(length));
    return {vertices:new Float32Array(vertices),indices:Uint32Array.from(indices.filter((_,i)=>!remove[i]))};
  };
  return {surface:remainder('surface'),solid:remainder('solid')};
}

/** Split only the audited index ranges, so untouched scenery retains its original
 * draw attributes and the rest of the quarry keeps its existing physics. */
export function installMineContacts(root: Object3D, old: MineLegacyCollision) {
  const legacy=remainingCollision(old);
  const sections = new Map<string,Group>([MINE_RACK_ROOT,MINE_POOL_ROOT,...Object.values(MINE_ROUTE_ROOTS),...Object.values(veinRoots)].map(id=>{
    const visual = new Group(); visual.name=id+'-visual'; return [id,visual];
  }));
  const colliders: {root:string; id:string; kind:Kind; buffers:Buffers}[] = [];
  const geometry: BufferGeometry[] = [];
  const batches=Object.entries(receipt.batches) as [string, Recipe][];
  for (const [name,recipe] of batches) {
    const mesh=root.getObjectByName(name);
    const index=mesh instanceof Mesh ? mesh.geometry.index : null;
    if (!index || index.count!==recipe.indexCount) throw new Error('Stale mine visual contact receipt: '+name);
  }
  root.updateWorldMatrix(true,true);
  const worldToMine=root.matrixWorld.clone().invert();
  for (const [name,recipe] of batches) {
    const mesh=root.getObjectByName(name) as Mesh;
    const source=mesh.geometry, index=source.index!;
    const transform=new Matrix4().multiplyMatrices(worldToMine,mesh.matrixWorld), used=new Uint8Array(index.count);
    for (const [part,ranges] of Object.entries(recipe.parts)) {
      const definition=definitions[part];
      const indices=selectRangeIndices(index,ranges,used);
      const visible=indexedView(source,indices); geometry.push(visible);
      const piece=new Mesh(visible,mesh.material), id='alpha-mine-'+part;
      piece.name=id+'-visible'; piece.castShadow=mesh.castShadow; piece.receiveShadow=mesh.receiveShadow;
      piece.matrix.copy(transform); piece.matrixAutoUpdate=false;
      piece.userData={...mesh.userData,worldCollision:definition.kind?'solid':'none',collisionReason:definition.reason,
        ...(definition.kind ? {surfaceId:id} : {})};
      sections.get(definition.root)!.add(piece);
      if (definition.kind) colliders.push({root:definition.root,id,kind:definition.kind,buffers:placedCollider(piece,indices,transform)});
    }
    const untouched=Uint32Array.from(index.array.filter((_,i)=>!used[i]));
    mesh.geometry=indexedView(source,untouched); geometry.push(mesh.geometry);
  }
  return {sections,legacy,colliders,dispose:()=>geometry.forEach(item=>item.dispose())};
}

/** The intact, chipped and open quarry faces are alternatives at one pivot.
 * Only the live face owns the collider, including its exposed mineral facets. */
export function mineVeinStateContact(root: Object3D, stateName: string, vein: string) {
  const state = root.getObjectByName(stateName);
  if (!state) throw new Error('Missing mine vein contact state: '+stateName);
  root.updateWorldMatrix(true,true);
  const visual = new Group(), branch = state.clone(true), id='alpha-mine-'+vein+'-face';
  visual.name=root.name;
  branch.matrix.copy(root.matrixWorld).invert().multiply(state.matrixWorld);
  branch.matrixAutoUpdate=false;
  visual.add(branch); visual.updateMatrixWorld(true);
  const vertices: number[] = [], indices: number[] = [];
  visual.traverse(mesh=>{
    if (!(mesh instanceof Mesh)) return;
    const position=mesh.geometry.getAttribute('position'), source=mesh.geometry.index;
    const input=Uint32Array.from({length:source?.count ?? position.count},(_,i)=>source?.getX(i) ?? i);
    const part=placedCollider(mesh,input,mesh.matrixWorld), offset=vertices.length/3;
    for (const vertex of part.vertices) vertices.push(vertex);
    for (const vertex of part.indices) indices.push(vertex+offset);
    Object.assign(mesh.userData,{worldCollision:'solid',surfaceId:id,worldCollisionSharedSurface:true});
  });
  if (!indices.length) throw new Error('Empty mine vein contact state: '+stateName);
  return {id,visual,buffers:{vertices:new Float32Array(vertices),indices:new Uint32Array(indices)}};
}

/** The tool mount and its E target share one actual rack socket transform. */
export function mineRackToolPose(rackSource: Object3D, tool: Object3D, slot: 'detector' | 'pickaxe') {
  rackSource.updateWorldMatrix(true,true); tool.updateWorldMatrix(true,true);
  const mount=rackSource.getObjectByName('rack_'+slot), grip=tool.getObjectByName('grip_R');
  if (!mount || !grip) throw new Error('Missing mine tool attachment: '+slot);
  const matrix=rackSource.matrixWorld.clone().invert().multiply(mount.matrixWorld);
  const localGrip=tool.worldToLocal(grip.getWorldPosition(new Vector3())).applyMatrix4(tool.matrix).applyMatrix4(matrix);
  return {matrix,target:localGrip.toArray() as Vec3};
}

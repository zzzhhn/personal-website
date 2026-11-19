import { Matrix4, type BatchedMesh, type InstancedMesh, type Mesh, type Object3D, type Scene } from 'three';
import type { CollisionClass } from './static-surface-asset';

export const migratedCollisionRoots = [
  'alpha-dock-lodge', 'alpha-lantern-rack', 'alpha-path-fence', 'alpha-mainland-pier-r4-candidate',
  'north-attractions-road', 'alpha-echo-cave-station-6', 'alpha-station5-three-sluices-waterwheel', 'alpha-lodge-threshold', 'alpha-supported-boulder-field',
  'alpha-crafted-alpine-forest', 'alpha-agent-exchange', 'alpha-terrain-patch', 'island-terrain-v4', 'street-year-group', 'street-roadblock-group',
  ...['cable', 'ferry', 'sled'].flatMap(kind => [
    `alpha-${kind}-vehicle-model`, `alpha-${kind}-gangway-0`, `alpha-${kind}-gangway-1`,
  ]),
  'cable-lower-canopy-structure', 'cable-upper-canopy-structure',
  ...['plaza','walk-0','walk-1','walk-2'].map(id=>'park-walk-structure-'+id),
  'park-rail-lod-instances', 'park-lamp-lod-instances',
  ...['evalforge','djc','hepai','accompany','interactive-learning'].map(id=>'park-hut-structure-'+id),
  ...['C12','C13-0','C13-1','C15'].map(id=>'camp-content-push-'+id),
  ...['C03-large-tent','C04-small-tents','C05-fire-pit','C06-instances','C07-pad1','C09-pad2','C10-pad3',
    'G16-instances','G17-instances','G18-instances','G21-instances','G22-instances','G23-instances'].map(id=>'camp-asset-'+id),
  ...['evalforge','djc','hepai','accompany','interactive-learning'].map(id => 'park-exhibit-set-'+id),
  'djc-mirror-contact', 'djc-north-bar-contact', 'djc-pool-lantern-contact', 'djc-umbrella-contact', 'djc-furniture-contact', 'djc-daybed-contact',
  'ibd-workstation-fixtures', 'alpha-mine-attraction', 'alpha-mine-backtest-basin', 'alpha-mine-entry-tool-rack', 'alpha-mine-west-ramp', 'alpha-mine-east-ramp', 'alpha-mine-middle-bridge',
  ...['west-entry', 'west-rise', 'west-link'].map(name => 'alpha-mine-gallery-'+name),
  'alpha-mine-north-ravine-bridge', ...['lower','middle','upper'].map(level => 'alpha-mine-'+level+'-vein-contact'),
  'G28-entry', ...['mine','park','yard','coaster'].map(id => 'G28-entry-'+id),
  'world-paving-v4', 'camp-C14-contact', 'camp-L01-contact', 'world-camp-slice', 'street-trees-group', 'world-town-assets', 'factory-walk-support', 'factory-roof-support',
];
const classes = new Set<CollisionClass>(['solid', 'pushable', 'soft', 'none']);
const counts = () => ({ meshes: 0, declared: 0, unclassified: 0, invalid: 0 });
type Claim = { id: string | undefined; shared: boolean };
type Declared = { blocks: Claim[]; partial?: boolean };
type Declaration = Declared | 'invalid' | 'unclassified';
type Placement = { id: string; matrix: Matrix4; surfaceIds?: readonly string[] };
export interface InstanceCollisionSources {
  placements: readonly Placement[];
  /** Source index for each currently drawn GPU slot. Culling compacts those slots. */
  slots: number[];
}

export interface BatchedCollisionSources {
  geometries: readonly { id: number; ranges: readonly { id: string; firstIndex: number; indexCount: number;
    collision: CollisionClass; surfaceIds?: readonly string[] }[] }[];
  placements: readonly { id: string; slot: number; matrix: Matrix4; geometryIds: readonly number[]; colliderPrefix: string }[];
}

export function collisionInstancePartId(instance: string, part: string) { return `${instance}:${part}`; }

/** Compound parts keep local names under each actual Rapier instance node. */
export function collisionSupplyId(node: Object3D) {
  const instance = node.parent?.userData.worldCollisionInstance;
  return typeof instance === 'string' && instance === node.parent?.name && node.name
    ? collisionInstancePartId(instance, node.name) : node.name;
}

function instanceDeclaration(mesh: InstancedMesh, sources: InstanceCollisionSources): Declaration {
  const kind = mesh.userData.worldCollision;
  if (!mesh.isInstancedMesh || (kind !== 'solid' && kind !== 'pushable') || !Array.isArray(sources?.placements)
    || !Array.isArray(sources.slots) || sources.slots.length !== mesh.count) return 'invalid';
  const ranges = sourceRanges(mesh);
  if (ranges === 'invalid') return ranges;
  const placements: readonly Placement[] = sources.placements;
  const blocks: Claim[] = [];
  const ids = new Set<string>();
  for (const p of placements) {
    const matrix = p?.matrix;
    if (!p?.id || ids.has(p.id) || !matrix || typeof matrix !== 'object' || !('isMatrix4' in matrix)
      || matrix.isMatrix4 !== true || !Array.isArray(matrix.elements) || matrix.elements.length !== 16) return 'invalid';
    if (p.surfaceIds !== undefined && (!Array.isArray(p.surfaceIds) || !p.surfaceIds.length
      || new Set(p.surfaceIds).size !== p.surfaceIds.length
      || p.surfaceIds.some((id:unknown) => typeof id !== 'string' || !id))) return 'invalid';
    const supplied = ranges ? ranges.blocks.map(part => collisionInstancePartId(p.id, part.id!)) : p.surfaceIds ?? [p.id];
    if (ranges && supplied.some(id => !p.surfaceIds?.includes(id))) return 'invalid';
    blocks.push(...supplied.map(id => ({ id, shared: true })));
    ids.add(p.id);
  }
  if (new Set(sources.slots).size !== mesh.count) return 'invalid';
  for (const [slot, index] of sources.slots.entries()) {
    const placement: Placement | undefined = placements[index];
    if (!Number.isInteger(index) || !placement) return 'invalid';
    const gpu = mesh.instanceMatrix.array;
    if (!placement.matrix.elements.every((v, i) => Math.fround(v) === gpu[16 * slot + i])) return 'invalid';
  }
  // Lod meshes claim the real parts they keep. Near and hidden proxy may share
  // those registrations while their slots point to the same live matrices.
  return { blocks, partial: ranges?.partial };
}

/** Each shared indexed geometry owns one exact range table. A placement claims
 * the union of its LOD members and validates its currently occupied GPU slot. */
function batchedDeclaration(mesh: BatchedMesh, sources: BatchedCollisionSources): Declaration {
  const index = mesh.geometry.index;
  if (!mesh.isBatchedMesh || !index || !Array.isArray(sources?.geometries) || !sources.geometries.length
    || !Array.isArray(sources.placements) || sources.placements.length !== mesh.instanceCount) return 'invalid';
  const geometry = new Map<number, { first: number; count: number; members: Set<string> }>();
  const expected = new Matrix4();
  try {
    for (const entry of sources.geometries) {
      if (!Number.isSafeInteger(entry?.id) || entry.id < 0 || geometry.has(entry.id) || !Array.isArray(entry.ranges) || !entry.ranges.length) return 'invalid';
      const range = mesh.getGeometryRangeAt(entry.id);
      if (!range) return 'invalid';
      const { indexStart, indexCount, vertexStart, vertexCount } = range;
      if (indexStart % 3 !== 0 || indexCount % 3 !== 0 || indexCount <= 0 || indexStart < 0 || indexStart + indexCount > index.count) return 'invalid';
      for (let i = indexStart; i < indexStart + indexCount; i++) {
        const vertex = index.getX(i);
        if (vertex < vertexStart || vertex >= vertexStart + vertexCount) return 'invalid';
      }
      const ids = new Set<string>(), members = new Set<string>();
      let end = 0;
      for (const part of entry.ranges) {
        if (!part || typeof part.id !== 'string' || !part.id || ids.has(part.id) || !classes.has(part.collision)
          || part.firstIndex !== end || !Number.isSafeInteger(part.indexCount) || part.indexCount <= 0 || part.indexCount % 3 !== 0) return 'invalid';
        const physical = part.collision === 'solid' || part.collision === 'pushable';
        const supplies = part.surfaceIds;
        if (physical) {
          if (!Array.isArray(supplies) || !supplies.length || new Set(supplies).size !== supplies.length
            || supplies.some(id => typeof id !== 'string' || !id)) return 'invalid';
          supplies.forEach(id => members.add(id));
        } else if (supplies !== undefined) return 'invalid';
        ids.add(part.id); end += part.indexCount;
      }
      if (end !== indexCount) return 'invalid';
      geometry.set(entry.id, { first: indexStart, count: indexCount, members });
    }
    let end = 0;
    for (const entry of [...geometry.values()].sort((a, b) => a.first - b.first)) {
      if (entry.first !== end) return 'invalid';
      end += entry.count;
    }
    if (end !== index.count) return 'invalid';
    const ids = new Set<string>(), prefixes = new Set<string>(), slots = new Set<number>(), used = new Set<number>();
    const blocks: Claim[] = [];
    for (const entry of sources.placements) {
      if (typeof entry?.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.colliderPrefix !== 'string'
        || !entry.colliderPrefix || prefixes.has(entry.colliderPrefix) || !Number.isSafeInteger(entry.slot) || entry.slot < 0
        || entry.slot >= mesh.maxInstanceCount || slots.has(entry.slot) || !Array.isArray(entry.geometryIds) || !entry.geometryIds.length
        || new Set(entry.geometryIds).size !== entry.geometryIds.length || !entry.geometryIds.includes(mesh.getGeometryIdAt(entry.slot))) return 'invalid';
      mesh.getMatrixAt(entry.slot, expected);
      const matrix: Matrix4 = entry.matrix;
      if (!matrix || typeof matrix !== 'object' || !('isMatrix4' in matrix) || matrix.isMatrix4 !== true || matrix.elements.length !== 16
        || !matrix.elements.every((value, i) => Number.isFinite(value) && Math.fround(value) === expected.elements[i])) return 'invalid';
      const members = new Set<string>();
      for (const id of entry.geometryIds) {
        const source = geometry.get(id);
        if (!source) return 'invalid';
        source.members.forEach(member => members.add(member));
        used.add(id);
      }
      members.forEach(member => blocks.push({ id: entry.colliderPrefix + member, shared: false }));
      ids.add(entry.id); prefixes.add(entry.colliderPrefix); slots.add(entry.slot);
    }
    if (used.size !== geometry.size) return 'invalid';
    return { blocks };
  } catch { return 'invalid'; }
}

function sourceRanges(mesh: Mesh): Declared | 'invalid' | undefined {
  const sources = mesh.userData.worldCollisionSources;
  if (sources !== undefined) {
    if (!Array.isArray(sources) || !sources.length) return 'invalid';
    const indexed = mesh.geometry.index !== null;
    const partial = mesh.userData.worldCollisionPartial === true;
    let end = 0, gap = false;
    const ids = new Set<string>(), blocks: Claim[] = [];
    for (const p of sources) {
      const first = indexed ? p?.firstIndex : p?.firstVertex;
      const count = indexed ? p?.indexCount : p?.vertexCount;
      if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || !classes.has(p.collision)
        || (indexed ? ('firstVertex' in p || 'vertexCount' in p) : ('firstIndex' in p || 'indexCount' in p))
        || !Number.isSafeInteger(first) || first % 3 !== 0 || first < end || (first !== end && !partial) || !Number.isSafeInteger(count) || count <= 0 || count % 3
        || (p.surfaceId !== undefined && (typeof p.surfaceId !== 'string' || !p.surfaceId))) return 'invalid';
      ids.add(p.id);
      if (first > end) gap = true;
      end = first + count;
      if (p.collision === 'solid' || p.collision === 'pushable') blocks.push({ id: p.surfaceId ?? p.id, shared: p.surfaceId !== undefined });
    }
    const length = mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count;
    if (length === undefined || end > length || (!partial && end !== length)) return 'invalid';
    return {blocks, partial: gap || end < length};
  }
}

function declaration(mesh: Mesh): Declaration {
  // GLTFLoader preserves arbitrary artist extras, including prose in "collision".
  // Only the world's explicit runtime contract may classify meshes.
  if (Object.hasOwn(mesh.userData, 'worldCollisionInstances')) {
    return instanceDeclaration(mesh as InstancedMesh, mesh.userData.worldCollisionInstances);
  }
  if (Object.hasOwn(mesh.userData, 'worldCollisionBatchedInstances')) {
    return batchedDeclaration(mesh as unknown as BatchedMesh, mesh.userData.worldCollisionBatchedInstances);
  }
  const ranges = sourceRanges(mesh);
  if (ranges) return ranges;
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!Object.hasOwn(node.userData, 'worldCollision')) continue;
    const kind = node.userData.worldCollision;
    if (!classes.has(kind)) return 'invalid';
    if (Object.hasOwn(node.userData, 'worldCollisionPartitions')) {
      const partitions = node.userData.worldCollisionPartitions;
      if (kind !== 'solid' || typeof partitions?.floor !== 'string' || !partitions.floor
        || typeof partitions.wall !== 'string' || !partitions.wall || partitions.wall === partitions.floor) return 'invalid';
      return { blocks: [partitions.floor, partitions.wall].map(id => ({id, shared:true})) };
    }
    const blocks = kind === 'solid' || kind === 'pushable'
      ? [{ id: node.userData.surfaceId, shared: node.userData.worldCollisionSharedSurface === true }] : [];
    return { blocks };
  }
  return 'unclassified';
}

function regionOf(node: Object3D, scene: Scene) {
  const names: string[] = [];
  for (let n: Object3D | null = node; n && n !== scene; n = n.parent) if (n.name) names.push(n.name);
  return names.reverse().slice(0, 2).join(' / ') || '(unnamed)';
}
function sortedCounts(values: Map<string, number>) {
  return Object.fromEntries([...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

/** Count submitted meshes once across material groups. Named registrations are
 * checked separately from the physical shape and contact tests. */
export function collisionInventory(scene: Scene, submittedObjects: Iterable<Object3D>,
  activeColliderNodes: Iterable<Object3D>, requiredRoots = migratedCollisionRoots, heldObjects: Iterable<Object3D> = []) {
  const mounted = counts(), submitted = counts(), errors: string[] = [];
  const roots = new Set(requiredRoots);
  const scoped = new Map<Object3D, { names: Map<string, number>; claims: Map<string, boolean>; held: Set<string> }>();
  const mountedGaps = new Map<string, number>(), submittedGaps = new Map<string, number>();
  const frame = new Set(submittedObjects);
  let depthOnlyCopies = 0;
  scene.traverse(node => {
    if (roots.has(node.name)) scoped.set(node, { names: new Map(), claims: new Map(), held:new Set() });
  });
  function owner(node: Object3D | null) {
    while (node && !scoped.has(node)) node = node.parent;
    return node;
  }
  for (const node of activeColliderNodes) {
    const root = owner(node), scope = root && scoped.get(root);
    const id = collisionSupplyId(node);
    if (scope) scope.names.set(id, (scope.names.get(id) ?? 0) + 1);
  }
  const heldColliderIds = new Set<string>();
  for (const node of heldObjects) {
    const root = owner(node), scope = root && scoped.get(root);
    if (!scope) continue;
    scope.names.set(node.name,(scope.names.get(node.name) ?? 0)+1);
    scope.held.add(node.name);
    heldColliderIds.add(node.name);
  }
  scene.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const root = owner(mesh), scope = root && scoped.get(root);
    const decl = declaration(mesh);
    const state = typeof decl === 'string' ? decl : decl.partial ? 'unclassified' : 'declared';
    mounted.meshes++; mounted[state]++;
    const inFrame = frame.has(mesh) && (mesh as InstancedMesh).count !== 0 && mesh.geometry.drawRange.count !== 0;
    if (inFrame) { submitted.meshes++; submitted[state]++; }
    if (mesh.userData.worldCollisionReason === 'shadow-depth-copy') {
      depthOnlyCopies++;
      if (!mesh.userData.shadowProxy || mesh.parent?.name !== 'world-shadow-proxies' || inFrame) {
        errors.push(mesh.name + ': a depth-only shadow copy escaped into the colour scene');
      }
    }
    if (state !== 'declared') {
      const region = regionOf(mesh, scene);
      mountedGaps.set(region, (mountedGaps.get(region) ?? 0) + 1);
      if (inFrame) submittedGaps.set(region, (submittedGaps.get(region) ?? 0) + 1);
      if (state === 'invalid' || scope) errors.push([root?.name, mesh.name || mesh.type, state].filter(Boolean).join(': '));
    }
    if (!scope || typeof decl === 'string') return;
    for (const { id, shared } of decl.blocks) {
      const previous = id && scope.claims.get(id);
      if (!id || scope.names.get(id) !== 1 || (previous !== undefined && !(previous && shared))) {
        errors.push(root!.name + ': expected one unique collider for ' + (id ?? mesh.name));
      }
      if (id) scope.claims.set(id, shared);
    }
  });
  const registrations: Record<string, number> = {};
  for (const name of requiredRoots) {
    const matches = [...scoped].filter(([root]) => root.name === name);
    if (matches.length !== 1 || !matches[0][1].claims.size) errors.push('Missing or ambiguous collision structure: ' + name);
    else registrations[name] = [...matches[0][1].claims.keys()].filter(id=>!matches[0][1].held.has(id)).length;
  }
  for (const [root, scope] of scoped) for (const name of scope.names.keys()) {
    if (!scope.claims.has(name)) errors.push(root.name + ': collider without a visible source: ' + name);
  }
  return { mounted, submitted, depthOnlyCopies, mountedGapsByRegion: sortedCounts(mountedGaps),
    submittedGapsByRegion: sortedCounts(submittedGaps), registrations, heldColliderIds: [...heldColliderIds].sort(), errors };
}

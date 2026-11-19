import type { InstancedMesh, Matrix4, Mesh, Object3D, Scene } from 'three';
import type { CollisionClass } from './static-surface-asset';

export const migratedCollisionRoots = [
  'alpha-dock-lodge', 'alpha-lantern-rack', 'alpha-path-fence', 'alpha-mainland-pier-r4-candidate',
  'north-attractions-road', 'alpha-echo-cave-station-6', 'alpha-lodge-threshold', 'alpha-supported-boulder-field',
  'alpha-crafted-alpine-forest', 'alpha-agent-exchange', 'alpha-terrain-patch', 'island-terrain-v4', 'street-year-group',
  ...['cable', 'ferry', 'sled'].flatMap(kind => [
    `alpha-${kind}-vehicle-model`, `alpha-${kind}-gangway-0`, `alpha-${kind}-gangway-1`,
  ]),
  'cable-lower-canopy-structure', 'cable-upper-canopy-structure',
  ...['plaza','walk-0','walk-1','walk-2'].map(id=>'park-walk-structure-'+id),
  ...['evalforge','djc','hepai','accompany','interactive-learning'].map(id=>'park-hut-structure-'+id),
  ...['C12','C13-0','C13-1','C15'].map(id=>'camp-content-push-'+id),
  ...['C03-large-tent','C04-small-tents','C05-fire-pit','C06-instances','C07-pad1','C09-pad2','C10-pad3',
    'G16-instances','G17-instances','G18-instances','G21-instances','G22-instances','G23-instances'].map(id=>'camp-asset-'+id),
  'world-camp-slice', 'world-town-assets',
];
const classes = new Set<CollisionClass>(['solid', 'pushable', 'soft', 'none']);
const counts = () => ({ meshes: 0, declared: 0, unclassified: 0, invalid: 0 });
type Claim = { id: string | undefined; shared: boolean };
type Declaration = { blocks: Claim[]; partial?: boolean } | 'invalid' | 'unclassified';
type Placement = { id: string; matrix: Matrix4; surfaceIds?: readonly string[] };
export interface InstanceCollisionSources {
  placements: readonly Placement[];
  /** Source index for each currently drawn GPU slot. Culling compacts those slots. */
  slots: number[];
}

function instanceDeclaration(mesh: InstancedMesh, sources: InstanceCollisionSources): Declaration {
  if (!mesh.isInstancedMesh || mesh.userData.worldCollision !== 'solid' || !Array.isArray(sources?.placements)
    || !Array.isArray(sources.slots) || sources.slots.length !== mesh.count) return 'invalid';
  const placements: readonly Placement[] = sources.placements;
  const ids = new Set<string>();
  for (const p of placements) {
    const matrix = p?.matrix;
    if (!p?.id || ids.has(p.id) || !matrix || typeof matrix !== 'object' || !('isMatrix4' in matrix)
      || matrix.isMatrix4 !== true || !Array.isArray(matrix.elements) || matrix.elements.length !== 16) return 'invalid';
    if (p.surfaceIds !== undefined && (!Array.isArray(p.surfaceIds) || !p.surfaceIds.length
      || new Set(p.surfaceIds).size !== p.surfaceIds.length
      || p.surfaceIds.some((id:unknown) => typeof id !== 'string' || !id))) return 'invalid';
    ids.add(p.id);
  }
  if (new Set(sources.slots).size !== mesh.count) return 'invalid';
  for (const [slot, index] of sources.slots.entries()) {
    const placement: Placement | undefined = placements[index];
    if (!Number.isInteger(index) || !placement) return 'invalid';
    const gpu = mesh.instanceMatrix.array;
    if (!placement.matrix.elements.every((v, i) => Math.fround(v) === gpu[16 * slot + i])) return 'invalid';
  }
  // Both LODs refer back to the same permanent set of physics placements.
  return { blocks: placements.flatMap(p => (p.surfaceIds ?? [p.id]).map(id => ({ id, shared: true }))) };
}

function declaration(mesh: Mesh): Declaration {
  // GLTFLoader preserves arbitrary artist extras, including prose in "collision".
  // Only the world's explicit runtime contract may classify meshes.
  if (Object.hasOwn(mesh.userData, 'worldCollisionInstances')) {
    return instanceDeclaration(mesh as InstancedMesh, mesh.userData.worldCollisionInstances);
  }
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
    if (scope) scope.names.set(node.name, (scope.names.get(node.name) ?? 0) + 1);
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

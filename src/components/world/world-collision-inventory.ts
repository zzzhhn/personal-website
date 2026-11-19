import type { InstancedMesh, Mesh, Object3D, Scene } from 'three';
import type { CollisionClass } from './static-surface-asset';

export const migratedCollisionRoots = ['alpha-dock-lodge', 'alpha-lantern-rack', 'alpha-path-fence', 'alpha-mainland-pier-r4-candidate'];
const classes = new Set<CollisionClass>(['solid', 'pushable', 'soft', 'none']);
const counts = () => ({ meshes: 0, declared: 0, unclassified: 0, invalid: 0 });

function declaration(mesh: Mesh): { blocks: (string | undefined)[] } | 'invalid' | 'unclassified' {
  const sources = mesh.userData.sources;
  if (sources !== undefined) {
    if (!Array.isArray(sources) || !sources.length || mesh.geometry.index) return 'invalid';
    let end = 0;
    const ids = new Set<string>(), blocks: string[] = [];
    for (const p of sources) {
      if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || !classes.has(p.collision)
        || p.firstVertex !== end || !Number.isSafeInteger(p.vertexCount) || p.vertexCount <= 0 || p.vertexCount % 3) return 'invalid';
      ids.add(p.id);
      end += p.vertexCount;
      if (p.collision === 'solid' || p.collision === 'pushable') blocks.push(p.id);
    }
    return end === mesh.geometry.attributes.position?.count ? { blocks } : 'invalid';
  }
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (!Object.hasOwn(node.userData, 'collision')) continue;
    const kind = node.userData.collision;
    if (!classes.has(kind)) return 'invalid';
    return { blocks: kind === 'solid' || kind === 'pushable' ? [mesh.userData.surfaceId] : [] };
  }
  return 'unclassified';
}

/** Count scene meshes once even if several material groups enter the colour pass.
 * An ID match establishes registration, not agreement of the two shapes. */
export function collisionInventory(scene: Scene, submittedObjects: Iterable<Object3D>,
  activeColliderNodes: Iterable<Object3D>, requiredRoots = migratedCollisionRoots) {
  const mounted = counts(), submitted = counts(), errors: string[] = [];
  const roots = new Set(requiredRoots);
  const scoped = new Map<Object3D, { registrations: number; names: Map<string, number>; claimed: Set<string> }>();
  const gaps = new Map<string, number>();
  const frame = new Set(submittedObjects);
  scene.traverse(node => {
    if (roots.has(node.name)) scoped.set(node, { registrations: 0, names: new Map(), claimed: new Set() });
  });
  function owner(node: Object3D | null) {
    while (node && !scoped.has(node)) node = node.parent;
    return node;
  }
  for (const node of activeColliderNodes) {
    const root = owner(node), scope = root && scoped.get(root);
    if (scope) scope.names.set(node.name, (scope.names.get(node.name) ?? 0) + 1);
  }
  scene.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const root = owner(mesh), scope = root && scoped.get(root);
    const decl = declaration(mesh);
    const state = typeof decl === 'string' ? decl : 'declared';
    mounted.meshes++; mounted[state]++;
    if (frame.has(mesh) && (mesh as InstancedMesh).count !== 0 && mesh.geometry.drawRange.count !== 0) {
      submitted.meshes++; submitted[state]++;
      if (state !== 'declared') {
        const names = [];
        for (let n: Object3D | null = node; n && n !== scene; n = n.parent) if (n.name) names.push(n.name);
        const region = names.reverse().slice(0, 2).join(' / ') || '(unnamed)';
        gaps.set(region, (gaps.get(region) ?? 0) + 1);
      }
    }
    if (state === 'invalid' || (scope && state === 'unclassified')) errors.push([root?.name, mesh.name || mesh.type, state].filter(Boolean).join(': '));
    if (!scope) return;
    if (typeof decl === 'string') return;
    for (const id of decl.blocks) {
      if (!id || scope.names.get(id) !== 1 || scope.claimed.has(id)) errors.push(root!.name + ': expected one unique collider for ' + (id ?? mesh.name));
      else scope.registrations++;
      if (id) scope.claimed.add(id);
    }
  });
  const registrations: Record<string, number> = {};
  for (const name of requiredRoots) {
    const matches = [...scoped].filter(([root]) => root.name === name);
    if (matches.length !== 1 || !matches[0][1].registrations) errors.push('Missing or ambiguous collision structure: ' + name);
    else registrations[name] = matches[0][1].registrations;
  }
  for (const [root, scope] of scoped) for (const name of scope.names.keys()) {
    if (!scope.claimed.has(name)) errors.push(root.name + ': collider without a visible source: ' + name);
  }
  return { mounted, submitted, submittedGapsByRegion: Object.fromEntries([...gaps].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    registrations, errors };
}

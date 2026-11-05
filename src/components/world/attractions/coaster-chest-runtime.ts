import {
  BufferGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CHEST_OPEN_LID = -1.3;
const OPEN_SHACKLE = -1.12;
const SHACKLE_LIFT = .058;
const number = (i: number) => String(i + 1).padStart(2, '0');

function node(root: Object3D, name: string) {
  const result = root.getObjectByName(name);
  if (!result) throw Error(`Coaster chest asset lacks ${name}`);
  return result;
}
function meshes(root: Object3D) {
  const result: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    if (!(o.material instanceof MeshStandardMaterial) || o.material.transparent || o.material.alphaTest) {
      throw Error('Coaster chest batching requires opaque single-material primitives');
    }
    result.push(o as Mesh<BufferGeometry, MeshStandardMaterial>);
  });
  return result;
}
function joined(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  if (!geometry) throw Error('Incompatible chest geometry attributes');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
function assertSameGeometry(a: BufferGeometry, b: BufferGeometry) {
  if (Object.keys(a.attributes).sort().join() !== Object.keys(b.attributes).sort().join()) throw Error('Different lock attributes');
  for (const key of ['index', ...Object.keys(a.attributes)]) {
    const x = key === 'index' ? a.index : a.getAttribute(key);
    const y = key === 'index' ? b.index : b.getAttribute(key);
    if (!x || !y || x.itemSize !== y.itemSize || x.count !== y.count
      || x.normalized !== y.normalized || x.array.some((v, i) => v !== y.array[i])) {
      throw Error(`Different lock geometry: ${key}`);
    }
  }
}

/** Exact runtime derivative of the approved GLB. It never writes cached input.
 * PBR surfaces keep their geometry/channels. Only repeated lamps/shackles and
 * opaque shadow submissions are regrouped; there is no LOD or simplification.
 */
export function createCoasterChestRuntime(source: Object3D) {
  const reference = source.clone(true);
  reference.updateMatrixWorld(true);
  const inverse = reference.matrixWorld.clone().invert();
  const root = new Group(); root.name = 'coaster-chest-runtime';
  const materialCopies = new Map<Material, MeshStandardMaterial>();
  const ownedGeometry = new Set<BufferGeometry>();
  const ownedMaterials = new Set<Material>();
  const instances: InstancedMesh[] = [];
  const cloneMaterial = (source: MeshStandardMaterial) => {
    let result = materialCopies.get(source);
    if (!result) {
      result = source.clone(); materialCopies.set(source, result); ownedMaterials.add(result);
    }
    return result;
  };
  const originalMeshes = meshes(reference);
  originalMeshes.forEach(m => cloneMaterial(m.material));
  const namedMaterial = (name: string) => {
    const result = [...materialCopies.values()].find(m => m.name === name);
    if (!result) throw Error(`Missing chest material ${name}`);
    return result;
  };
  const opal = namedMaterial('07 Neutral opal status lens');
  const steel = namedMaterial('04 Brushed hardware');
  const brass = namedMaterial('06 Warm lock alloy');
  const active = opal.clone();
  active.name = 'Active cyan status lens';
  active.color.set('#75ded9'); active.emissive.set('#59d8d6'); active.emissiveIntensity = .68;
  ownedMaterials.add(active);

  const shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
  shadowMaterial.name = 'Chest opaque shadow carrier';
  shadowMaterial.shadowSide = DoubleSide;
  ownedMaterials.add(shadowMaterial);
  const shadowMeshes: Mesh[] = [];
  function shell(name: string, dynamic: boolean) {
    const input = node(reference, name);
    const output = new Group(); output.name = name;
    input.matrixWorld.decompose(output.position, output.quaternion, output.scale);
    // These roots are direct scene children; remove the cached scene transform.
    output.applyMatrix4(inverse); output.updateMatrix();
    if (dynamic) output.userData.shadowDynamic = true;
    root.add(output);
    const inv = input.matrixWorld.clone().invert();
    const shadowParts: BufferGeometry[] = [];
    for (const original of meshes(input)) {
      const local = new Matrix4().multiplyMatrices(inv, original.matrixWorld);
      const visible = new Mesh(original.geometry, cloneMaterial(original.material));
      visible.name = original.name;
      visible.matrix.copy(local); visible.matrixAutoUpdate = false;
      visible.castShadow = false; visible.receiveShadow = true;
      output.add(visible);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', original.geometry.getAttribute('position').clone());
      if (!original.geometry.index) throw Error('Chest shadow requires indexed input');
      geometry.setIndex(original.geometry.index.clone());
      geometry.applyMatrix4(local);
      shadowParts.push(geometry);
    }
    const geometry = joined(shadowParts); ownedGeometry.add(geometry);
    const shadow = new Mesh(geometry, shadowMaterial);
    shadow.name = `${name}Shadow`; shadow.castShadow = true;
    output.add(shadow); shadowMeshes.push(shadow);
    return output;
  }
  shell('ChestBody', false);
  const lid = shell('ChestLid', true);

  // Every repeated shackle must match byte-for-byte before instancing. The
  // original mesh-local transform still participates in each instance matrix.
  const shackles = Array.from({ length: 6 }, (_, i) => {
    const carrier = node(reference, `Shackle${number(i)}`);
    const list = meshes(carrier);
    if (list.length !== 1) throw Error('Expected one primitive per shackle');
    return { carrier, mesh: list[0],
      parent: new Matrix4().multiplyMatrices(inverse, carrier.parent!.matrixWorld),
      local: new Matrix4().multiplyMatrices(carrier.matrixWorld.clone().invert(), list[0].matrixWorld),
    };
  });
  for (const { mesh } of shackles) assertSameGeometry(shackles[0].mesh.geometry, mesh.geometry);
  const lockBatches = [brass, steel].map(material => {
    const mesh = new InstancedMesh(shackles[0].mesh.geometry, material, 6);
    mesh.name = `ChestShackles-${material.name}`; mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    root.add(mesh); instances.push(mesh);
    return mesh;
  });

  const lampParts: BufferGeometry[] = [];
  const lampIndices: number[][] = [];
  let offset = 0;
  for (const name of [
    ...Array.from({ length: 6 }, (_, i) => `LockLens${number(i)}`),
    ...Array.from({ length: 7 }, (_, i) => `Signal${number(i)}`),
  ]) {
    const list = meshes(node(reference, name));
    if (list.length !== 1 || list[0].material.name !== opal.name) throw Error('Unexpected chest lamp primitive');
    const mesh = list[0], geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    if (!geometry.index) throw Error('Chest lamp requires indexed input');
    lampIndices.push(Array.from(geometry.index.array, value => value + offset));
    offset += geometry.getAttribute('position').count;
    lampParts.push(geometry);
  }
  const lamps = joined(lampParts); ownedGeometry.add(lamps);
  const lampBatches = [opal, active].map(material => {
    const geometry = lamps.clone(); ownedGeometry.add(geometry);
    geometry.index!.setUsage(DynamicDrawUsage);
    const mesh = new Mesh(geometry, material);
    mesh.name = `ChestLamps-${material.name}`;
    root.add(mesh); return mesh;
  });

  const matrix = new Matrix4(), transform = new Matrix4();
  function setPassed(passed: readonly string[]) {
    const count = [0, 0];
    shackles.forEach(({ carrier, parent, local }, i) => {
      const unlocked = i < passed.length;
      const state = unlocked ? 1 : 0;
      transform.makeRotationY(unlocked ? OPEN_SHACKLE : 0);
      transform.setPosition(carrier.position.x, carrier.position.y + (unlocked ? SHACKLE_LIFT : 0), carrier.position.z);
      matrix.multiplyMatrices(parent, transform).multiply(local);
      lockBatches[state].setMatrixAt(count[state]++, matrix);
    });
    lockBatches.forEach((mesh, i) => {
      mesh.count = count[i]; mesh.visible = count[i] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    });
    const lengths = [0, 0];
    lampIndices.forEach((indices, i) => {
      const enabled = i < 6 ? i < passed.length : passed.includes(`T${i - 5}`);
      const state = enabled ? 1 : 0;
      lampBatches[state].geometry.index!.array.set(indices, lengths[state]);
      lengths[state] += indices.length;
    });
    lampBatches.forEach((mesh, i) => {
      mesh.visible = lengths[i] > 0;
      mesh.geometry.setDrawRange(0, lengths[i]);
      mesh.geometry.index!.needsUpdate = true;
    });
  }
  setPassed([]);
  // No intermediate full-size lamp mesh needs a GPU allocation.
  ownedGeometry.delete(lamps); lamps.dispose();
  const materials = [...materialCopies.values(), active];
  let disposed = false, users = 0;
  function dispose() {
    if (disposed) return;
    disposed = true;
    ownedGeometry.forEach(g => g.dispose());
    ownedMaterials.forEach(m => m.dispose());
    instances.forEach(m => m.dispose());
  }
  function retain() {
    if (disposed) throw Error('Cannot retain disposed chest');
    users++;
    let released = false;
    return () => {
      if (released) return;
      released = true; users--;
      queueMicrotask(() => { if (users === 0) dispose(); });
    };
  }
  root.userData.chestRuntime = {
    sourcePrimitives: originalMeshes.length, maxVisualBatches: 13, shadowBatches: shadowMeshes.length,
  };
  return { root, lid, materials, setPassed, retain, dispose,
    resources: { geometry: ownedGeometry, materials: ownedMaterials, instances },
  };
}

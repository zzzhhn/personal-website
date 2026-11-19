import {
  BufferGeometry, DoubleSide, DynamicDrawUsage, Group, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coasterWorld } from './coaster-track';
import type { IntentClass } from './intent-tasks';
import { coasterModelContact } from './coaster-model-contact';
import { WORKSHOP_INTAKE, WORKSHOP_TOOLS } from './intent-workshop-layout';

export const WORKSHOP_CONTACT_ID = 'coaster-workshop-installed-machines';
export const WORKSHOP_LEVERS = [WORKSHOP_INTAKE, ...WORKSHOP_TOOLS.map(tool=>tool.at)].map(([x,,z],i)=>({
  id:`coaster-workshop-lever-${i+1}`, position:coasterWorld([x+.96,1.3,z+.75]),
}));

const TOOLS: IntentClass[] = ['lookup', 'plan', 'debug', 'rewrite', 'extract', 'act'];

/** The source GLB is already batched by physical material and movement root.
 * Cached source geometry and image maps are borrowed; only material copies,
 * lever instance buffers and joined opaque shadow geometry are owned here.
 */
export function createWorkshopCraftRuntime(source: Object3D) {
  const reference = source.clone(true);
  reference.updateMatrixWorld(true);
  const ownedGeometry = new Set<BufferGeometry>();
  const ownedMaterials = new Set<Material>();
  const materials = new Map<Material, MeshStandardMaterial>();
  const leverBatches: InstancedMesh[] = [];
  const root = new Group(); root.name = 'intent-workshop-craft-render';
  const shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
  shadowMaterial.shadowSide = DoubleSide;
  ownedMaterials.add(shadowMaterial);
  const cloneMaterial = (material: MeshStandardMaterial) => {
    let result = materials.get(material);
    if (!result) {
      result = material.clone(); materials.set(material, result); ownedMaterials.add(result);
    }
    return result;
  };
  function part(name: string) {
    const input = reference.getObjectByName(name);
    if (!input) throw Error(`Workshop craft lacks ${name}`);
    const output = new Group(); output.name = name;
    const inverse = input.matrixWorld.clone().invert();
    input.traverse(object => {
      if (!(object instanceof Mesh)) return;
      if (!(object.material instanceof MeshStandardMaterial) || object.material.transparent || object.material.alphaTest) {
        throw Error('Workshop craft requires opaque single-material primitives');
      }
      const local = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
      const visible = new Mesh(object.geometry, cloneMaterial(object.material));
      visible.name = object.name;
      visible.matrix.copy(local); visible.matrixAutoUpdate = false;
      visible.receiveShadow = true; visible.castShadow = false;
      output.add(visible);
    });
    return output;
  }
  const body = part('StaticWorkshop');
  const contact = coasterModelContact(body, WORKSHOP_CONTACT_ID);
  // Author the shadow silhouette separately. Do not resubmit the detailed
  // near geometry as a second main-pass carrier. The shared GLB still owns
  // this derivative's source buffers; only its joined position copy is ours.
  const shadowSource = reference.getObjectByName('ShadowWorkshop');
  if (!shadowSource) throw Error('Workshop craft lacks ShadowWorkshop');
  const shadowInverse = shadowSource.matrixWorld.clone().invert();
  const silhouette: BufferGeometry[] = [];
  shadowSource.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', object.geometry.getAttribute('position').clone());
    if (object.geometry.index) geometry.setIndex(object.geometry.index.clone());
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(shadowInverse, object.matrixWorld));
    silhouette.push(geometry);
  });
  const shadowGeometry = mergeGeometries(silhouette, false);
  silhouette.forEach(g => g.dispose());
  if (!shadowGeometry) throw Error('Incompatible workshop silhouette geometry');
  ownedGeometry.add(shadowGeometry);
  const opaqueShadow = new Mesh(shadowGeometry, shadowMaterial);
  opaqueShadow.name = 'WorkshopIndependentOpaqueShadow'; opaqueShadow.castShadow = true;
  opaqueShadow.userData = { worldCollision: 'none', worldCollisionReason: 'Independent shadow silhouette with color and depth writes disabled' };
  body.add(opaqueShadow);
  body.position.set(...coasterWorld([0, 0, 0])); root.add(body);
  const capsule = part('RequestCarrier');
  capsule.userData = { worldCollision: 'none', worldCollisionReason: 'Animated request cassette runs over the physical rollers, cabinets and carrier rails' };
  const saddles = part('RequestSaddles'); capsule.add(saddles);
  capsule.visible = false; root.add(capsule);
  const motion = Object.fromEntries(TOOLS.map(tool => {
    const group = part(`Motion_${tool}`);
    group.userData = { worldCollision: 'none', worldCollisionReason: 'Animated readout or machine output on the fixed work surface' };
    group.visible = false; root.add(group); return [tool, group];
  })) as Record<IntentClass, Group>;

  // Seven identical handles share the exact full authored geometry. Different
  // material primitives are instanced with the same seven x-axis pivot matrices.
  const lever = part('ControlLever');
  const leverContact = coasterModelContact(lever, 'workshop-lever-template').vertices;
  const leverLocal: Matrix4[] = [];
  for (const object of lever.children) {
    if (!(object instanceof Mesh)) continue;
    if (!(object.material instanceof MeshStandardMaterial)) throw Error('Workshop handle primitive requires one PBR material');
    const mesh = new InstancedMesh(object.geometry, object.material, 7);
    mesh.name = `WorkshopControl-${object.material.name}`;
    mesh.userData = { worldCollision: 'solid', worldCollisionInstances: { slots:WORKSHOP_LEVERS.map((_,i)=>i),
      placements:WORKSHOP_LEVERS.map(({id})=>({id,matrix:new Matrix4()})) } };
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    leverBatches.push(mesh); leverLocal.push(object.matrix.clone()); root.add(mesh);
  }
  const transform = new Matrix4();
  function setLeverAt(index: number, matrix: Matrix4) {
    leverBatches.forEach((mesh, i) => {
      transform.multiplyMatrices(matrix, leverLocal[i]);
      mesh.setMatrixAt(index, transform);
      mesh.userData.worldCollisionInstances.placements[index].matrix.copy(transform);
    });
  }
  function updateLevers() {
    leverBatches.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }
  const leverRest = new Matrix4();
  WORKSHOP_LEVERS.forEach(({position:[x,y,z]},i)=>setLeverAt(i,leverRest.makeTranslation(x,y,z)));
  let users = 0, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    ownedGeometry.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose());
    leverBatches.forEach(mesh => mesh.dispose());
  }
  function retain() {
    if (disposed) throw Error('Retaining disposed workshop');
    users++;
    let released = false;
    return () => {
      if (released) return;
      released = true; users--;
      queueMicrotask(() => { if (!users) dispose(); });
    };
  }
  return { root, contact, leverContact, capsule, saddles, motion, materials: [...materials.values()], setLeverAt, updateLevers, retain, dispose,
    resources: { ownedGeometry, ownedMaterials, leverBatches } };
}

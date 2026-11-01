import { FrontSide, Group, InstancedMesh, Matrix4, type Mesh, type MeshStandardMaterial, type Object3D, type Texture } from 'three';

export const CAMP_CRAFT_ASSET = '/assets/world/camp/craft/camp-props-v1.glb';
export type CampCraftFamily = 'C05' | 'C06' | 'C07';
export const CAMP_CRAFT_CONTACT = Object.freeze({
  C06: { top: 0.6000000238418579, seatOffsets: [-1, 1], halfLength: 2.4, halfWidth: 0.38 },
  C07: { top: 0.8520448207855225, bookBase: 0.85 },
});

export function campCraftLegacy(search: string) {
  const query = new URLSearchParams(search);
  return query.get('qa') === '1' && query.get('campCraft') === 'legacy';
}

/** Borrow loader geometry/images and the renderer's existing shared environment.
 * Own one material clone per source material for this family's fixed instances.
 * Colliders and seating never use this art. */
export function createCampCraftVisual(source: Object3D, family: CampCraftFamily, placements: Matrix4[], environment: Texture | null = null) {
  const asset = source.getObjectByName(family);
  if (!asset) throw new Error(`Camp craft pack missing ${family}`);
  source.updateMatrixWorld(true);
  const root = new Group();
  root.name = `camp-craft-${family}`;
  const instances: InstancedMesh[] = [], matrix = new Matrix4();
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  asset.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const copied = originals.map(original => {
      const material = original as MeshStandardMaterial;
      let copy = materials.get(material);
      if (!copy) {
        copy = material.clone(); copy.envMap = environment; copy.envMapIntensity = 1.5; copy.side = FrontSide;
        // clone() borrows existing texture objects, preserving pixels, samplers,
        // color spaces, UV transforms and all exported PBR factors.
        materials.set(material, copy);
      }
      return copy;
    });
    const instance = new InstancedMesh(mesh.geometry, Array.isArray(mesh.material) ? copied : copied[0], placements.length);
    instance.name = `camp-craft-${family}-${mesh.name}`;
    instance.userData = { assetId: family, solid: true, craftVisual: true };
    instance.castShadow = true; instance.receiveShadow = true;
    placements.forEach((placement, i) => instance.setMatrixAt(i, matrix.multiplyMatrices(placement, mesh.matrixWorld)));
    instance.instanceMatrix.needsUpdate = true;
    instance.computeBoundingBox(); instance.computeBoundingSphere();
    root.add(instance); instances.push(instance);
  });
  if (!instances.length) throw new Error(`Camp craft pack empty ${family}`);
  let disposed = false;
  return { root, instances, materials: [...materials.values()],
    setNight(amount: number) {
      for (const material of materials.values()) material.envMapIntensity = 1.5 - Math.max(0, Math.min(1, amount));
    },
    dispose() {
      if (disposed) return; disposed = true;
      instances.forEach(instance => instance.dispose()); materials.forEach(material => material.dispose());
    },
  };
}

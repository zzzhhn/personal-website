import { Matrix4, SkinnedMesh, type Object3D } from 'three';

/** QA-only snapshots of the actual post-mixer/post-IK skin. Recording bone matrices
 * instead of all deformed vertices keeps transition evidence small enough to replay.
 * This is CPU skinning evidence; it does not claim bit-identical GPU arithmetic. */
export function guideSkinEvidence(scene: Object3D, topology = false) {
  const guide = scene.getObjectByName('world-guide-G24');
  if (!guide) return null;
  guide.updateWorldMatrix(true, true);
  const inverseGuide = guide.matrixWorld.clone().invert();
  const meshes: Record<string, unknown>[] = [];
  const palettes = new Map<string, number>();
  const skeletons: number[][] = [];
  guide.traverse(object => {
    if (!(object instanceof SkinnedMesh)) return;
    object.skeleton.update();
    const boneMatrices = object.skeleton.boneMatrices;
    if (!boneMatrices) throw new Error('G24 QA skin palette is not initialized');
    const key = object.skeleton.bones.map(bone => bone.uuid).join(',');
    let skeleton = palettes.get(key);
    if (skeleton === undefined) {
      skeleton = skeletons.length; palettes.set(key, skeleton);
      skeletons.push(Array.from(boneMatrices));
    }
    const row: Record<string, unknown> = {
      id: object.uuid, name: object.name,
      skeleton,
      bindMatrix: object.bindMatrix.toArray(), bindMatrixInverse: object.bindMatrixInverse.toArray(),
      meshToGuide: new Matrix4().multiplyMatrices(inverseGuide, object.matrixWorld).toArray(),
    };
    if (topology) {
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');
      const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
      const attributeArray = (attribute: typeof positions, size: number) => {
        const result: number[] = [];
        for (let i = 0; i < attribute.count; i++) {
          result.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
          if (size === 4) result.push(attribute.getW(i));
        }
        return result;
      };
      row.positions = attributeArray(positions, 3);
      row.skinIndex = attributeArray(joints, 4);
      row.skinWeight = attributeArray(weights, 4);
      row.indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: positions.count }, (_, i) => i);
      row.groups = geometry.groups;
      row.bones = object.skeleton.bones.map(bone => bone.name);
    }
    meshes.push(row);
  });
  return { space: 'guide-local; Y-up; column-major matrices', guideToWorld: guide.matrixWorld.toArray(), skeletons, meshes };
}

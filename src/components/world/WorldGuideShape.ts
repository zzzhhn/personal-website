import { Matrix4, SkinnedMesh, Vector3, type Object3D } from 'three';

/** Refine the rigid boot's lower silhouette in bind space, preserving ankle, sole height and shaft.
 * Shorter toes and a narrower outsole reduce the flipper-like swing silhouette. Shared GLB geometry
 * stays immutable. All runtime phase/sole measurements must use this same refined scene. */
export function refineGuideBoots(scene: Object3D) {
  scene.updateWorldMatrix(true, true);
  const owned: SkinnedMesh['geometry'][] = [];
  const point = new Vector3(), pivot = new Vector3(), inverse = new Matrix4();
  scene.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const g = o.geometry, ids = g.getAttribute('skinIndex'), weights = g.getAttribute('skinWeight');
    if (!ids || !weights) return;
    const feet = o.skeleton.bones.map((b,i) => /^foot[._]?[LR]$/.test(b.name) ? i : -1).filter(i => i >= 0);
    const rigid = new Map<number, number>();
    for (let i = 0; i < ids.count; i++) for (const foot of feet) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (ids.getComponent(i,k) === foot) weight += weights.getComponent(i,k);
      if (weight >= .98) rigid.set(i,foot);
    }
    if (!rigid.size) return;
    o.geometry = g.clone(); owned.push(o.geometry);
    const positions = o.geometry.getAttribute('position'); inverse.copy(o.matrixWorld).invert();
    for (const [i, foot] of rigid) {
      point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
      o.skeleton.bones[foot].getWorldPosition(pivot);
      // Keep the upper shaft at its authored size so trouser attachment does not open up.
      const lower = 1 - Math.min(1, Math.max(0, (point.y - pivot.y) / .12));
      point.x = pivot.x + (point.x - pivot.x) * (1 - .06 * lower);
      point.z = pivot.z + (point.z - pivot.z) * (1 - .10 * lower);
      point.applyMatrix4(inverse); positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate = true;
    o.geometry.computeVertexNormals(); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
  });
  return () => owned.forEach(g => g.dispose());
}

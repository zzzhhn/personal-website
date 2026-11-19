import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { campFixedBody } from './WorldCampPhysics';

export const CAMP_WOK_FEEDBACK_SECONDS = 1.8;
export type CampCookwarePart = 'stove' | 'wok';
export const campCookwareColliderKey = (part: CampCookwarePart) => `camp-content-collider-C14-${part}`;

/** Take the part's authored installation and the contact triangles from the same tree.
 * The cooker stays at the ring pad. The wok rotates about the exported bottom of its bowl. */
export function prepareCampCookware(root: Object3D, placement: Matrix4, part: CampCookwarePart, crafted: boolean) {
  const object = root.getObjectByName(`C14_${part}`);
  if (!object) throw new Error(`Camp cookware is missing its ${part}`);
  object.updateWorldMatrix(true, false);
  const frame = new Matrix4().multiplyMatrices(placement, object.matrixWorld);
  const position = new Vector3(), orientation = new Quaternion(), scale = new Vector3();
  frame.decompose(position, orientation, scale);
  if (scale.x <= 0 || Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.x - scale.z) > 1e-6) {
    throw new Error('Camp cookware requires a positive uniform scale');
  }
  const visual = object.clone(true);
  visual.position.set(0, 0, 0);
  visual.quaternion.identity();
  visual.scale.setScalar(1);
  visual.updateMatrix();
  visual.name = crafted ? `camp-facility-C14-C14_${part}` : `camp-C14-legacy-${part}`;
  visual.userData = { ...visual.userData, assetId: 'C14', solid: true, worldCollision: 'solid',
    surfaceId: campCookwareColliderKey(part), worldCollisionSharedSurface: true };
  // The fallback borrows the same geometry and material references as the
  // rendered subtree. Neither branch mutates the GLTF cache or its attributes.
  const shape = campFixedBody(visual)?.[0];
  if (shape?.kind !== 'trimesh') throw new Error(`Camp cookware has no physical triangles for ${part}`);
  return { visual, position, orientation, scale: scale.x,
    vertices: shape.vertices.map(coordinate => coordinate * scale.x), indices: shape.indices };
}

export function campCookwareWokPose(elapsed: number, home: ReturnType<typeof prepareCampCookware>, position: Vector3, rotation: Quaternion) {
  const lifting = elapsed >= 0 && elapsed < .6;
  const turning = elapsed >= 0 && elapsed < CAMP_WOK_FEEDBACK_SECONDS;
  const lift = lifting ? .09 * Math.sin(Math.PI * elapsed / .6) * home.scale : 0;
  const tilt = turning ? .12 * Math.sin(elapsed * 9) * (1 - elapsed / CAMP_WOK_FEEDBACK_SECONDS) : 0;
  position.set(0, lift, 0).applyQuaternion(home.orientation).add(home.position);
  rotation.set(0, 0, Math.sin(tilt / 2), Math.cos(tilt / 2)).premultiply(home.orientation);
}

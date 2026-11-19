import type { RigidBody } from '@dimforge/rapier3d-compat';
import { BufferGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TransportRoute, TransportSample } from '../../rides/ride-contract';
import dimensions from './transport-dimensions.json' with { type: 'json' };

export const transportGripHeight = dimensions.cable.cableHeight;
export const cableCanopyPostHeight = dimensions.cable.canopyHeight - .125;
export const cableCanopyPostGeometry = () => new CylinderGeometry(.13, .17, cableCanopyPostHeight, 12);
const tiltAxis = new Vector3(0, 0, 1);

/** Read the shipped mesh in the local frame of its moving render/physics body. */
export function transportVehicleParts(scene: Object3D, kind: TransportRoute['kind']) {
  const parts: { name: string; group: 'body' | 'grip'; geometry: BufferGeometry; material: MeshStandardMaterial }[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const group = kind === 'cable' && object.name.startsWith('grip') ? 'grip' : 'body';
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    if (group === 'grip') geometry.translate(0, -transportGripHeight, 0);
    parts.push({ name: object.name, group, geometry, material: object.material as MeshStandardMaterial });
  });
  return parts;
}

/** Preserve the source triangles while stripping attributes that Rapier never reads. */
export function transportVehicleCollider(parts: readonly { geometry: BufferGeometry }[]) {
  if (!parts.length) return null;
  const geometries = parts.map(({ geometry }) => {
    const shape = new BufferGeometry().setAttribute('position', geometry.attributes.position);
    shape.setIndex(geometry.index);
    return shape;
  });
  const combined = mergeGeometries(geometries, false);
  if (!combined) throw new Error('Transport contact meshes cannot be merged');
  const vertices = combined.attributes.position.array as Float32Array;
  const indices = combined.index ? Uint32Array.from(combined.index.array) : Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i);
  combined.dispose();
  return { vertices, indices };
}

export function transportGripPose(sample: TransportSample) {
  const orientation = new Quaternion(...sample.orientation);
  const position = new Vector3(0, transportGripHeight, 0).applyQuaternion(orientation).add(new Vector3(...sample.vehicle));
  return { position, orientation: orientation.multiply(new Quaternion().setFromAxisAngle(tiltAxis, sample.cablePitch ?? 0)) };
}

export function transportContactReady(body: RigidBody | null) {
  if (!body?.isValid() || !body.isEnabled() || body.numColliders() !== 1) return false;
  const collider = body.collider(0);
  return collider.isValid() && collider.isEnabled() && !collider.isSensor();
}

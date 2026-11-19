import { Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import { FACTORY_MODULES, type FactoryGame } from './factory-game.ts';
import type { FactoryOperation } from './factory-operation.ts';

const storage = { x: 0, y: -2048, z: 0 };

/** Flatten only parts whose motion shares the same local rigid pose. */
export function factoryMovingMeshContact(root: Object3D, id: string) {
  const meshes: Mesh[] = [];
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert(), matrix = new Matrix4(), p = new Vector3();
  const vertices: number[] = [], indices: number[] = [];
  root.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.geometry.index) return;
    meshes.push(mesh);
    const offset = vertices.length / 3, index = mesh.geometry.index, position = mesh.geometry.attributes.position;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i).applyMatrix4(matrix);
      vertices.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < index.count; i++) indices.push(offset + index.getX(i));
  });
  return { id, meshes, args: [Float32Array.from(vertices), Uint32Array.from(indices)] as [Float32Array, Uint32Array] };
}

export function factoryVisualOnly(node: Object3D, reason: string) {
  node.userData.worldCollision = 'none';
  node.userData.worldCollisionReason = reason;
  delete node.userData.surfaceId;
  delete node.userData.worldCollisionSharedSurface;
}

export function factoryMovingContact(id: string, meshes: Mesh[] = []) {
  const surface = { id, meshes, body: null as RigidBody | null, collider: null as Collider | null, shown: undefined as boolean | undefined };
  const position = new Vector3(), previousPosition = new Vector3(), rotation = new Quaternion(), previousRotation = new Quaternion();
  let groups = 0;
  for (const mesh of meshes) factoryVisualOnly(mesh, 'This production part is absent at the current step.');
  return Object.assign(surface, {
    attachCollider(collider: Collider | null) {
      surface.collider = collider;
      if (!collider) return;
      surface.shown = undefined;
      groups = collider.collisionGroups();
      collider.setCollisionGroups(0);
      collider.setEnabled(false);
    },
    sync(pose: Object3D, shown: boolean, rotate = false, reset = false) {
      const { collider, body } = surface;
      if (!body?.isValid() || !collider?.isValid()) return;
      if (surface.shown !== shown) {
        for (const mesh of surface.meshes) {
          if (shown) {
            mesh.userData.worldCollision = 'solid';
            mesh.userData.surfaceId = id;
            mesh.userData.worldCollisionSharedSurface = surface.meshes.length > 1;
            delete mesh.userData.worldCollisionReason;
          } else {
            factoryVisualOnly(mesh, 'This production part is absent at the current step.');
          }
        }
        // Unfiltered Rapier scene queries can still find a disabled collider
        // until its broad-phase entry moves. Store it off-world without a sweep.
        if (!shown) {
          body.setTranslation(storage, false);
          body.setNextKinematicTranslation(storage);
        }
        collider.setCollisionGroups(shown ? groups : 0);
        collider.setEnabled(shown);
      }
      if (shown) {
        pose.getWorldPosition(position);
        if (rotate) pose.getWorldQuaternion(rotation);
        // Reappearing or cancelled stock is already at its reset point. Follow
        // normal kinematic motion during continuous travel only.
        if (surface.shown !== true || reset) {
          body.setTranslation(position, false);
          if (rotate) body.setRotation(rotation, false);
        }
        if (surface.shown !== true || !previousPosition.equals(position)) {
          body.setNextKinematicTranslation(position); previousPosition.copy(position);
        }
        if (rotate && (surface.shown !== true || !previousRotation.equals(rotation))) {
          body.setNextKinematicRotation(rotation); previousRotation.copy(rotation);
        }
      }
      surface.shown = shown;
    },
  });
}

/** Read gameplay state from the venue parent, so deleting a whole contact root
 * still fails the inventory. The trial and archived model mount on demand. */
export function factoryActiveContactCounts(active: boolean, game: FactoryGame, operation: FactoryOperation | null) {
  const trial = game.pending?.action.type === 'test' ? game.pending.action : null;
  let mechanisms = 0;
  if (active) {
    // Rams, guards, gripper and magnet, plus one raw blank or carrier per line.
    mechanisms = 10 + FACTORY_MODULES.length;
    for (const module of FACTORY_MODULES) {
      const outfeed = operation?.action.type === 'process' && operation.action.module === module && operation.phase === 'outfeed';
      const produced = !!game.parts[module] || outfeed;
      if (game.released || (produced && !trial)) mechanisms++; // Companion module.
    }
  }
  return {
    'factory-report-printer-contact': active ? 3 : 0,
    'factory-live-mechanisms': mechanisms,
    'factory-physical-trials': active && trial ? trial.mode === 'comparison' ? 2 : 1 : 0,
    'factory-completed-companion': active && game.archives.length ? 2 : 0,
  };
}

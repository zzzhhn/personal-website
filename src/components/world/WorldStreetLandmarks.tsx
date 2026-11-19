/** Fixed foundations and animated ridge windmill, deriving collision from the visual builders. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, TrimeshCollider, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { Matrix4, Quaternion, Sphere, Vector3 } from 'three';
import { FOUNDATIONS_V4, RIDGE_V4 } from './layout-v4';
import { buildTerrain, GRID, CELL } from './WorldLandform';
import { foundationBurial, exposedFoundation, foundationRanges } from './street-foundation-surface';
import { windUniforms } from './WorldWind';
import StreetStatic, { StreetClaim, type StaticKind, type StaticPlacement } from './WorldStreetStatic';
import { StreetBatch } from './WorldStreetBatch';
import { createStreetDepthMaterial, createStreetMaterial } from './WorldStreetMaterial';
import * as A from './WorldStreetAssets';
import StreetConstructionSigns from './WorldStreetConstructionSigns';
import { installedStreetContact } from './street-installed-contact';
import type { BatchedCollisionSources } from './world-collision-inventory';
const matrix = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
export function StreetFoundations() {
  const built = useMemo(() => {
    const terrain = buildTerrain();
    const kinds: StaticKind[] = FOUNDATIONS_V4.map(({ id, position, size }) => {
      const buried = foundationBurial(terrain, GRID, CELL, position, size);
      const geometry = (level: 0 | 1) => exposedFoundation(A.foundationSlab(level, size[0], size[2]), buried);
      return { id, L0: geometry(0), L1: geometry(1), lodNear: 45, far: 140,
        collide: 'trimesh', surfaceRanges: foundationRanges };
    });
    const placements: StaticPlacement[] = FOUNDATIONS_V4.map(f => ({ kind: f.id, matrix: matrix(f.position[0], f.position[1] - f.size[1] / 2, f.position[2]), surface: true }));
    return { kinds, placements };
  }, []);
  return <group name="street-foundations-group">
    <StreetStatic name="street-foundation-slabs" claims={[]} kinds={built.kinds} placements={built.placements} assetId="street-foundation" />
    <StreetConstructionSigns />
    <StreetClaim keys={['foundation']} />
  </group>;
}
export function StreetWindmill() {
  const body = useRef<RapierRigidBody>(null);
  const built = useMemo(() => {
    const [x, z] = RIDGE_V4.center, y = RIDGE_V4.topY;
    const p = new Vector3(x - 1.4, y + 11.7, z), axis = new Vector3(1, 0, 0), scale = new Vector3(1, 1, 1);
    const angle = windUniforms.uWindTime.value * .65;
    const start = new Quaternion().setFromAxisAngle(axis, angle);
    const kinds: StaticKind[] = [{ id: 'tower', L0: A.windmillTower(0), L1: A.windmillTower(1), lodNear: 55, far: 195, collide: 'installed' }];
    const placements = [{ kind: 'tower', matrix: matrix(x, y, z) }];
    const material = createStreetMaterial(null, 'street-windmill-rotor');
    const builders = [A.windmillRotor(0), A.windmillRotor(1)], [L0, L1] = builders.map(builder => builder.build());
    const rotor = new StreetBatch('street-windmill-rotor', [{ id: 'rotor', L0, L1, lodNear: 55, far: 195 }], [1], material);
    const id = rotor.add(0, new Matrix4().compose(p, start, scale));
    const sources = [L0, L1].map((geometry, level) => installedStreetContact(builders[level], geometry, 'rotor'));
    const geometries = ([0, 1] as const).map(level => ({ id: rotor.geometryId(0, level), ranges: sources[level].ranges }));
    const colliderPrefix = 'street-windmill/';
    const ownership: BatchedCollisionSources = { geometries, placements: [
      { id: 'ridge-windmill', slot: id, matrix: rotor.sourceMatrix(id), geometryIds: geometries.map(geometry => geometry.id), colliderPrefix },
    ] };
    rotor.mesh.userData.worldCollisionBatchedInstances = ownership;
    rotor.mesh.userData.assetId = 'street-windmill';
    rotor.mesh.userData.noOcclusionFade = true;
    // Measure the entire sweep around the spindle at both display distances.
    const point = new Vector3();
    let reach = 0;
    for (const geometry of [L0, L1]) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) reach = Math.max(reach, point.fromBufferAttribute(positions, i).length());
    }
    rotor.finish(1);
    rotor.mesh.boundingSphere = new Sphere(p.clone(), reach + .001);
    rotor.mesh.geometry.boundingSphere = rotor.mesh.boundingSphere.clone();
    rotor.mesh.castShadow = true; rotor.mesh.receiveShadow = true;
    rotor.mesh.customDepthMaterial = createStreetDepthMaterial();
    const last = { l0: 0, l1: 0 };
    rotor.mesh.userData.streetStats = () => ({ tris: last.l0 + last.l1, instances: 1 });
    return { kinds, placements, rotor, material, id, p, axis, scale, angle, start, last,
      target: start.clone(), actual: start.clone(), matrix: new Matrix4(),
      vertices: L0.attributes.position.array as Float32Array, indices: sources[0].indices, shape: colliderPrefix + 'rotor' };
  }, []);
  useEffect(() => () => { built.rotor.mesh.customDepthMaterial?.dispose(); built.rotor.dispose(); built.material.dispose(); }, [built]);
  useBeforePhysicsStep(() => {
    const next = windUniforms.uWindTime.value * .65;
    if (!body.current || next === built.angle) return;
    built.angle = next;
    body.current.setNextKinematicRotation(built.target.setFromAxisAngle(built.axis, next));
  });
  useFrame(({ camera }) => {
    if (body.current) {
      const { x, y, z, w } = body.current.rotation();
      if (built.actual.x !== x || built.actual.y !== y || built.actual.z !== z || built.actual.w !== w) {
        built.actual.set(x, y, z, w);
        built.rotor.setMatrix(built.id, built.matrix.compose(built.p, built.actual, built.scale));
      }
    }
    Object.assign(built.last, built.rotor.update(camera));
  });
  return <group name="street-windmill-group">
    <StreetStatic name="street-windmill-tower" claims={[]} kinds={built.kinds} placements={built.placements} assetId="street-windmill" occluder />
    <primitive object={built.rotor.mesh} />
    <RigidBody ref={body} type="kinematicPosition" colliders={false} name="street-windmill-rotor-body"
      position={[built.p.x, built.p.y, built.p.z]} quaternion={[built.start.x, built.start.y, built.start.z, built.start.w]}
      userData={{ solid: true, assetId: 'street-windmill' }}>
      <TrimeshCollider name={built.shape} args={[built.vertices, built.indices]} friction={.65} restitution={.05} />
    </RigidBody>
    <StreetClaim keys={['windmill']} />
  </group>;
}

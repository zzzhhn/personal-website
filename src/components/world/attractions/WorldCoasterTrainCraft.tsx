import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useDjcFurnitureEnvironment } from '../WorldDjcFurnitureEnvironment';
import { night } from '../WorldNight';
import { coasterModelContact } from './coaster-model-contact';
import { coasterFrame, COASTER_LENGTH } from './coaster-track';
import type { InstanceCollisionSources } from '../world-collision-inventory';
import assetUrl from '../../../../docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/coaster-car.glb?url';
import distantUrl from '../../../../docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/coaster-car-distant.glb?url';

const carContactId = (i: number) => `coaster-parked-car-${i + 1}`;

/** Preserve the instanced draw. Each parked car gets the exact near-source shape;
 * drop those forms while the route and the cabin animation own the rider. */
export default function WorldCoasterTrainCraft({ cars, contactActive = false }: {
  cars: RefObject<(Group | null)[]>; contactActive?: boolean;
}) {
  const near = useGLTF(assetUrl), far = useGLTF(distantUrl);
  const environment = useDjcFurnitureEnvironment();
  const root = useRef<Group>(null);
  const pack = useMemo(() => {
    const levels = [new Group(), new Group()];
    const materials = new Map<string, MeshStandardMaterial>();
    near.scene.updateMatrixWorld(true); far.scene.updateMatrixWorld(true);
    near.scene.traverse(o => {
      if (o instanceof Mesh) {
        const source = o.material as MeshStandardMaterial;
        if (!materials.has(source.name)) materials.set(source.name, source.clone());
      }
    });
    const meshes: { mesh: InstancedMesh; local: Matrix4; source?: InstanceCollisionSources }[] = [];
    for (const [index, source] of [near.scene, far.scene].entries()) {
      source.traverse(o => {
        if (!(o instanceof Mesh)) return;
        const material = materials.get((o.material as MeshStandardMaterial).name);
        if (!material) throw Error(`Missing carriage material: ${(o.material as MeshStandardMaterial).name}`);
        const mesh = new InstancedMesh(o.geometry, material, 3);
        mesh.name = `car-craft-${index}-${o.name}`;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        // A shared silhouette carrier below casts the opaque train shadow once.
        // Never cast from both visual LODs through detached shadow proxies.
        mesh.castShadow = false; mesh.receiveShadow = true;
        const placements = Array.from({ length: 3 }, (_, i) => ({ id: carContactId(i), matrix: new Matrix4() }));
        const source = { placements, slots: [0, 1, 2] };
        Object.assign(mesh.userData, { worldCollision: 'solid', worldCollisionInstances: source });
        levels[index].add(mesh); meshes.push({ mesh, local: o.matrixWorld.clone(), source });
      });
    }
    levels[1].visible = false;
    const shadowParts = levels[1].children.map((o, i) => (o as Mesh).geometry.clone().applyMatrix4(meshes[levels[0].children.length+i].local));
    const shadowGeometry = mergeGeometries(shadowParts, false)!;
    shadowParts.forEach(g => g.dispose());
    const shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
    const carrier = new InstancedMesh(shadowGeometry, shadowMaterial, 3);
    carrier.name = 'coaster-craft-shadow-carrier'; carrier.castShadow = true;
    Object.assign(carrier.userData, { worldCollision: 'none', worldCollisionReason: 'Moving carriage shadow silhouette' });
    carrier.instanceMatrix.setUsage(DynamicDrawUsage);
    meshes.push({ mesh: carrier, local: new Matrix4() });
    let contact: ReturnType<typeof coasterModelContact> | undefined;
    return { levels, meshes, materials, carrier, shadowGeometry, shadowMaterial,
      parkedContact: () => contact ??= coasterModelContact(near.scene.clone(true), 'coaster-parked-car'),
      last: Array.from({ length: 3 }, () => { const m = new Matrix4(); m.elements.fill(NaN); return m; }),
      matrix: new Matrix4(), position: new Vector3(), night: NaN, lod: 0, stats: { lod: 0, uploads: 0, materials: materials.size, shadowTriangles: shadowGeometry.index!.count/3 } };
  }, [near.scene, far.scene]);
  const contact = contactActive ? pack.parkedContact() : null;
  useEffect(() => {
    for (const material of pack.materials.values()) { material.envMap = environment; material.needsUpdate = true; }
  }, [pack, environment]);
  useEffect(() => () => {
    for (const material of pack.materials.values()) material.dispose();
    for (const { mesh } of pack.meshes) mesh.dispose();
    pack.shadowGeometry.dispose(); pack.shadowMaterial.dispose();
  }, [pack]);
  useFrame(({ camera }) => {
    if (!root.current || cars.current.some(c => !c)) return;
    let changed = false, nearest = Infinity;
    cars.current.forEach((car, i) => {
      car!.updateMatrix();
      if (!car!.matrix.equals(pack.last[i])) {
        pack.last[i].copy(car!.matrix); changed = true;
        for (const { mesh, local, source } of pack.meshes) {
          pack.matrix.multiplyMatrices(car!.matrix, local);
          mesh.setMatrixAt(i, pack.matrix);
          source?.placements[i].matrix.copy(pack.matrix);
        }
      }
      // Both visual and car roots have the same parent. Convert to world for LOD.
      pack.position.copy(car!.position); root.current!.parent!.localToWorld(pack.position);
      nearest = Math.min(nearest, camera.position.distanceToSquared(pack.position));
    });
    if (changed) {
      for (const { mesh } of pack.meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
      pack.stats.uploads++;
    }
    const next = pack.lod === 0 ? (nearest > 50*50 ? 1 : 0) : (nearest < 44*44 ? 0 : 1);
    if (next !== pack.lod) {
      pack.lod = next;
      pack.levels.forEach((level, i) => {
        level.visible = i === next;
      });
    }
    if (pack.night !== night.value) {
      pack.night = night.value;
      for (const material of pack.materials.values()) material.envMapIntensity = .85*(1-night.value)+.5*night.value;
    }
    pack.stats.lod = pack.lod;
    root.current.userData.carCraft = pack.stats;
  }, -59);
  return <group ref={root} name="coaster-train-craft" userData={{ shadowDynamic: true }} dispose={null}>
    {pack.levels.map((level, i) => <primitive key={i} object={level} />)}
    <primitive object={pack.carrier}/>
    {contact && [0, 1, 2].map(i => {
      const frame = coasterFrame(-i * 3.55 / COASTER_LENGTH), id = carContactId(i);
      return <RigidBody key={id} type="fixed" colliders={false} position={frame.point} quaternion={frame.rotation}
        userData={{ solid: true, assetId: 'coaster-parked-car' }}>
        <TrimeshCollider name={id} args={[contact.vertices, contact.indices]} />
      </RigidBody>;
    })}
  </group>;
}

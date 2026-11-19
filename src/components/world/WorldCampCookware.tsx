import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { AnyCollider, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { Box3, Quaternion, Vector3, type Group, type Matrix4, type Object3D } from 'three';
import { campCookwareColliderKey, campCookwareWokPose, prepareCampCookware, type CampCookwarePart } from './camp-cookware-contact';
import type { Vec3 } from './types';

type Cookware = ReturnType<typeof prepareCampCookware>;
type BodyRef = RefObject<RapierRigidBody | null>;
type CookwareRecord = { id: 'C14'; aabb: { min: Vec3; max: Vec3 } };
const solid = { solid: true, assetId: 'C14' };
let readInstalledCookware: (() => CookwareRecord | null) | null = null;
export const campCookwareHardRecord = () => readInstalledCookware?.() ?? null;

function CookwareBody({ body, part, shape, position, rotation }: {
  body: BodyRef; part: CampCookwarePart; shape: Cookware; position: Vector3; rotation: Quaternion;
}) {
  const { rapier } = useRapier();
  return <RigidBody ref={body} type={part === 'wok' ? 'kinematicPosition' : 'fixed'} colliders={false}
    name={`camp-content-body-C14-${part}`} position={position} quaternion={rotation} userData={solid}>
    <AnyCollider name={campCookwareColliderKey(part)} shape="trimesh" friction={.6} restitution={.05}
      args={[shape.vertices, shape.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES] as unknown as [Float32Array, Uint32Array]} />
  </RigidBody>;
}

function MovingWok({ shape, body, elapsed }: { shape: Cookware; body: BodyRef; elapsed: () => number }) {
  const visual = useRef<Group>(null);
  const initial = useMemo(() => {
    const position = new Vector3(), rotation = new Quaternion();
    campCookwareWokPose(elapsed(), shape, position, rotation);
    return { position, rotation };
  }, [elapsed, shape]);
  const next = useMemo(() => ({ position: new Vector3(), rotation: new Quaternion() }), []);
  const moving = useRef(false), writeVisual = useRef(false);
  useBeforePhysicsStep(() => {
    const wok = body.current;
    if (!wok) return;
    const time = elapsed();
    if (time < 0 && !moving.current) return;
    moving.current = time >= 0;
    campCookwareWokPose(time, shape, next.position, next.rotation);
    wok.setNextKinematicTranslation(next.position);
    wok.setNextKinematicRotation(next.rotation);
    writeVisual.current = true;
  });
  useAfterPhysicsStep(() => {
    if (!writeVisual.current || !visual.current || !body.current) return;
    writeVisual.current = false;
    // Follow the solved pose directly. Body interpolation would otherwise
    // draw the thin cookware one step behind the actual collision queries.
    const at = body.current.translation(), rotation = body.current.rotation();
    visual.current.position.set(at.x, at.y, at.z);
    visual.current.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  });
  return <>
    <group ref={visual} position={initial.position} quaternion={initial.rotation} scale={shape.scale}
      name="camp-content-C14-wok" userData={{ shadowDynamic: true }}>
      <primitive object={shape.visual} dispose={null} />
    </group>
    <CookwareBody part="wok" body={body} shape={shape} position={initial.position} rotation={initial.rotation} />
  </>;
}

/** Both the loader's chosen subtree and its fallback mount this component, so
 * each visual transaction also owns exactly its two Rapier shapes. */
export default function WorldCampCookware({ root, placement, elapsed, crafted = false }: {
  root: Object3D; placement: Matrix4; elapsed: () => number; crafted?: boolean;
}) {
  const stove = useMemo(() => prepareCampCookware(root, placement, 'stove', crafted), [root, placement, crafted]);
  const wok = useMemo(() => prepareCampCookware(root, placement, 'wok', crafted), [root, placement, crafted]);
  const stoveBody = useRef<RapierRigidBody>(null), wokBody = useRef<RapierRigidBody>(null);
  useLayoutEffect(() => {
    // Keep the QA entry's aggregate C14 bounds, with the live wok included.
    const read = (): CookwareRecord | null => {
      if (!stoveBody.current?.numColliders() || !wokBody.current?.numColliders()) return null;
      const box = new Box3(), rotation = new Quaternion(), offset = new Vector3(), point = new Vector3();
      for (const [body, part] of [[stoveBody.current, stove], [wokBody.current, wok]] as const) {
        const r = body.rotation(), t = body.translation();
        rotation.set(r.x, r.y, r.z, r.w);
        offset.set(t.x, t.y, t.z);
        for (const index of part.indices) box.expandByPoint(point.fromArray(part.vertices, index * 3).applyQuaternion(rotation).add(offset));
      }
      return { id: 'C14', aabb: { min: box.min.toArray(), max: box.max.toArray() } };
    };
    readInstalledCookware = read;
    return () => { if (readInstalledCookware === read) readInstalledCookware = null; };
  }, [stove, wok]);
  return <group name="camp-C14-contact">
    <group position={stove.position} quaternion={stove.orientation} scale={stove.scale}>
      <primitive object={stove.visual} dispose={null} />
    </group>
    <CookwareBody part="stove" body={stoveBody} shape={stove} position={stove.position} rotation={stove.orientation} />
    <MovingWok shape={wok} body={wokBody} elapsed={elapsed} />
  </group>;
}

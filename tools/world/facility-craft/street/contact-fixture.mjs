import R from '@dimforge/rapier3d-compat';
import * as React from 'react';
import * as ReactRapier from '@react-three/rapier';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Texture, Vector3 } from 'three';
import { loadWorldModule } from './runtime.mjs';

await R.init();

// Mount the shipping component through a Node host. The component supplies its
// BatchedMesh, placements, collider vertices, and Rapier mass properties.
export function mountStreetContacts(set, customItems, search = '') {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const atlas = new Texture(), effects = [];
  let beforePhysics, onFrame;
  const [adapter, inventory] = loadWorldModule(['WorldStreetKnock.tsx', 'world-collision-inventory.ts'], search, false, {
    react: { ...React, useMemo: create => create(), useRef: current => ({ current }), useEffect: effect => effects.push(effect), useLayoutEffect: effect => effects.push(effect) },
    '@react-three/fiber': { useFrame: callback => { onFrame = callback; } },
    '@react-three/rapier': { ...ReactRapier, useRapier: () => ({ world, rapier: R }), useBeforePhysicsStep: callback => { beforePhysics = callback; } },
  });
  const root = adapter.default({ set, customItems, customAtlas: atlas });
  const [batch, knockables] = root.props.children;
  const mesh = batch.props.object;
  const scene = new Scene(), group = new Group(), colliderNodes = [];
  group.name = root.props.name; scene.add(group); group.add(mesh);
  const bodies = Array.from(knockables, element => {
    const { props } = element.type(element.props);
    const parent = new Group(); parent.name = props.name; group.add(parent);
    const [x, y, z, w] = props.quaternion;
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...props.position).setRotation({ x, y, z, w })
      .setCanSleep(props.canSleep).setCcdEnabled(props.ccd).setLinearDamping(props.linearDamping).setAngularDamping(props.angularDamping));
    props.ref.current = body;
    body.userData = props.userData;
    const colliders = Array.from(props.children, element => {
      const { args, name, massProperties, density, friction, restitution } = element.props;
      const node = new Group(); node.name = name ?? ''; parent.add(node); colliderNodes.push(node);
      const shape = R.ColliderDesc.convexHull(args[0]).setFriction(friction).setRestitution(restitution);
      if (massProperties) shape.setMassProperties(massProperties.mass, massProperties.centerOfMass,
        massProperties.principalAngularInertia, massProperties.angularInertiaLocalFrame);
      else shape.setDensity(density);
      return { name, collider: world.createCollider(shape, body) };
    });
    return { id: props.userData.knockable, body, colliders };
  });
  const cleanups = effects.map(run => run());
  beforePhysics(); world.step();
  const camera = new PerspectiveCamera();
  return { mesh, bodies, world, state: adapter.knockQa, frame: (at, delta = 1 / 60) => { camera.position.set(...at); onFrame({ camera }, delta); },
    inventory: () => inventory.collisionInventory(scene, [mesh], colliderNodes, [group.name]),
    dispose: () => { cleanups.forEach(release => release?.()); atlas.dispose(); world.free(); } };
}

export function compareContact(rendered, colliders, origin, direction, distance) {
  const start = new Vector3(...origin).applyMatrix4(rendered.matrixWorld);
  const dir = new Vector3(...direction).transformDirection(rendered.matrixWorld);
  const ray = new R.Ray(start, dir);
  const hits = colliders.map(({ collider }) => collider.castRay(ray, distance, true)).filter(toi => toi >= 0);
  return { visual: new Raycaster(start, dir, 0, distance).intersectObject(rendered)[0]?.distance ?? null,
    physical: hits.length ? Math.min(...hits) : null };
}

export function meshFromBatch(batch, instance, geometryId = batch.getGeometryIdAt(instance)) {
  const geometry = batch.geometry.clone();
  const { start, count } = batch.getGeometryRangeAt(geometryId);
  // StreetBatch assigns a world-space culling sphere to the merged geometry.
  geometry.boundingSphere = null;
  geometry.boundingBox = null;
  geometry.setDrawRange(start, count);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.matrixAutoUpdate = false;
  batch.getMatrixAt(instance, mesh.matrix);
  mesh.updateMatrixWorld(true);
  return mesh;
}

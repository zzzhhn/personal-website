import R from '@dimforge/rapier3d-compat';
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { loadWorldModule } from '../../street/runtime.mjs';

await R.init();

// Substitute the render host, and feed the complete component the same Three
// instance buffers and Rapier bodies its registered props describe.
export function mountKnockable(kind, items) {
  const effects = [];
  let onFrame;
  const [park, store] = loadWorldModule(['WorldParkWalk.tsx', 'store.ts'], '?qa=1', false, {
    react: { useRef: current => ({ current }), useMemo: create => create(), useEffect: effect => effects.push(effect) },
    '@react-three/fiber': { useFrame: callback => { onFrame = callback; } },
  });
  const asset = kind === 'rail' ? park.RAIL : park.LAMP;
  const root = park.Knockables({ name: kind, items, source: asset.geometry, farSource: asset.far, spec: asset.spec, contact: asset.contact });
  const [rigidBodies, nearElement, farElement] = root.props.children;
  const registration = rigidBodies.props;
  const parent = new Group();
  const attachMesh = ({ props }) => {
    const mesh = new InstancedMesh(...props.args);
    mesh.name = props.name;
    mesh.visible = props.visible ?? true;
    mesh.userData = props.userData;
    props.ref.current = mesh;
    parent.add(mesh);
    return mesh;
  };
  const proxy = attachMesh(registration.children), near = attachMesh(nearElement), far = attachMesh(farElement);
  const bodies = items.map(() => null);
  registration.ref.current = bodies;
  const cleanups = effects.map(run => run());
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const scale = new Vector3(1, 1, 1), up = new Vector3(0, 1, 0);

  function makeBody(i) {
    const instance = registration.instances[i];
    const q = new Quaternion().setFromAxisAngle(up, instance.rotation[1]);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...instance.position).setRotation(q)
      .setCanSleep(registration.canSleep).setLinearDamping(registration.linearDamping).setAngularDamping(registration.angularDamping));
    for (const member of registration.colliderNodes) {
      const { args, mass, friction, restitution } = member.props;
      world.createCollider(R.ColliderDesc.convexHull(args[0]).setMass(mass).setFriction(friction).setRestitution(restitution), body);
    }
    return body;
  }

  function publish(i) {
    const body = bodies[i], p = body.translation(), q = body.rotation();
    proxy.updateWorldMatrix(true, false);
    proxy.getWorldScale(scale);
    const pose = new Matrix4().compose(new Vector3(p.x, p.y, p.z), new Quaternion(q.x, q.y, q.z, q.w), scale);
    proxy.setMatrixAt(i, pose.premultiply(proxy.matrixWorld.clone().invert()));
  }

  return {
    asset, registration, parent, bodies, proxy, near, far, world, makeBody, publish, Rapier: R,
    frame: (delta, camera = [0, 0, 0]) => onFrame({ camera: { position: new Vector3(...camera) } }, delta),
    state: () => park.parkKnockables(),
    pause: paused => store.useWorldStore.setState({ paused }),
    dispose: () => { cleanups.forEach(release => release?.()); world.free(); },
  };
}

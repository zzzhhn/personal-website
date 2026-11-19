import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { compileWorldComponent } from '../../../../tools/world/alpha-mine-tests/component-host.mjs';
import { readWorldCraftGltf, disposeWorldCraftGltf } from '../world-craft-gltf-test.mjs';
import { collisionInventory } from '../world-collision-inventory.ts';
import { coasterModelContact } from './coaster-model-contact.ts';
import * as track from './coaster-track.ts';
import { COASTER_CAR_PANELS } from './coaster-access.ts';

const folder = 'docs/world/phase-2-playground/coaster-car-astra-pilot-20261104/';
const [near, far] = await Promise.all(['coaster-car.glb','coaster-car-distant.glb'].map(name => readWorldCraftGltf([folder + name])));
const load = compileWorldComponent(new URL('./WorldCoasterTrainCraft.tsx', import.meta.url));
await R.init();
test.after(() => { disposeWorldCraftGltf(near.scene); disposeWorldCraftGltf(far.scene); });

function mount(t, contactActive) {
  let frame;
  const effects = [];
  const Train = load({
    three: THREE, 'three/addons/utils/BufferGeometryUtils.js': { mergeGeometries },
    react: { useMemo: create => create(), useRef: current => ({ current }), useEffect: effect => effects.push(effect) },
    '@react-three/rapier': { RigidBody: 'rigid-body', TrimeshCollider: 'trimesh' },
    '@react-three/fiber': { useFrame: update => { frame = update; } },
    '@react-three/drei': { useGLTF: url => url.includes('-distant') ? far : near },
    '../WorldDjcFurnitureEnvironment': { useDjcFurnitureEnvironment: () => null }, '../WorldNight': { night: { value: 0 } },
    './coaster-model-contact': { coasterModelContact }, './coaster-track': track,
  }).default;
  const cars = { current: Array.from({ length: 3 }, (_, i) => {
    const group = new THREE.Group();
    const pose = track.coasterFrame(-i * 3.55 / track.COASTER_LENGTH);
    group.position.copy(pose.point); group.quaternion.copy(pose.rotation);
    return group;
  }) };
  const entry = Train({ cars, contactActive }), parent = new THREE.Group(), scene = new THREE.Scene();
  const scope = new THREE.Group(); scope.name = entry.props.name;
  scene.add(parent); parent.add(scope, ...cars.current); entry.props.ref.current = scope;
  const [levels, shadow, contacts] = entry.props.children;
  levels.forEach(level => scope.add(level.props.object)); scope.add(shadow.props.object);
  const camera = new THREE.PerspectiveCamera();
  const setFrame = distance => {
    camera.position.copy(cars.current[0].position).addScaledVector(new THREE.Vector3(1,0,0),distance);
    frame({ camera }); scene.updateMatrixWorld(true);
  };
  const cleanups = effects.map(effect => effect()); t.after(() => cleanups.forEach(cleanup => cleanup?.()));
  return { scene, scope, cars, contacts, setFrame, levels: levels.map(row => row.props.object) };
}

test('all three parked cars register the real GLB at the rendered transforms, with the right opening clear', t => {
  const { scene, scope, cars, contacts, setFrame, levels } = mount(t,true);
  const world = new R.World({x:0,y:0,z:0}), old = new R.World({x:0,y:0,z:0});
  t.after(() => { world.free(); old.free(); });
  const regs = contacts.map(element => {
    const { position, quaternion, children } = element.props;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(...position).setRotation(quaternion));
    const [vertices, indices] = children.props.args;
    assert.equal(indices.length / 3,21772);
    const node = new THREE.Object3D(); node.name = children.props.name; scope.add(node);
    return { node, collider: world.createCollider(R.ColliderDesc.trimesh(vertices,indices),body) };
  });
  for (const p of COASTER_CAR_PANELS) old.createCollider(R.ColliderDesc.cuboid(...p.size.map(n => n/2)).setTranslation(...p.at));
  world.step(); old.step();
  const ray = (world, from, direction, collider) => world.castRay(new R.Ray(from,direction),4,true,undefined,undefined,undefined,undefined,
    collider ? c => c.handle === collider.handle : undefined);
  for (const [lod, distance] of [0,65].entries()) {
    setFrame(distance);
    const inventory = collisionInventory(scene, levels[lod].children, regs.map(r => r.node), [scope.name]);
    assert.deepEqual(inventory.errors,[]); assert.equal(inventory.registrations[scope.name],3);
    assert.equal(inventory.mounted.declared,17); assert.ok(levels[lod].visible);
    for (let i=0; i<cars.current.length; i++) {
      const car = cars.current[i], render = levels[lod].children;
      const toward = new THREE.Vector3(0,0,-1).applyQuaternion(car.quaternion);
      const rightGap = car.localToWorld(new THREE.Vector3(.82,.75,2));
      const across = ray(world,rightGap,toward,regs[i].collider);
      assert.ok(!across || across.timeOfImpact > 2.6, 'no shell fills the rider-right aperture');
      assert.ok(new THREE.Raycaster(rightGap,toward,0,2).intersectObjects(render).every(hit => hit.instanceId !== i));
      const start = car.localToWorld(new THREE.Vector3(1.25,1.22,2));
      const real = ray(world,start,toward,regs[i].collider);
      const surface = new THREE.Raycaster(start,toward,0,4).intersectObjects(render).find(hit => hit.instanceId === i);
      assert.ok(real && surface);
      assert.ok(Math.abs(real.timeOfImpact - surface.distance) < .002);
      assert.equal(ray(old,new THREE.Vector3(1.25,1.22,2),new THREE.Vector3(0,0,-1)),null,'the former boxes miss the actual restraint rail');
    }
  }
});

test('the moving train retains all live instance matrices while parked colliders are absent', t => {
  const { scene, cars, contacts, setFrame, levels } = mount(t,false);
  assert.equal(contacts,null);
  for (const [i, car] of cars.current.entries()) {
    const pose = track.coasterFrame(.4 - i * 3.55 / track.COASTER_LENGTH);
    car.position.copy(pose.point); car.quaternion.copy(pose.rotation);
  }
  setFrame(0);
  const audit = collisionInventory(scene,levels[0].children,[],[]);
  assert.deepEqual(audit.errors,[]);
  assert.equal(audit.mounted.declared,17);
});

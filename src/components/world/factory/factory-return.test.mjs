import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { FACTORY_MODULES } from './factory-game.ts';
import { FACTORY_PALETTE, buildFactoryGeometry } from './factory-geometry.ts';
import { buildFactoryCompanion } from './factory-companion.ts';
import { buildFactoryCarrier } from './factory-carrier.ts';
import { FACTORY_ASSEMBLY_CONTACT, FACTORY_ASSEMBLY_PICK, FACTORY_RAW_HALF_HEIGHT } from './factory-operation.ts';
import { FACTORY_WALK_EDGES, FACTORY_WALK_NODES } from './factory-navigation.ts';
import { factoryBatchPosition } from './factory-routing.ts';
import {
  FACTORY_RETURN_CARRY_Y, FACTORY_RETURN_GRIP, FACTORY_RETURN_HOME, FACTORY_RETURN_RAIL,
  buildFactoryReturnGeometry, buildFactoryReturnHoist, createFactoryReturnPlan,
  createFactoryReturnPose, factoryReturnSource, sampleFactoryReturn,
} from './factory-return.ts';

const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const ray = (mesh, p, d, far = 2) => new Raycaster(new Vector3(...p), new Vector3(...d), 0, far).intersectObject(mesh, true)[0];
const box = s => new Box3().setFromCenterAndSize(new Vector3(...s.at), new Vector3(...s.size));
const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / length)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t);
};

test('fixture and unassembled sources stay exact until clamped, return to their own blank pocket, and park before completion', () => {
  for (const module of FACTORY_MODULES) for (const seated of [true, false]) {
    const source = factoryReturnSource(module, seated), plan = createFactoryReturnPlan(module, source), out = createFactoryReturnPose();
    assert.deepEqual(source, seated ? FACTORY_ASSEMBLY_CONTACT : FACTORY_ASSEMBLY_PICK[module]);
    assert.ok(plan.duration > 20, 'the old 3.5 second flight is not a mechanically paced return');
    let previousPart = [...source], previousTool = [...FACTORY_RETURN_HOME], sawBlank = false;
    for (let i = 0; i <= 2400; i++) {
      sampleFactoryReturn(plan, i / 2400, out);
      assert.ok(Math.hypot(...out.part.map((v, k) => v - previousPart[k])) < .12);
      assert.ok(Math.hypot(...out.tool.map((v, k) => v - previousTool[k])) < .12);
      if (['fetch', 'pickup', 'clamp'].includes(out.phase)) assert.deepEqual(out.part, source);
      if (out.attached) assert.deepEqual(out.part, out.tool);
      if (out.phase === 'traverse') near(out.part[1], FACTORY_RETURN_CARRY_Y);
      if (out.blankVisible) {
        sawBlank = true; assert.equal(out.attached, false);
        assert.deepEqual(out.part, factoryBatchPosition(module));
      } else assert.equal(sawBlank, false, 'material conversion never reverses during forward playback');
      previousPart = [...out.part]; previousTool = [...out.tool];
    }
    assert.equal(out.phase, 'done'); assert.equal(out.blankVisible, true);
    assert.deepEqual(out.tool, FACTORY_RETURN_HOME); assert.deepEqual(out.blankPosition, factoryBatchPosition(module));
    for (const leg of plan.legs) for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1], b = leg.path[i];
      assert.ok(a.filter((v, k) => Math.abs(v - b[k]) > 1e-9).length <= 1, 'no diagonal cut through machines');
    }
  }
  assert.throws(() => createFactoryReturnPlan('frame', [-40, 1.14, -4]), RangeError);
});

test('final assembly obstructions clear sequentially to real carriers; shell stays there and frame restores after wheel return', () => {
  for (const module of FACTORY_MODULES) {
    const plan = createFactoryReturnPlan(module, [...FACTORY_ASSEMBLY_CONTACT], FACTORY_MODULES);
    assert.deepEqual(plan.temporaryModules, module === 'wheels' ? ['shell', 'frame'] : module === 'frame' ? ['shell'] : []);
    const pose = createFactoryReturnPose(), repeated = createFactoryReturnPose();
    let previousFrame = [...FACTORY_ASSEMBLY_CONTACT], previousShell = [...FACTORY_ASSEMBLY_CONTACT];
    for (let i = 0; i <= 4096; i++) {
      const progress = i / 4096;
      sampleFactoryReturn(plan, progress, pose); sampleFactoryReturn(plan, progress, repeated);
      assert.deepEqual(pose, repeated, 'sampling an interruption snapshot is deterministic');
      assert.ok(Math.hypot(...pose.temporary.frame.map((v, k) => v - previousFrame[k])) < .12);
      assert.ok(Math.hypot(...pose.temporary.shell.map((v, k) => v - previousShell[k])) < .12);
      if (pose.attached) {
        if (plan.temporaryModules.includes('shell')) assert.deepEqual(pose.temporary.shell, FACTORY_ASSEMBLY_PICK.shell);
        if (plan.temporaryModules.includes('frame')) assert.deepEqual(pose.temporary.frame, FACTORY_ASSEMBLY_PICK.frame);
      }
      if (pose.assemblyAttached) {
        assert.ok(pose.assemblyModule); assert.deepEqual(pose.temporary[pose.assemblyModule], pose.assemblyTool);
      }
      if (pose.phase.startsWith('restore-')) {
        assert.equal(pose.blankVisible, true); assert.deepEqual(pose.tool, FACTORY_RETURN_HOME);
      }
      previousFrame = [...pose.temporary.frame]; previousShell = [...pose.temporary.shell];
    }
    assert.deepEqual(pose.temporary.frame, FACTORY_ASSEMBLY_CONTACT);
    assert.deepEqual(pose.temporary.shell, module === 'shell' ? FACTORY_ASSEMBLY_CONTACT : FACTORY_ASSEMBLY_PICK.shell);
    assert.equal(pose.assemblyAttached, false); assert.deepEqual(pose.assemblyTool, [28, 3.4, -4]);
  }
  // Actual seated IDs can describe an intermediate rework. Do not clear a
  // produced shell that is already waiting on its carrier.
  const partial = createFactoryReturnPlan('wheels', [...FACTORY_ASSEMBLY_CONTACT], ['frame', 'wheels']);
  assert.deepEqual(partial.temporaryModules, ['frame']);
  const unassembled = createFactoryReturnPlan('shell', [...FACTORY_ASSEMBLY_PICK.shell], ['frame', 'wheels']);
  assert.deepEqual(unassembled.temporaryModules, []);
});

test('the return runways, bogie wheels and trolley wheels have actual contact, and the roof clears their full travel', () => {
  const structure = buildFactoryReturnGeometry(FACTORY_PALETTE), tool = buildFactoryReturnHoist(FACTORY_PALETTE);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(structure.geometry, material);
  try {
    assert.deepEqual(structure.geometry.groups, []); assert.ok(structure.triangles < 6500);
    for (const attribute of Object.values(structure.geometry.attributes)) for (const v of attribute.array) assert.ok(Number.isFinite(v));
    for (const module of FACTORY_MODULES) for (const seated of [true, false]) {
      const plan = createFactoryReturnPlan(module, factoryReturnSource(module, seated)), pose = createFactoryReturnPose();
      for (let i = 0; i <= 100; i++) {
        sampleFactoryReturn(plan, i / 100, pose); tool.update(pose, module); tool.group.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(tool.group);
        assert.ok(bounds.max.y < 9, 'entire moving tool is below the lowest sawtooth roof');
        for (const x of FACTORY_RETURN_RAIL.x) for (const dz of [-.5, .5]) {
          const z = pose.tool[2] + dz;
          const tangent = ray(mesh, [x, 7.52, z], [0, -1, 0], .05);
          assert.ok(tangent, `runway below bridge bogie at ${x},${z}`); near(tangent.point.y, 7.5);
        }
        // The two .1 m trolley wheels are centred at 8.2, on bridge-flange top 8.1.
        const bridgeMesh = tool.bridge.children[0];
        for (const x of [-.35, .35]) for (const z of [-.4, .4]) {
          const tangent = ray(bridgeMesh, [pose.tool[0] + x, 8.11, pose.tool[2] + z], [0, -1, 0], .03);
          assert.ok(tangent); near(tangent.point.y, 8.1);
        }
      }
    }
  } finally { structure.geometry.dispose(); material.dispose(); tool.dispose(); tool.dispose(); }
});

test('return column footprints leave every surveyed pedestrian edge clear', () => {
  const structure = buildFactoryReturnGeometry(FACTORY_PALETTE);
  try {
    for (const solid of structure.solids) for (const [a, b] of FACTORY_WALK_EDGES) {
      const clearance = segmentDistance(solid.at, FACTORY_WALK_NODES[a], FACTORY_WALK_NODES[b]);
      assert.ok(clearance > Math.hypot(solid.size[0], solid.size[2]) / 2 + .34,
        `return column blocks ${a} to ${b} at ${solid.at}`);
    }
  } finally { structure.geometry.dispose(); }
});

test('the selected module is gripped on real surfaces in both configurations, clear of its retained neighbours', () => {
  for (const module of FACTORY_MODULES) {
    const carrier = buildFactoryCarrier(module, FACTORY_PALETTE), spec = FACTORY_RETURN_GRIP[module];
    try {
      for (const side of [-1, 1]) {
        const jaw = box({ at: [side * spec.jawX, spec.jawY, 0], size: [.03, spec.jawHeight, spec.jawDepth] });
        for (const locator of carrier.locatorBounds)
          assert.equal(jaw.intersectsBox(new Box3(new Vector3(...locator.min), new Vector3(...locator.max))), false,
            `${module} jaw must clear its source carrier locators`);
      }
    } finally { carrier.geometry.dispose(); }
    for (const configuration of ['nimble', 'steady']) {
      const model = buildFactoryCompanion({ configuration }), selected = module === 'frame' ? model.group : module === 'wheels' ? model.wheelModule : model.shell;
      model.group.remove(model.wheelModule, model.shell);
      const z = module === 'frame' ? .23 : module === 'wheels' ? .275 : 0;
      const y = module === 'wheels' ? .22 : spec.jawY;
      try {
        selected.updateMatrixWorld(true);
        for (const side of [-1, 1]) {
          const contact = ray(selected, [side, y, z], [-side, 0, 0], 1);
          assert.ok(contact, `${module} exposes a real jaw contact`);
          near(Math.abs(contact.point.x), spec.jawX - .015, 1e-6);
        }
        const jawMinY = spec.jawY - spec.jawHeight / 2;
        if (module === 'frame') assert.ok(jawMinY > .4, 'frame gripper clears retained tyres and suspension');
        if (module === 'wheels') assert.ok(spec.jawX - .015 > .215, 'wheel gripper clears retained frame');
        if (module === 'shell') assert.ok(spec.jawX - .015 > .215, 'shell gripper clears retained frame');
      } finally { model.dispose(); }
    }
  }
});

test('raised module travel clears the actual fixed factory solids and stays within material-only pedestrian space', () => {
  const factory = buildFactoryGeometry(), structure = buildFactoryReturnGeometry(FACTORY_PALETTE);
  const obstacles = [...factory.solids, ...structure.solids].filter(s => !s.rotation).map(box);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(factory.geometry, material), tool = buildFactoryReturnHoist(FACTORY_PALETTE);
  try {
    for (const module of FACTORY_MODULES) for (const seated of [true, false]) {
      const plan = createFactoryReturnPlan(module, factoryReturnSource(module, seated)), pose = createFactoryReturnPose();
      const model = buildFactoryCompanion();
      model.group.remove(model.wheelModule, model.shell);
      const selected = module === 'frame' ? model.group : module === 'wheels' ? model.wheelModule : model.shell;
      const localBounds = new Box3().setFromObject(selected);
      try {
        for (let i = 0; i <= 600; i++) {
          sampleFactoryReturn(plan, i / 600, pose);
          tool.update(pose, module); tool.group.updateMatrixWorld(true);
          tool.group.traverse(object => {
            if (!object.isMesh) return;
            const bounds = new Box3().setFromObject(object);
            assert.ok(obstacles.every(obstacle => !obstacle.intersectsBox(bounds)), `${module}: moving ${object.parent.name} hits fixed solid at ${pose.phase}`);
          });
          if (!pose.attached || pose.phase === 'reform') continue;
          for (const [a, b] of FACTORY_WALK_EDGES)
            assert.ok(segmentDistance(pose.part, FACTORY_WALK_NODES[a], FACTORY_WALK_NODES[b]) > .9,
              'suspended load never crosses a surveyed pedestrian route');
          if (pose.phase !== 'traverse') continue;
          const hull = localBounds.clone().translate(new Vector3(...pose.part));
          assert.ok(obstacles.every(obstacle => !obstacle.intersectsBox(hull)), `${module}: raised load hits fixed solid`);
          // Short upward rays also catch any uncollided roof over the actual load.
          const roof = ray(mesh, [pose.part[0], pose.part[1] + .85, pose.part[2]], [0, 1, 0], .4);
          assert.equal(roof, undefined, `${module}: raised load is too close to fixed overhead geometry`);
        }
        // After reform, the raw centre maps to a physically supported underside.
        const target = factoryBatchPosition(module), bottom = target[1] - FACTORY_RAW_HALF_HEIGHT[module];
        const deck = ray(mesh, [target[0], bottom + .02, target[2]], [0, -1, 0], .04);
        assert.ok(deck); near(deck.point.y, bottom);
      } finally { model.dispose(); }
    }
  } finally {
    factory.geometry.dispose(); factory.roofs.dispose(); factory.surface.dispose(); structure.geometry.dispose(); material.dispose(); tool.dispose();
  }
});

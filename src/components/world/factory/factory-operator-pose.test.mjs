import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGuide } from '../../../../tools/world/guide/boot-analysis.mjs';
import { GuideCampLayer } from '../WorldGuideCamp.ts';
import { FACTORY_STATIONS, factoryWorld } from './factory-layout.ts';
import { factoryConsoleHandTarget } from './factory-operator-pose.ts';

const assetPromise = loadGuide(new URL('../../../../tools/world/guide/out/G24_uncompressed.glb', import.meta.url));

test('all eleven physical consoles reach exact top-deck contact across stand tolerances while keeping solved feet anchored', async () => {
  const asset = await assetPromise;
  const offsets = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]];
  for (const station of FACTORY_STATIONS) {
    const stand = factoryWorld(station.at);
    const facing = station.yaw - Math.PI / 2;
    if (station.id === 'release') {
      assert.equal(factoryConsoleHandTarget('release', stand, facing, 0), null, 'printer stand leaves output throat clear');
      continue;
    }
    for (const [ox, oz] of offsets) {
      const pos = [stand[0] + ox, stand[1], stand[2] + oz];
      const target = factoryConsoleHandTarget(station.id, pos, facing, 0);
      assert.ok(target, `${station.id} provides settled grip target`);
      const scene = clone(asset.gltf.scene);
      scene.position.set(...pos);
      scene.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), facing);
      scene.updateWorldMatrix(true, true);
      const savedRotations = [];
      scene.traverse(n => { if (n.isBone) savedRotations.push([n, n.quaternion.toArray(), n.position.toArray()]); });
      const footL = scene.getObjectByName('footL').getWorldPosition(new Vector3());
      const footR = scene.getObjectByName('footR').getWorldPosition(new Vector3());
      const layer = new GuideCampLayer(scene);
      let palm = null;
      for (let i = 0; i < 20; i++) palm = layer.apply(target, 'grip', 1 / 60);
      assert.ok(palm, `${station.id} palm solved`);
      const err = Math.hypot(palm[0] - target[0], palm[1] - target[1], palm[2] - target[2]);
      assert.ok(err < 1e-4, `${station.id} palm contact error ${err}m`);
      assert.ok(scene.getObjectByName('footL').getWorldPosition(new Vector3()).distanceTo(footL) < 1e-5);
      assert.ok(scene.getObjectByName('footR').getWorldPosition(new Vector3()).distanceTo(footR) < 1e-5);
      layer.reset();
      for (const [bone, q, p] of savedRotations) {
        assert.deepEqual(bone.quaternion.toArray(), q, `${station.id} ${bone.name} rotation restores byte-identically`);
        assert.deepEqual(bone.position.toArray(), p, `${station.id} ${bone.name} position restores byte-identically`);
      }
    }
  }
});

test('approaching, unaligned or moving guide waits until settled at the console before reaching', () => {
  const raw = FACTORY_STATIONS.find(s => s.id === 'raw');
  const stand = factoryWorld(raw.at), facing = raw.yaw - Math.PI / 2;
  assert.equal(factoryConsoleHandTarget(null, stand, facing, 0), null);
  assert.equal(factoryConsoleHandTarget('raw', [stand[0] + 0.35, stand[1], stand[2]], facing, 0), null);
  assert.equal(factoryConsoleHandTarget('raw', stand, facing + 0.5, 0), null);
  assert.equal(factoryConsoleHandTarget('raw', stand, facing, 0.4), null);
  assert.ok(factoryConsoleHandTarget('raw', stand, facing, 0.05));
});

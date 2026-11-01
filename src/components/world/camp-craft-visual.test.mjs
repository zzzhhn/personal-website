import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Box3, BoxGeometry, DoubleSide, FrontSide, Group, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three';
import { CAMP_CRAFT_CONTACT, campCraftLegacy, createCampCraftVisual } from './camp-craft-visual.ts';
import { benches } from './WorldCampContentLayout.ts';
import { readWorldCraftGltf, disposeWorldCraftGltf } from './world-craft-gltf-test.mjs';

test('craft QA opt-out needs explicit qa=1', () => {
  assert.equal(campCraftLegacy('?campCraft=legacy'), false);
  assert.equal(campCraftLegacy('?qa=1&campCraft=legacy'), true);
});
test('instances own shared material clones while borrowing geometry, maps and the renderer environment', () => {
  const source = new Group(), family = new Group(), geometry = new BoxGeometry(), map = new Texture(), environment = new Texture();
  const material = new MeshStandardMaterial({ color: '#c9a779', roughness: .86, map, side: DoubleSide });
  family.name = 'C06'; family.position.set(.1,.2,.3); source.add(family);
  const mesh = new Mesh(geometry, material); mesh.position.set(.2,.3,.4); family.add(mesh, new Mesh(geometry, material));
  const otherFamily = new Group(); otherFamily.name = 'C07'; otherFamily.add(new Mesh(geometry, material)); source.add(otherFamily);
  let sourceDisposals = 0, ownedDisposals = 0;
  for (const item of [geometry, material, map, environment]) item.addEventListener('dispose', () => sourceDisposals++);
  const matrices = [new Matrix4().makeTranslation(3,4,5), new Matrix4().makeRotationY(.5)];
  const visual = createCampCraftVisual(source, 'C06', matrices, environment), other = createCampCraftVisual(source, 'C07', matrices, environment), actual = new Matrix4();
  assert.equal(visual.instances.length, 2); assert.equal(visual.instances[0].geometry, geometry);
  assert.equal(visual.materials.length, 1); const copy = visual.materials[0];
  assert.notEqual(copy, material); assert.equal(visual.instances[0].material, visual.instances[1].material);
  assert.equal(copy.side, FrontSide); assert.equal(material.side, DoubleSide);
  assert.equal(copy.map, map); assert.equal(other.materials[0].map, map); assert.notEqual(copy, other.materials[0]);
  assert.deepEqual(copy.color, material.color); assert.equal(copy.roughness, material.roughness);
  assert.equal(copy.envMap, environment); assert.equal(copy.envMapIntensity, 1.5); assert.equal(material.envMap, null);
  visual.setNight(1); assert.equal(copy.envMapIntensity, .5); visual.setNight(0); assert.equal(copy.envMapIntensity, 1.5);
  matrices.forEach((matrix, i) => {
    visual.instances[0].getMatrixAt(i, actual);
    const expected = new Matrix4().multiplyMatrices(matrix, mesh.matrixWorld);
    actual.elements.forEach((value, k) => assert.ok(Math.abs(value-expected.elements[k])<1e-6));
  });
  copy.addEventListener('dispose', () => ownedDisposals++); visual.instances[0].addEventListener('dispose', () => ownedDisposals++);
  visual.dispose(); visual.dispose(); assert.equal(ownedDisposals, 2); other.dispose(); assert.equal(sourceDisposals, 0);
  geometry.dispose(); material.dispose(); map.dispose(); environment.dispose();
});
test('fixed original GLBs used for physical registration and seat anchors are byte-identical', () => {
  const expected = { C05:'54790864187123a55c4fd00590186a1e958990ca735a9861c00304332a316692',C06:'401862b7b8ea1cea4cfafbccb26f38760025f34f006ba47463f6072ae5c8a556',C07:'ea34c4389d8504410746a43ba5b228aba1d46cf525eca3659abcbf34cebc6873' };
  for (const [id,hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL(`../../../public/assets/world/camp/${id}.glb`,import.meta.url))).digest('hex'),hash);
  const camp = readFileSync(new URL('./WorldCamp.tsx', import.meta.url),'utf8');
  assert.match(camp, /campShapes\(id, gltf\)/); assert.match(camp, /<CampColliders id=\{id\} label=\{label\} shapes=\{shapes\} matrices=\{matrices\}/);
  assert.match(camp, /<CampFire position=\{\[firePosition\[0\], CAMP_TOP \+ 0\.06, firePosition\[2\]\]\}/);
});
test('actual pack has three fixed roots, valid geometry and eight true 600mm bench contacts', async t => {
  const gltf = await readWorldCraftGltf(['public/assets/world/camp/craft/camp-props-v1.glb']);
  if (!gltf) { t.skip('craft export pending exclusive Blender window'); return; }
  try {
    gltf.scene.updateMatrixWorld(true);
    for (const family of ['C05','C06','C07']) {
      const asset = gltf.scene.getObjectByName(family); assert.ok(asset, family);
      const sourceSides = new Map();
      asset.traverse(object => {
        if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) sourceSides.set(material, material.side);
      });
      const visual = createCampCraftVisual(gltf.scene, family, [new Matrix4()]);
      for (const material of visual.materials) assert.equal(material.side, FrontSide, 'closed craft uses owned front-face material copies');
      for (const [material, side] of sourceSides) assert.equal(material.side, side, 'loader source side is unchanged');
      assert.ok(visual.instances.length <= 6, 'per material batches stay bounded');
      for (const instance of visual.instances) {
        assert.ok(instance.geometry.attributes.uv, 'fabrication UV retained');
        for (const attribute of Object.values(instance.geometry.attributes)) for (const value of attribute.array) assert.ok(Number.isFinite(value));
      }
      const bounds = new Box3().setFromObject(asset);
      assert.ok(bounds.min.y>=-.002, 'root meets existing ground plane');
      if (family === 'C06') {
        assert.ok(Math.abs(bounds.max.y-CAMP_CRAFT_CONTACT.C06.top)<1e-5);
        assert.ok(Math.abs(bounds.max.z-2.4)<.001 && Math.abs(bounds.min.z+2.4)<.001);
        assert.ok(bounds.max.x <= .381 && bounds.min.x >= -.381);
        const rays = new Raycaster(), existing = benches();
        const seated = createCampCraftVisual(gltf.scene, 'C06', existing.map(b => new Matrix4().makeRotationY(b.yaw).setPosition(...b.centre)));
        seated.root.updateMatrixWorld(true);
        try {
          // Actual four original world matrices and the eight content-seat points.
          for (const b of existing) for (const s of CAMP_CRAFT_CONTACT.C06.seatOffsets) for (const x of [-.1,0,.1]) for (const z of [-.1,0,.1]) {
            const position = new Vector3(x,2,s+z).applyMatrix4(new Matrix4().makeRotationY(b.yaw).setPosition(...b.centre));
            rays.set(position,new Vector3(0,-1,0));
            const hit = rays.intersectObject(seated.root,true)[0]; assert.ok(hit);
            assert.ok(Math.abs(hit.point.y-(b.centre[1]+CAMP_CRAFT_CONTACT.C06.top))<1e-5, 'new seat touches the original world hip plane across a 200mm contact patch');
          }
        } finally { seated.dispose(); }
      }
      if (family === 'C05') { assert.ok(bounds.max.x<=1.601 && bounds.max.z<=1.601); assert.ok(bounds.max.y<.58); }
      if (family === 'C07') assert.ok(Math.abs(bounds.max.y-CAMP_CRAFT_CONTACT.C07.top)<1e-5);
      visual.dispose();
    }
  } finally { disposeWorldCraftGltf(gltf.scene); }
});

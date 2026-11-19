import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import R from '@dimforge/rapier3d-compat';
import {loadShippedDraco} from '../alpha-mine-tests/shipped-draco.mjs';
import {disposeWorldCraftGltf} from '../../../src/components/world/world-craft-gltf-test.mjs';
import {constructionSignGeometry} from '../../../src/components/world/WorldStreetConstructionSigns.tsx';

import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { FOUNDATIONS_V4 } from '../../../src/components/world/layout-v4-flag.ts';
import { foundationSlab } from '../../../src/components/world/WorldStreetAssets.ts';
import {
  foundationBurial,
  exposedFoundation,
  foundationRanges,
} from '../../../src/components/world/street-foundation-surface.ts';
import { decodeTerrainArtifact } from '../../../src/components/world/terrain-artifact.ts';

test('all three installed F04 signs support their printed face and leave the space below it clear',async t=>{
  await R.init();
  const {scene}=await loadShippedDraco(new URL('../../../public/assets/world/park/signs.glb',import.meta.url));
  const sign=constructionSignGeometry(scene.getObjectByName('F04'));
  const material=new MeshBasicMaterial({side:DoubleSide}),world=new R.World({x:0,y:0,z:0});
  t.after(()=>{world.free();material.dispose();sign.geometry.dispose();disposeWorldCraftGltf(scene);});
  assert.equal(sign.ranges.reduce((n,p)=>n+p.vertexCount,0),sign.geometry.attributes.position.count);
  assert.equal(sign.placements.length,3);
  let maxError=0, backing=0, clear=0;
  for(const [i,p] of sign.placements.entries()){
    const shape=sign.colliders[i],body=world.createCollider(R.ColliderDesc.trimesh(shape.vertices,shape.indices));
    const draw=new Mesh(sign.geometry,material);draw.matrix.copy(p.matrix);draw.matrixAutoUpdate=false;draw.updateMatrixWorld(true);
    for(const x of [-.35,0,.35])for(const y of [.58,.78,.98]){
      const origin=new Vector3(x,y,.3).applyMatrix4(p.matrix),dir=new Vector3(0,0,-1);
      const hit=new Raycaster(origin,dir,0,.4).intersectObject(draw)[0],physical=body.castRay(new R.Ray(origin,dir),.4,true);
      assert.ok(hit && physical>=0 && physical<=.268);
      maxError=Math.max(maxError,Math.abs(hit.distance-physical));backing++;
    }
    for(const x of [-.14,0,.14]){
      const at=new Vector3(x,.34,.35).applyMatrix4(p.matrix);
      assert.equal(body.castRay(new R.Ray(at,{x:0,y:0,z:-1}),.7,true),-1);clear++;
    }
  }
  assert.ok(maxError<.00002);t.diagnostic(JSON.stringify({backing,clear,maxError}));
});

test('reserved concrete and both visible LODs end inside the soil at the installed hillside', async (t) => {
  await R.init();
  const raw = gunzipSync(
    await readFile(new URL('../../../public/assets/world/terrain/mainland-v4.bin.gz', import.meta.url)),
  );
  const { terrain, grid, cell } = decodeTerrainArtifact(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    'v4',
  );
  const world = new R.World({ x: 0, y: 0, z: 0 });
  t.after(() => world.free());
  const soil = world.createCollider(R.ColliderDesc.trimesh(terrain.positions, terrain.indices));
  const down = (x, y, z) => new R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
  for (const { id, position, size } of FOUNDATIONS_V4) {
    const [x, y, z] = position,
      [w, h, d] = size,
      base = y - h / 2,
      top = y + h / 2;
    const buried = foundationBurial(terrain, grid, cell, position, size);
    for (const level of [0, 1]) {
      const original = foundationSlab(level, w, d),
        cut = exposedFoundation(original, buried);
      const create = (builder) => {
        const slab = foundationRanges(builder).find((range) => range.id === 'slab');
        return world.createCollider(
          R.ColliderDesc.trimesh(
            Float32Array.from(builder.pos),
            Uint32Array.from(builder.idx.slice(slab.firstIndex, slab.firstIndex + slab.indexCount)),
          ).setTranslation(x, base, z),
        );
      };
      const before = create(original),
        after = create(cut);
      const ranges = foundationRanges(cut);
      assert.equal(
        ranges.reduce((n, range) => n + range.indexCount, 0),
        cut.idx.length,
      );
      assert.deepEqual(
        ranges.map((r) => [r.id, r.collision]),
        level === 0
          ? [
              ['slab', 'solid'],
              ['scoring', 'none'],
            ]
          : [['slab', 'solid']],
      );
      let trimmed = 0,
        retained = 0;
      for (let i = 0; i < 21; i++)
        for (let j = 0; j < 21; j++) {
          const px = x + w * ((i + 0.5) / 21 - 0.5),
            pz = z + d * ((j + 0.5) / 21 - 0.5),
            ray = down(px, top + 1, pz);
          const hitBefore = before.castRay(ray, 2, true),
            hitAfter = after.castRay(ray, 2, true);
          const ground = 50 - soil.castRay(down(px, 50, pz), 100, true);
          assert.ok(Math.abs(1 - hitBefore) < 0.001);
          if (ground > top + 0.021) {
            assert.equal(hitAfter, -1);
            trimmed++;
          }
          if (ground < top + 0.019) {
            assert.ok(Math.abs(hitBefore - hitAfter) < 0.0001);
            retained++;
          }
        }
      if (id === 'contact') assert.ok(trimmed > 0);
      else assert.equal(trimmed, 0);
      assert.ok(retained > 420);
      assert.equal(cut.col.length, cut.pos.length);
      assert.equal(cut.nrm.length, cut.pos.length);
      assert.equal(cut.mat.length, (4 * cut.pos.length) / 3);
      assert.equal(cut.suv.length, (2 * cut.pos.length) / 3);
      t.diagnostic(JSON.stringify({ id, level, trimmed, retained, triangles: cut.idx.length / 3 }));
    }
  }
});

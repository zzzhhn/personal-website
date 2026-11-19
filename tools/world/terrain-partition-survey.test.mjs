import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import R from '@dimforge/rapier3d-compat';
import { decodeTerrainArtifact } from '../../src/components/world/terrain-artifact.ts';
import { decodeAlphaTerrain } from '../../src/components/world/alpha-island/alpha-terrain-artifact.ts';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('src/components/world/terrain-artifacts.generated.json', root)));

// Both physics partitions preserve source-triangle order. Walk the three
// buffers together to detect omission, duplication, flipped winding or a stray face.
function survey({indices, surface, solid}) {
  let floorCursor = 0, wallCursor = 0;
  const matches = (array, offset, face) => array[offset] === indices[face]
    && array[offset + 1] === indices[face + 1] && array[offset + 2] === indices[face + 2];
  for (let face = 0; face < indices.length; face += 3) {
    const floor = matches(surface, floorCursor, face), wall = matches(solid, wallCursor, face);
    if (floor === wall) throw new Error('Expected exactly one collision owner at triangle ' + face / 3);
    if (floor) floorCursor += 3;
    else wallCursor += 3;
  }
  assert.equal(floorCursor,surface.length);
  assert.equal(wallCursor,solid.length);
  return { triangles: indices.length / 3, floor: floorCursor / 3, wall: wallCursor / 3 };
}

// Start at each visible triangle, so a cliff above the player cannot hide a missing floor.
function measureTerrainContact(data, parts) {
  const ray = new R.Ray({x:0, y:0, z:0}, {x:0, y:-1, z:0});
  const offset = .06;
  let samples = 0, maxError = 0;
  for (const [part, hitShape] of parts) {
    const indices = data[part];
    for (let face = 0; face < indices.length; face += 3) {
      const a = indices[face] * 3, b = indices[face + 1] * 3, c = indices[face + 2] * 3;
      const vertices = data.positions;
      const centerX = (vertices[a]+vertices[b]+vertices[c])/3;
      const centerY = (vertices[a+1]+vertices[b+1]+vertices[c+1])/3;
      const centerZ = (vertices[a+2]+vertices[b+2]+vertices[c+2])/3;
      for (const index of [a,b,c]) {
        // Eight percent toward the centre avoids the ambiguous shared edge while probing each corner.
        ray.origin.x = .92*vertices[index] + .08*centerX;
        ray.origin.y = .92*vertices[index+1] + .08*centerY + offset;
        ray.origin.z = .92*vertices[index+2] + .08*centerZ;
        const distance = hitShape.castRay(ray, 2*offset, false);
        const error = Math.abs(distance-offset);
        if (error > .001) throw new Error('Terrain contact mismatch at '+JSON.stringify({part,face:face/3, position:ray.origin, distance}));
        maxError = Math.max(maxError,error);
        samples++;
      }
    }
  }
  return {samples, maxError};
}

await R.init();

for (const variant of ['v3','v4','alpha']) {
  test('every built ' + variant + ' terrain triangle has a single physical owner', async t => {
    const bytes = gunzipSync(await readFile(new URL('public' + manifest[variant].url, root)));
    const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const data = variant === 'alpha' ? decodeAlphaTerrain(raw) : decodeTerrainArtifact(raw,variant).terrain;
    const world = new R.World({x:0,y:-9.81,z:0});
    t.after(()=>world.free());
    const parts = ['surface','solid'].filter(key => data[key].length).map(key =>
      [key, world.createCollider(R.ColliderDesc.trimesh(data.positions,data[key]))]);
    t.diagnostic(JSON.stringify({...survey(data), ...measureTerrainContact(data,parts)}));
    const [floor] = parts;
    for (const y of [.03,-.03]) {
      floor[1].setTranslation({x:0,y,z:0});
      assert.throws(()=>measureTerrainContact(data,[floor]), /Terrain contact mismatch/);
    }
    assert.throws(()=>survey({...data,surface:data.surface.subarray(3)}), /collision owner/);
  });
}

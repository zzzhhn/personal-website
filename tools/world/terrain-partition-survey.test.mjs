import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
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

for (const variant of ['v3','v4','alpha']) {
  test('every built ' + variant + ' terrain triangle has a single physical owner', async t => {
    const bytes = gunzipSync(await readFile(new URL('public' + manifest[variant].url, root)));
    const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const data = variant === 'alpha' ? decodeAlphaTerrain(raw) : decodeTerrainArtifact(raw,variant).terrain;
    t.diagnostic(JSON.stringify(survey(data)));
    assert.throws(()=>survey({...data,surface:data.surface.subarray(3)}), /collision owner/);
  });
}

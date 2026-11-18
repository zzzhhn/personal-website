import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster } from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { ALPHA_ORIGIN } from '../../../src/components/world/alpha-island/alpha-layout.ts';
import { decodeAlphaTerrain } from '../../../src/components/world/alpha-island/alpha-terrain-artifact.ts';
import { alphaTerrainData } from '../../../src/components/world/alpha-island/alpha-terrain.ts';

export function shippingAlphaTerrain() {
  const manifest = JSON.parse(readFileSync(new URL('../../../src/components/world/terrain-artifacts.generated.json',import.meta.url),'utf8'));
  const packed = gunzipSync(readFileSync(new URL('../../../public'+manifest.alpha.url,import.meta.url)));
  const data = decodeAlphaTerrain(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength));
  const runtime = alphaTerrainData(), geometry = new BufferGeometry(), material = new MeshBasicMaterial();
  for (const k of ['positions','indices','surface','solid']) assert.deepEqual(runtime[k],data[k],'terrain payload mismatch: '+k);
  geometry.setAttribute('position',new Float32BufferAttribute(data.positions,3));
  geometry.setIndex(Array.from(data.indices)); geometry.boundsTree=new MeshBVH(geometry);
  const mesh=new Mesh(geometry,material), ray=new Raycaster();
  mesh.raycast=acceleratedRaycast; mesh.position.fromArray(ALPHA_ORIGIN); mesh.updateMatrixWorld(true);
  ray.firstHitOnly=true; ray.ray.direction.set(0,-1,0);
  function support(x,z) {
    ray.ray.origin.set(x,200,z);
    const hit=ray.intersectObject(mesh)[0]; assert.ok(hit,'no terrain at '+[x,z]);
    return {height:hit.point.y,normalY:hit.face.normal.y};
  }
  return {data,support,height:(x,z)=>support(x,z).height,dispose(){geometry.dispose();material.dispose();}};
}

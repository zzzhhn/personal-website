import type { BufferGeometry } from 'three';
import { CENTER, MeshBVH } from 'three-mesh-bvh';

// This merged shell is immutable. Four short occlusion rays used to scan its
// entire index every frame. Keep the render index and authored face IDs intact.
export function indexFactoryStructure(geometry: BufferGeometry) {
  const options = { strategy: CENTER, indirect: true, setBoundingBox: false };
  geometry.boundsTree = new MeshBVH(geometry, options);
}

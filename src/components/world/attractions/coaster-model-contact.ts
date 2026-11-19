import { Matrix4, Mesh, Vector3, type Object3D } from 'three';

type CollisionRange = { id: string; collision: 'solid'; surfaceId: string; firstIndex: number; indexCount: number };
type TriangleContact = (a: Vector3, b: Vector3, c: Vector3) => string;

/** Declare each contiguous source range in the indexed render batches. */
export function coasterContactSources(root: Object3D, surfaceId: string, partition?: TriangleContact) {
  const meshes: Mesh[] = [], transform = new Matrix4();
  const points = [new Vector3(), new Vector3(), new Vector3()] as const;
  root.updateWorldMatrix(true, true);
  const toLocal = root.matrixWorld.clone().invert();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const { index } = object.geometry;
    const positions = object.geometry.getAttribute('position');
    if (!index || !index.count || index.count % 3 || !positions) throw Error(`Invalid contact source ${object.name}`);
    meshes.push(object);
    const ranges: CollisionRange[] = [];
    function append(firstIndex: number, indexCount: number, supply: string) {
      ranges.push({ id: `${surfaceId}:batch-${meshes.length}-range-${ranges.length + 1}`,
        collision: 'solid', surfaceId: supply, firstIndex, indexCount });
    }
    if (partition) {
      transform.multiplyMatrices(toLocal, object.matrixWorld);
      let previous = '', first = 0;
      for (let i = 0; i < index.count; i += 3) {
        points.forEach((point, j) => point.fromBufferAttribute(positions, index.getX(i + j)).applyMatrix4(transform));
        const supply = partition(...points);
        if (previous && supply !== previous) { append(first, i - first, previous); first = i; }
        previous = supply;
      }
      append(first, index.count - first, previous);
    } else append(0, index.count, surfaceId);
    object.userData.worldCollisionSources = ranges;
  });
  if (!meshes.length) throw Error(`Missing contact source ${surfaceId}`);
  return meshes;
}

/** Copy the installed source faces into the collider's local coordinates.
 * One Rapier shape supplies those ranges. The reflected leaf reverses winding. */
export function coasterModelContact(root: Object3D, surfaceId: string, mirrorX = 1, sources = coasterContactSources(root, surfaceId)) {
  root.updateWorldMatrix(true, true);
  const toLocal = root.matrixWorld.clone().invert(), transform = new Matrix4();
  const point = new Vector3(), vertices: number[] = [], indices: number[] = [];
  for (const object of sources) {
    const index = object.geometry.index!;
    const positions = object.geometry.getAttribute('position');
    transform.multiplyMatrices(toLocal, object.matrixWorld);
    const flip = transform.determinant() * mirrorX < 0;
    const ranges = (object.userData.worldCollisionSources as CollisionRange[]).filter(range => range.surfaceId === surfaceId);
    if (!ranges.length) continue;
    const used = new Int32Array(positions.count).fill(-1);
    const vertex = (i: number) => {
      const raw = index.getX(i);
      if (used[raw] === -1) {
        used[raw] = vertices.length / 3;
        point.fromBufferAttribute(positions, raw).applyMatrix4(transform);
        vertices.push(point.x * mirrorX, point.y, point.z);
      }
      return used[raw];
    };
    for (const range of ranges) for (let i = range.firstIndex; i < range.firstIndex + range.indexCount; i += 3) {
      indices.push(vertex(i), vertex(i + (flip ? 2 : 1)), vertex(i + (flip ? 1 : 2)));
    }
  }
  if (!indices.length) throw Error(`No triangles for ${surfaceId}`);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

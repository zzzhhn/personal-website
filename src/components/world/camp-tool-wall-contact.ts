import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { nearestCampToolLane } from './camp-prop-interactions';
import { localTrimesh } from './WorldCampContentAssets';

export const campToolColliderKey = (lane: number) => `camp-content-collider-C11-tool-${lane}`;

type ToolBatch = { source: Mesh; original: BufferGeometry; transform: Matrix4; indices: number[]; lanes: number[] };

function parkDeclaration(mesh: Mesh, lanes: number[]) {
  const runs: { lane: number; first: number; count: number }[] = [];
  lanes.forEach((lane, face) => {
    const last = runs.at(-1);
    if (last?.lane === lane) last.count += 3;
    else runs.push({ lane, first: face * 3, count: 3 });
  });
  mesh.userData.worldCollision = 'solid';
  delete mesh.userData.collisionReason;
  mesh.userData.worldCollisionSources = runs.map(({ lane, first, count }) => ({
    id: `${mesh.name}:${first}`, collision: 'solid', surfaceId: campToolColliderKey(lane),
    ...(mesh.geometry.index ? { firstIndex: first, indexCount: count } : { firstVertex: first, vertexCount: count }),
  }));
}

function toolGeometry(source: BufferGeometry, indices: number[]) {
  const geometry = new BufferGeometry(), vertices: number[] = [], remap = new Map<number, number>();
  const compact = indices.map(index => {
    const existing = remap.get(index);
    if (existing !== undefined) return existing;
    const next = vertices.length;
    vertices.push(index); remap.set(index, next);
    return next;
  });
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const { itemSize } = attribute, values = new Float32Array(vertices.length * itemSize);
    for (let i = 0; i < vertices.length; i++) {
      for (let j = 0; j < itemSize; j++) values[i * itemSize + j] = attribute.getComponent(vertices[i], j);
    }
    geometry.setAttribute(name, new BufferAttribute(values, itemSize));
  }
  geometry.setIndex(compact);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Both GLBs separate their tools into five authored lanes. Preserve the idle
 * material batches, while recording each submitted face and its real parking shape. */
export function prepareCampToolRack(root: Object3D, frame: Matrix4, centres: readonly number[]) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), point = new Vector3();
  const batches: ToolBatch[] = [];
  root.traverse(object => {
    const source = object as Mesh;
    if (!source.isMesh) return;
    const original = source.geometry, positions = original.getAttribute('position'), index = original.index;
    const transform = new Matrix4().multiplyMatrices(inverse, source.matrixWorld);
    const indices = Array.from({ length: index?.count ?? positions.count }, (_, i) => index?.getX(i) ?? i);
    const z = Array.from({ length: positions.count }, (_, i) => point.fromBufferAttribute(positions, i).applyMatrix4(transform).z);
    const lanes: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const lane = nearestCampToolLane(z[indices[i]], centres);
      if (lane !== nearestCampToolLane(z[indices[i + 1]], centres) || lane !== nearestCampToolLane(z[indices[i + 2]], centres)) {
        throw new Error('Camp tool triangle spans two parking lanes');
      }
      lanes.push(lane);
    }
    parkDeclaration(source, lanes);
    batches.push({ source, original, transform, indices, lanes });
  });
  const shapes = centres.map((_, lane) => {
    const geometries = batches.flatMap(({ source, original, transform, indices, lanes }) => {
      const selected = indices.filter((_, i) => lanes[Math.floor(i / 3)] === lane);
      if (!selected.length) return [];
      return [{ name: source.name, geometry: toolGeometry(original, selected), matrix: new Matrix4().multiplyMatrices(frame, transform), glow: false }];
    });
    if (!geometries.length) throw new Error(`Camp tool lane ${lane} has no physical triangles`);
    const shape = localTrimesh(geometries);
    geometries.forEach(part => part.geometry.dispose());
    return shape;
  });
  return { batches, shapes };
}

/** Transfer exactly the same lane that supplies the parked collider. While
 * the guide holds a tool it is a hand prop, outside the locomotion solver. */
export function takeCampTool(batches: readonly ToolBatch[], carried: Object3D, lane: number) {
  const changes = batches.flatMap(batch => {
    const { source, original, transform, indices, lanes } = batch;
    const taken = indices.filter((_, i) => lanes[Math.floor(i / 3)] === lane);
    if (!taken.length) return [];
    const kept = indices.filter((_, i) => lanes[Math.floor(i / 3)] !== lane);
    const wall = toolGeometry(original, kept);
    const hand = new Mesh(toolGeometry(original, taken), source.material);
    hand.name = `camp-carried-tool-${lane}`;
    hand.matrix.copy(transform); hand.matrixAutoUpdate = false;
    hand.castShadow = source.castShadow; hand.receiveShadow = source.receiveShadow;
    hand.userData = { assetId: 'C11', noOcclusionFade: true, shadowDynamic: true, worldCollision: 'none',
      collisionReason: 'The guide carries this tool without obstructing its own locomotion' };
    return [{ batch, wall, hand, parkedFaces: kept.length > 0 }];
  });
  if (!changes.length) return null;
  for (const { batch, wall, hand, parkedFaces } of changes) {
    const { source, lanes } = batch;
    source.geometry = wall;
    if (parkedFaces) parkDeclaration(source, lanes.filter(parked => parked !== lane));
    else {
      source.visible = false;
      source.userData.worldCollision = 'none';
      source.userData.collisionReason = 'All faces of this hidden wall batch are currently in the guide’s hand';
      delete source.userData.worldCollisionSources;
    }
    carried.add(hand);
  }
  return () => {
    for (const { batch, wall, hand } of changes) {
      const { source, original, lanes } = batch;
      source.geometry = original;
      source.visible = true;
      parkDeclaration(source, lanes);
      hand.removeFromParent(); hand.geometry.dispose(); wall.dispose();
    }
  };
}

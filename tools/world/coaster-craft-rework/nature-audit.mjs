import { createHash } from 'node:crypto';
import { CoasterBatch } from '../../../src/components/world/attractions/coaster-geometry.ts';
import { addCoasterLandscape } from '../../../src/components/world/attractions/coaster-landscape.ts';
import { addCoasterCliffs } from '../../../src/components/world/attractions/coaster-landscape-cliffs.ts';
import { createCoasterTerrainRelief } from '../../../src/components/world/attractions/coaster-terrain-relief.ts';
import { COASTER_VEGETATION_BUDGET, coasterVegetationLayout } from '../../../src/components/world/attractions/coaster-vegetation-layout.ts';

const hash = data => createHash('sha256').update(data).digest('hex');
const serialized = value => hash(JSON.stringify(value));

function count(batch) {
  const emittedParts = batch.parts.length;
  const geometry = batch.finish();
  const vertices = geometry.getAttribute('position').count;
  const triangles = (geometry.index?.count ?? vertices) / 3;
  const attributeBytes = Object.fromEntries(
    Object.entries(geometry.attributes).map(([name, attribute]) => [name, attribute.array.byteLength]),
  );
  const roleVertices = {};
  const role = geometry.getAttribute('intentCraftSurface');
  if (role) {
    for (const id of role.array) roleVertices[id] = (roleVertices[id] ?? 0) + 1;
  }
  geometry.dispose();
  return { triangles, vertices, emittedParts, attributeBytes, roleVertices };
}

function measureLandscape(detailed) {
  const steel = new CoasterBatch(), glow = new CoasterBatch(), colliders = [];
  addCoasterLandscape(steel, glow, colliders, detailed);
  addCoasterCliffs(steel, glow, colliders, true);
  return { steel: count(steel), glow: count(glow), colliders: colliders.length, colliderSHA: serialized(colliders) };
}

const relief = createCoasterTerrainRelief();
const reliefMetrics = {
  triangles: relief.triangleCount,
  verticesSHA: hash(Buffer.from(relief.vertices.buffer)),
  indicesSHA: hash(Buffer.from(relief.indices.buffer)),
  renderNormalsSHA: hash(Buffer.from(relief.geometry.attributes.normal.array.buffer)),
  renderPigmentSHA: hash(Buffer.from(relief.geometry.attributes.color.array.buffer)),
  dropSample: relief.dropSample,
};
relief.geometry.dispose();

const plants = coasterVegetationLayout();
const trees = plants.filter(plant => plant.kind !== 2);
const bushes = plants.filter(plant => plant.kind === 2);
console.log(JSON.stringify({
  scope: 'Source geometry, collider and instancing inventory for the coaster landscape lane',
  near: measureLandscape(true),
  far: measureLandscape(false),
  relief: reliefMetrics,
  vegetation: {
    byKind: [0, 1, 2].map(kind => plants.filter(plant => plant.kind === kind).length),
    treesSHA: serialized(trees.map(plant => ({ id: plant.id, matrix: plant.matrix.elements }))),
    bushes: bushes.length,
    budget: COASTER_VEGETATION_BUDGET,
    dropBushes: bushes.filter(plant => plant.id.startsWith('drop-')).map(plant => ({
      id: plant.id, local: plant.local, scale: plant.scale,
    })),
  },
}, null, 2));

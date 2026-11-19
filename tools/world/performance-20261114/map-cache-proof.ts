import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createMapPathCache } from '../../../src/components/world/map-path-cache.ts';
import type { WORLD_MAP_GEOMETRY } from '../../../src/components/world/WorldMap.tsx';
import * as layout from '../../../src/components/world/layout.ts';
import * as mine from '../../../src/components/world/alpha-mine-layout.ts';
import * as exchange from '../../../src/components/world/alpha-exchange-layout.ts';
import * as club from '../../../src/components/world/djc-club-layout.ts';
import * as attraction from '../../../src/components/world/attractions/attraction-layout.ts';
import * as alpha from '../../../src/components/world/alpha-island/alpha-layout.ts';
import * as visitor from '../../../src/components/world/alpha-island/alpha-visitor-path.ts';
import { FACTORY_FOOTPRINT } from '../../../src/components/world/factory/factory-layout.ts';

async function main() {
  type Points = ReadonlyArray<readonly number[]>;
  // Uncached SVG polygon/polyline coordinates consumed by the minimap.
  const svgPoints = (points: Points) => Array.from(points, point => [point[0],point.length === 3 ? point[2] : point[1]].join(',')).join(' ');
  const old = { path: svgPoints, shorePath: (loops: readonly Points[]) =>
    Array.from(loops, loop => 'M' + svgPoints(loop) + 'Z').join(' ') };
  assert.equal(old.path([[3,7,4],[5,6]]), '3,4 5,6');
  const variant = layout.LAYOUT_V4 ? 'v4' : 'v3';
  const file = new URL('../../../src/components/world/world-map-' + variant + '.generated.json', import.meta.url);
  const geometry: typeof WORLD_MAP_GEOMETRY = JSON.parse(readFileSync(file, 'utf8'));
  const points = [
    alpha.ALPHA_MAINLAND_PIER_POLYGON, alpha.ALPHA_MAINLAND_APPROACH, visitor.ALPHA_VISITOR_PATH,
    ...visitor.ALPHA_VISITOR_SPURS.map(s => s.path), mine.ALPHA_MINE_FOOTPRINT_POINTS,
    FACTORY_FOOTPRINT, layout.ROAD_POINTS, layout.BOARDWALK_POINTS, mine.ALPHA_MINE_CONNECTOR,
    exchange.ALPHA_EXCHANGE_APPROACH, attraction.ATTRACTION_ROAD_SAMPLES[0], attraction.INTENT_COASTER_FOOTPRINT,
    attraction.IBD_FOOTPRINT, attraction.COASTER_ARRIVAL.roadOutline, attraction.COASTER_ARRIVAL.walkOutline,
    club.CLUB_APPROACH, ...club.CLUB_WALKWAYS, club.CLUB_POOL.outline,
    geometry.camp, geometry.coaster, ...(geometry.roads?.map(r => r.pts) ?? []), ...geometry.shores,
  ];
  const cache = createMapPathCache();
  points.forEach(cache.register);
  const fallback = [layout.ISLAND_OUTLINE];
  cache.registerShore(geometry.shores); cache.registerShore(fallback);
  for (const p of points) assert.equal(cache.path(p), old.path(p));
  for (const loops of [fallback, geometry.shores]) assert.equal(cache.shorePath(loops), old.shorePath(loops));

  let serializations = 0;
  const instrumented = new Proxy(geometry.shores[0], { get(target, key, receiver) { if (key === 'map') serializations++; return Reflect.get(target, key, receiver); } });
  cache.register(instrumented);
  for (let i = 0; i < 900; i++) assert.equal(cache.path(instrumented), old.path(geometry.shores[0]));
  assert.equal(serializations, 1, 'registered geometry serializes once across 900 updates');
  const dynamic = [[1, 2, 3], [4, 5]];
  assert.equal(cache.path(dynamic), old.path(dynamic));
  dynamic[0][2] = 99; dynamic.push([7, 8]);
  assert.equal(cache.path(dynamic), old.path(dynamic));
  const dynamicLoops = [dynamic];
  assert.equal(cache.shorePath(dynamicLoops), old.shorePath(dynamicLoops));
  dynamic[1][1] = -41;
  assert.equal(cache.shorePath(dynamicLoops), old.shorePath(dynamicLoops));
  dynamicLoops.push([[9, 10]]);
  assert.equal(cache.shorePath(dynamicLoops), old.shorePath(dynamicLoops));
  const empty: number[][] = []; cache.register(empty); assert.equal(cache.path(empty), old.path(empty));
  const clone = geometry.shores[0].map(p => [...p]); cache.register(clone); assert.equal(cache.path(clone), old.path(clone));

  // Exclude standalone shoreline paths and the inactive v3 road fallback from
  // the repeated render workload (they remain covered by the equality checks).
  const renderedPoints = points.filter(p => !geometry.shores.includes(p as number[][]) && (!layout.LAYOUT_V4 || p !== layout.ROAD_POINTS));
  let checksum = 0;
  const frame = (f: Pick<typeof cache, 'path' | 'shorePath'>) => {
    checksum += f.shorePath(geometry.shores).length + f.shorePath(geometry.shores).length;
    for (const p of renderedPoints) checksum += f.path(p).length;
  };
  const measure = (f: Pick<typeof cache, 'path' | 'shorePath'>) => {
    const start = performance.now(); for (let i = 0; i < 900; i++) frame(f); return performance.now() - start;
  };
  for (let i = 0; i < 10; i++) { frame(old); frame(cache); }
  const baseline: number[] = [], cached: number[] = [];
  for (let i = 0; i < 5; i++) { baseline.push(measure(old)); cached.push(measure(cache)); }
  const median = (values: number[]) => [...values].sort((a,b) => a-b)[2];
  const result = {
    reference: 'Uncached SVG serialization of the current shipped map', pointArraysCompared: points.length, totalPoints: points.reduce((n,p)=>n+p.length,0),
    shorelinePoints: geometry.shores.reduce((n,p)=>n+p.length,0), geometryRoads: geometry.roads?.length,
    equalOutputs: true, registeredSerializationsAcross900Updates: serializations, unregisteredMutationsObserved: true,
    ticksPerSample: 900, samples: 5, baselineMs: baseline, cachedMs: cached,
    medianBaselineMs: median(baseline), medianCachedMs: median(cached), speedup: median(baseline)/median(cached),
    checksum, warning: 'Focused serialization CPU benchmark only; excludes React reconciliation, SVG painting, Three rendering and app FPS.',
  };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main();

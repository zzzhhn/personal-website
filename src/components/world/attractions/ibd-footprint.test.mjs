import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Builder } from '../WorldStreetGeometry.ts';
import { IBD_YARD, IBD_FOOTPRINT, IBD_BOUNDARY_SEGMENTS, ibdFootprintDistance, attractionCapeDistance, attractionRoadDistance } from './attraction-layout.ts';
import { IBD_STATIONS, IBD_SHEDS } from './ibd-yard-layout.ts';
import { buildIbdPaving } from './ibd-yard-site.ts';
import { buildIbdStatic } from './ibd-yard-geometry.ts';

const local = IBD_FOOTPRINT.map(([x,z]) => [x - IBD_YARD.center[0], z - IBD_YARD.center[2]]);
const insideDistance = (x,z) => ibdFootprintDistance(x + IBD_YARD.center[0], z + IBD_YARD.center[2]);
const polygonArea = Math.abs(local.reduce((n,a,i) => { const b = local[(i+1)%local.length]; return n+a[0]*b[1]-a[1]*b[0]; },0))/2;
function topTriangles(surface) {
  const triangles = [];
  for (let i = 0; i < surface.indices.length; i += 3) {
    const points = Array.from(surface.indices.slice(i,i+3), j => Array.from(surface.vertices.slice(j*3,j*3+3)));
    if (points.every(p => Math.abs(p[1]-.085)<1e-6)) triangles.push(points);
  }
  return triangles;
}
test('operational lobes and drainage notch are real, while original sheds, actions and entrance remain inside', () => {
  assert.deepEqual(IBD_YARD.center, [-88,1,-177]); assert.deepEqual(IBD_YARD.entrance, [-88,1.08,-143]);
  assert.ok(insideDistance(-40,22)<-2, 'western turning court is a usable paved extension');
  assert.ok(insideDistance(30,-2)>2, 'eastern drainage setback is genuinely outside the paved footprint');
  for (const s of IBD_STATIONS) assert.ok(insideDistance(s.at[0],s.at[2])<=-1.8, s.id);
  for (const s of IBD_SHEDS) for (const x of [-1,1]) for (const z of [-1,1])
    assert.ok(insideDistance(s.x+x*(s.width/2+.4),s.z+z*(s.depth/2+.5))<0, `${s.id} roof corner`);
  for (const z of [28.5,31,33.5]) assert.ok(insideDistance(-13,z)<0, 'portal approach stays paved');
  assert.equal(IBD_BOUNDARY_SEGMENTS.length, IBD_FOOTPRINT.length);
  for (let i=0;i<IBD_FOOTPRINT.length;i++) {
    assert.equal(IBD_BOUNDARY_SEGMENTS[i].a,IBD_FOOTPRINT[i]);
    assert.equal(IBD_BOUNDARY_SEGMENTS[i].b,IBD_FOOTPRINT[(i+1)%IBD_FOOTPRINT.length]);
  }
});
test('paving top exactly covers the polygon once, with no old rectangular floor or degenerate collision triangles', () => {
  const b = new Builder(), ground = buildIbdPaving(b), top = topTriangles(ground);
  let area=0;
  for (const [a,c,d] of top) {
    const twice=(c[2]-a[2])*(d[0]-a[0])-(c[0]-a[0])*(d[2]-a[2]);
    assert.ok(twice>1e-8, 'upward nondegenerate triangle'); area+=twice/2;
    assert.ok(insideDistance((a[0]+c[0]+d[0])/3,(a[2]+c[2]+d[2])/3)<1e-5);
  }
  assert.ok(Math.abs(area-polygonArea)<.003, `${area} vs ${polygonArea} m²`);
  // Welded collision triangles use exactly the rendered point positions, not a second approximation.
  assert.equal(ground.indices.length,b.idx.length);
  for (let i=0;i<b.idx.length;i++) for (let axis=0;axis<3;axis++)
    assert.ok(Math.abs(ground.vertices[ground.indices[i]*3+axis]-b.pos[b.idx[i]*3+axis])<4e-6);
  const data=buildIbdStatic();
  try {
    assert.ok(!data.solids.some(s=>s.at[1]<.3&&s.size[0]>20&&s.size[2]>20), 'old cuboid slab removed');
    assert.deepEqual(Array.from(data.walkSurface.indices.slice(0,ground.indices.length)),Array.from(ground.indices));
    assert.deepEqual(Array.from(data.walkSurface.vertices.slice(0,ground.vertices.length)),Array.from(ground.vertices));
    assert.ok(data.geometry.index.count/3<35000,'static geometry remains under 35k triangles');
  } finally { data.geometry.dispose(); }
});
test('all new boundaries stay inland and physical fences leave existing roads and arrival gates clear', () => {
  for (const edge of IBD_BOUNDARY_SEGMENTS) for (let i=0;i<=20;i++) {
    const x=edge.a[0]+(edge.b[0]-edge.a[0])*i/20, z=edge.a[1]+(edge.b[1]-edge.a[1])*i/20;
    assert.ok(attractionCapeDistance(x,z)<-6, `shore buffer at ${x},${z}`);
    if(edge.kind==='fence') assert.ok(attractionRoadDistance(x,z)>4, `fence obstructs road at ${x},${z}`);
  }
  const south = IBD_BOUNDARY_SEGMENTS.filter(e=>e.a[1]>=IBD_YARD.center[2]+30&&e.b[1]>=IBD_YARD.center[2]+30);
  assert.ok(south.some(e=>e.kind==='open'&&e.a[0]>=IBD_YARD.center[0]&&e.b[0]<=IBD_YARD.center[0]));
  const map=readFileSync(new URL('../WorldMap.tsx',import.meta.url),'utf8');
  assert.match(map,/data-ibd-footprint='physical' points=\{path\(IBD_FOOTPRINT\)\}/);
});

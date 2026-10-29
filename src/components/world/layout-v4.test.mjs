/** Planar contract for layout v4 step 1 (spec §12). Run:
 *   node --experimental-strip-types --test src/components/world/layout-v4.test.mjs
 * These are geometry preconditions only; driving, physics and visuals are verified by the bots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './layout-v4.ts';
import { BUILDINGS, CAMP_CENTER, CAMP_SPAWN, VEHICLES, BOOTHS, BOARDWALK_POINTS, BRIDGE_START, BRIDGE_END, ISLAND_OUTLINE } from './layout.ts';

const xz = L.xz;
/** Vehicle footprint swept along a centreline: [half length, half width] per v3 vehicle sizes. */
const CARS = VEHICLES.map(v => ({ id: v.id, hl: v.size[0] / 2, hw: v.size[2] / 2 }));
/** Wheelbase 0.68 L (wheelGeometry points), max steer at walking pace: van .38, coupe .52, offroad .47. */
const STEER = { van: .38, coupe: .52, offroad: .47 };

function sweptClearance(route, solids, margin) {
  // Car body as an oriented rectangle sampled along the route; distance from its corners/edges to each solid.
  let worst = { d: Infinity, at: null, solid: null, car: null };
  for (const car of CARS) {
    for (let s = 0, total = L.polylineLength(route); s <= total; s += .5) {
      const q = L.pointAt(route, s), r = L.rightOf(q.dir);
      const pts = [];
      for (const fl of [-1, -.5, 0, .5, 1]) for (const fw of [-1, 0, 1]) pts.push([q.p[0] + q.dir[0] * car.hl * fl + r[0] * car.hw * fw, q.p[1] + q.dir[1] * car.hl * fl + r[1] * car.hw * fw]);
      for (const so of solids) for (const p of pts) {
        const d = L.solidDistance(p, so);
        if (d < worst.d) worst = { d, at: q.p.map(v => +v.toFixed(2)), solid: `${so.kind}@${so.position[0].toFixed(1)},${so.position[2].toFixed(1)}`, car: car.id };
      }
    }
  }
  return worst;
}

test('frozen anchors: camp, spawn, ramp three points, offroad, van, bridge deck, park, boardwalk, booths', () => {
  assert.deepEqual(L.ROADS_V4.find(r => r.id === 'camp-ramp').pts, [[-30, 4.84, 34], [-18, 4.84, 34], [-5, 1.14, 29]]);
  assert.deepEqual(L.ROADS_V4.find(r => r.id === 'bridge').pts, [BRIDGE_START, BRIDGE_END]);
  assert.deepEqual(L.VEHICLE_POSITIONS_V4.offroad.position, VEHICLES.find(v => v.id === 'offroad').position);
  assert.deepEqual(L.VEHICLE_POSITIONS_V4.van.position, VEHICLES.find(v => v.id === 'van').position);
  assert.deepEqual(L.CAMP_XZ, [CAMP_CENTER[0], CAMP_CENTER[2]]);
  assert.equal(CAMP_SPAWN[0], -42);
  assert.deepEqual(L.TIMELINE_ROUTE_V4.at(-1), [49, 1.14, -46]);
  assert.equal(BOOTHS.length, 6); assert.equal(BOARDWALK_POINTS.length, 4);
});

test('six buildings keep ids, sizes and startDate order south -> north; pillars stand on the west sidewalk', () => {
  assert.deepEqual(L.BUILDINGS_V4.map(b => b.id), BUILDINGS.map(b => b.id));
  assert.deepEqual(L.BUILDINGS_V4.map(b => b.size), BUILDINGS.map(b => b.size));
  for (let i = 1; i < 6; i++) assert.ok(L.BUILDINGS_V4[i].position[2] < L.BUILDINGS_V4[i - 1].position[2]);
  for (const b of L.BUILDINGS_V4) { const x = b.position[0] + b.size[0] / 2 + 5; assert.ok(x > 15 && x < 17, `${b.id} pillar ${x}`); }
  // Hunyuan is the J3 west-side landmark (not on the avenue axis).
  const h = L.BUILDINGS_V4.at(-1);
  assert.ok(h.position[0] + h.size[0] / 2 < 21 - 4 && Math.abs(h.position[2] - (-43)) < .01);
});

test('control outline: approved polygon, convex, contains the old outline and keeps the bridge-axis shore x = 29.45', () => {
  const P = L.OUTLINE_V4;
  for (const p of ISLAND_OUTLINE) assert.ok(L.insidePolygon(p, P) || L.polygonDistance(p, P) < .01, `old vertex ${p}`);
  let sign = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = P[(i + 2) % P.length], cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    sign ||= Math.sign(cr); assert.equal(Math.sign(cr), sign);
  }
  let x = 26; while (L.insidePolygon([x, -42 - 2 * (x - 26) / 17], P)) x += .01;
  assert.ok(Math.abs(x - 29.45) < .06, `bridge shore ${x}`);
});

test('roads clear the camp flank foot by >= 2 m (ring-west was 0.18 m in the proposal) and stay inside the outline', () => {
  for (const r of L.DRIVABLE_V4) {
    if (r.id.startsWith('camp')) continue;
    let m = Infinity;
    for (let i = 1; i < r.pts.length; i++) m = Math.min(m, L.segmentDistance(L.CAMP_XZ, xz(r.pts[i - 1]), xz(r.pts[i])).distance);
    assert.ok(m - L.paveHalf(r.cls) - L.CAMP_FOOT_RADIUS >= 2, `${r.id} camp margin ${(m - L.paveHalf(r.cls) - L.CAMP_FOOT_RADIUS).toFixed(2)}`);
    if (['bridge', 'park-spur', 'bridge-link', 'turn-j3'].includes(r.id)) continue;
    for (const p of r.pts) assert.ok(L.signedInside(xz(p), L.OUTLINE_V4) - L.paveHalf(r.cls) >= .5, `${r.id} near shore at ${p}`);
  }
});

test('J1 / J3 / J8 are real turns: radius above every vehicle minimum, continuous and fully paved', () => {
  for (const [id, turn] of [['J1', L.TURN_J1], ['J3', L.TURN_J3], ['J8', L.TURN_J8]]) {
    for (const v of CARS) {
      const wb = (v.hl * 2) * .68, rmin = wb / Math.sin(STEER[v.id]);
      assert.ok(L.TURN_RADIUS > rmin * 1.08, `${id} ${v.id} needs ${rmin.toFixed(2)}`);
    }
    for (let s = 0, total = L.polylineLength(turn); s <= total; s += .25) {
      const q = L.pointAt(turn, s), r = L.rightOf(q.dir);
      for (const off of [-3.6, 0, 3.6]) assert.ok(L.onPavement([q.p[0] + r[0] * off, q.p[1] + r[1] * off]), `${id} unpaved at s=${s.toFixed(1)} off=${off}`);
    }
  }
});

test('timeline route and ring loop are continuous drives over pavement', () => {
  for (const [name, route] of [['timeline', L.TIMELINE_ROUTE_V4], ['ring', L.RING_LOOP_V4]]) {
    for (let i = 1; i < route.length; i++) assert.ok(Math.hypot(route[i][0] - route[i - 1][0], route[i][2] - route[i - 1][2]) < 60, `${name} gap at ${i}`);
    for (let s = 0, total = L.polylineLength(route); s <= total; s += .5) {
      const q = L.pointAt(route, s);
      if (Math.hypot(q.p[0] - 49, q.p[1] + 46) < 3) continue; // park plaza owns the last metres
      assert.ok(L.onPavement(q.p), `${name} centre off pavement at ${q.p.map(v => v.toFixed(1))}`);
    }
  }
});

test('fixed solids and knockable poles stay out of the three cars\' swept body on the route, ring and hill drive (>= 0.5 m)', () => {
  const fixed = [...L.solidsV4().filter(s => s.kind !== 'windmill'), ...L.derivedSolidsV4()];
  const poles = L.knockablesV4().map(k => ({ kind: k.kind, position: k.position, size: [.35, 3, .35], yaw: 0 }));
  for (const [name, route] of [['timeline', L.TIMELINE_ROUTE_V4], ['ring', L.RING_LOOP_V4], ['hill', L.HILL_DRIVE_V4]]) {
    const w = sweptClearance(route, [...fixed, ...poles], .5);
    assert.ok(w.d >= .5, `${name}: ${w.car} ${w.d.toFixed(2)} m from ${w.solid} at ${w.at}`);
  }
  const w = sweptClearance(L.HILL_DRIVE_V4, L.solidsV4().filter(s => s.kind === 'windmill'), .5);
  assert.ok(w.d >= .5, `windmill ${w.car} ${w.d.toFixed(2)}`);
});

test('coupe lay-by keeps a continuous walking route >= 2 m wide', () => {
  const car = L.VEHICLE_POSITIONS_V4.coupe.position, c = CARS.find(v => v.id === 'coupe');
  assert.ok(car[0] - c.hw >= 25 - 1e-6 && car[0] + c.hw <= L.LAYBY.x1, 'car inside the lay-by, off the carriageway');
  // Walk north along the sea side from z 18 to z -30 on a 2 m wide corridor; at every z a 2 m span exists.
  for (let z = 18; z >= -30; z -= .5) {
    let ok = false;
    for (let x = 25; x <= 31 - 2 && !ok; x += .1) {
      const span = [0, .5, 1, 1.5, 2].every(dx => L.pavedV4().some(p => (p.kind === 'side' || p.kind === 'walk') && L.insidePolygon([x + dx, z], p.pts)));
      const clearCar = x >= car[0] + c.hw || x + 2 <= car[0] - c.hw || z > car[2] + c.hl || z < car[2] - c.hl;
      ok = span && clearCar;
    }
    assert.ok(ok, `walk interrupted at z=${z}`);
  }
});

test('hill road: walkable flank, gentle grade, bench under the slab, drivable lollipop (no reversing)', () => {
  const flank = Math.atan((L.RIDGE_V4.topY - L.RIDGE_V4.footY) / (L.RIDGE_V4.footR - L.SUMMIT_R)) * 180 / Math.PI;
  assert.ok(flank <= 25, `flank ${flank}`);
  const t = L.HILL_DRIVE_V4;
  assert.deepEqual(t[0], [-30, 1.14, -54]); assert.deepEqual(t.at(-1), [-30, 1.14, -54]);
  for (let i = 1; i < t.length; i++) { const g = (t[i][1] - t[i - 1][1]) / Math.hypot(t[i][0] - t[i - 1][0], t[i][2] - t[i - 1][2]); assert.ok(Math.abs(g) < .10, `grade ${g}`); }
  for (let i = 1; i < t.length; i += 5) {
    const r = Math.hypot(t[i][0] - L.RIDGE_V4.center[0], t[i][2] - L.RIDGE_V4.center[1]);
    if (r > L.RIDGE_V4.footR - .5 || r < L.RIDGE_V4.platformR + .2) continue;
    const h = L.ridgeHeightV4(t[i][0], t[i][2]); assert.ok(h !== null && t[i][1] - h > .05 && t[i][1] - h < .2, `bench ${t[i]} ${h}`);
  }
  // Curvature: every turn of the drive is wider than the van low-speed minimum (~8.3 m) with 8 % margin.
  for (let i = 2; i < t.length; i++) {
    const a = t[i - 2], b = t[i - 1], c = t[i];
    const ab = Math.hypot(b[0] - a[0], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[2] - b[2]), ac = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
    if (area < 1e-6) continue;
    const R = ab * bc * ac / (4 * area);
    assert.ok(R > 8.9, `radius ${R.toFixed(2)} at ${b}`);
  }
  assert.ok(L.signedInside([L.RIDGE_V4.center[0], L.RIDGE_V4.center[1] - L.RIDGE_V4.footR], L.OUTLINE_V4) > 0, 'ridge foot on land');
});

test('knockable furniture respects the capacity and every pole lies on pavement, walk or shoulder', () => {
  assert.ok(L.knockablesV4().length <= L.KNOCKABLE_CAP);
  const kinds = new Set(L.knockablesV4().map(k => k.kind));
  for (const k of ['lamp', 'signal', 'stop']) assert.ok(kinds.has(k), k);
  const onGrass = new Set(['bin-2']); // pocket-park bin
  for (const k of L.knockablesV4()) if (k.road !== 'beach-walk' && !onGrass.has(k.id)) assert.ok(L.pavedV4().some(p => L.insidePolygon(xz(k.position), p.pts)) || k.kind === 'chevron', `${k.id} not on paving`);
});

test('nearestRoadPointV4 and zones derive from the same data', () => {
  const p = L.nearestRoadPointV4([21, 5, 0]);
  assert.ok(Math.abs(p[0] - 21) < 1e-6 && Math.abs(p[1] - 1.14) < 1e-6);
  const ramp = L.nearestRoadPointV4([-14, -20, 31.5]);
  assert.ok(ramp[1] > 1.14 && ramp[1] < 4.84);
  assert.equal(L.zoneAtV4(-42, 30), 'camp'); assert.equal(L.zoneAtV4(10, -20), 'town'); assert.equal(L.zoneAtV4(-30, -84), 'ridge');
  assert.equal(L.zoneAtV4(60, -30), 'park'); assert.equal(L.zoneAtV4(-80, 0), 'shore');
});

test('network walk: one continuous polyline over every drivable road, starting with the frozen ramp', () => {
  const w = L.NETWORK_WALK_V4;
  assert.deepEqual(w.slice(0, 3), [[-30, 4.84, 34], [-18, 4.84, 34], [-5, 1.14, 29]]);
  for (let i = 1; i < w.length; i++) {
    const mid = [(w[i][0] + w[i - 1][0]) / 2, (w[i][2] + w[i - 1][2]) / 2];
    const near = L.DRIVABLE_V4.some(r => r.pts.some((p, k) => k && L.segmentDistance(mid, L.xz(r.pts[k - 1]), L.xz(p)).distance < .05));
    assert.ok(near, `walk leaves the network between ${w[i - 1]} and ${w[i]}`);
  }
  for (const r of L.DRIVABLE_V4) {
    if (r.cls === 'connector') continue;
    for (const p of r.pts) assert.ok(w.some((q, k) => k && L.segmentDistance(L.xz(p), L.xz(w[k - 1]), L.xz(q)).distance < .05), `${r.id} point ${p} not walked`);
  }
});

test('shore samples lie in open water beyond the outline; QA data is complete', () => {
  for (const s of L.SHORE_SAMPLES_V4) assert.ok(L.signedInside(s.p, L.OUTLINE_V4) < -15, s.id);
  const q = L.layoutQaV4();
  assert.equal(q.version, 'v4'); assert.ok(q.timeline.length > 10 && q.ring.length > 10 && q.hill.length > 10);
});

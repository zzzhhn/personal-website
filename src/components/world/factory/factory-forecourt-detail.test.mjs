import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { buildFactoryForecourtDetail } from './factory-forecourt-detail.ts';
import { FACTORY_PALETTE } from './factory-geometry.ts';
import { FACTORY, FACTORY_COURSE_LOCAL, FACTORY_LANE_OFFSET, FACTORY_STATIONS, factoryPolygonDistance, FACTORY_FOOTPRINT } from './factory-layout.ts';
import { FACTORY_WALK_EDGES, FACTORY_WALK_NODES } from './factory-navigation.ts';

test('forecourt and courtyard perimeter details stay bounded, finite, inside survey footprint and clear of all paths and trial lanes', () => {
  const built = buildFactoryForecourtDetail(FACTORY_PALETTE);
  try {
    assert.ok(built.triangles > 400 && built.triangles < 4500, `triangles=${built.triangles}`);
    assert.equal(built.geometry.index.count / 3, built.triangles);
    assert.equal(built.lamps.length, 5);
    assert.ok(built.solids.length >= 12 && built.solids.length <= 40);

    for (const a of Object.values(built.geometry.attributes)) {
      for (const v of a.array) assert.ok(Number.isFinite(v));
    }

    // Every axis-aligned solid stays clear of stations, walking edges, entrance corridor, and both test lanes
    const protectedBoxes = [
      new Box3(new Vector3(42, 0.13, -30.1), new Vector3(50, 2.4, -28.9)), // east entrance
      new Box3(new Vector3(44.5, 0.13, -31.5), new Vector3(45.5, 2.4, -30.5)), // north-east corner door
      ...FACTORY_STATIONS.map(s => new Box3(
        new Vector3(s.at[0] - 0.75, s.at[1] + 0.02, s.at[2] - 0.75),
        new Vector3(s.at[0] + 0.75, s.at[1] + 2.2, s.at[2] + 0.75),
      )),
      ...[0, FACTORY_LANE_OFFSET].flatMap(dx => FACTORY_COURSE_LOCAL.map(p => new Box3(
        new Vector3(p[0] + dx - 2.2, 0.12, p[2] - 2.2),
        new Vector3(p[0] + dx + 2.2, 3.2, p[2] + 2.2),
      ))),
    ];

    for (const [a, b] of FACTORY_WALK_EDGES) {
      const p = FACTORY_WALK_NODES[a], q = FACTORY_WALK_NODES[b];
      const steps = Math.ceil(Math.hypot(q[0] - p[0], q[2] - p[2]) / 0.4);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
        protectedBoxes.push(new Box3(new Vector3(x - 0.5, 0.13, z - 0.5), new Vector3(x + 0.5, 2.3, z + 0.5)));
      }
    }

    for (const solid of built.solids) {
      if (solid.rotation) continue;
      const box = new Box3().setFromCenterAndSize(new Vector3(...solid.at), new Vector3(...solid.size));
      for (const area of protectedBoxes) {
        assert.ok(!box.intersectsBox(area), `solid ${JSON.stringify(solid)} intersects protected passage`);
      }
      // Courtyard perimeter/staging solids east of x=50 sit on the surveyed factory apron
      if (solid.at[0] > 50) {
        const wx = solid.at[0] + FACTORY.origin[0], wz = solid.at[2] + FACTORY.origin[2];
        assert.ok(factoryPolygonDistance(wx, wz, FACTORY_FOOTPRINT) <= 0.1, `yard solid ${wx},${wz} outside factory apron`);
      }
    }
  } finally {
    built.geometry.dispose();
  }
});

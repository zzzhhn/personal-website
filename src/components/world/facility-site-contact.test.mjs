import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';
import { exchangeGroundSkirt, djcWalkwayOutline, djcWalkwaySupports, djcPoolInnerReturn } from './facility-site-contact.ts';
import { exchangePlatformSlabs, ALPHA_EXCHANGE_ORIGIN } from './alpha-exchange-layout.ts';
import { CLUB_WALKWAYS, CLUB_POOL } from './djc-club-layout.ts';

// Import only the small production contact builders and layout data. No full
// terrain, refined club, exchange, renderer or physics world is constructed.
const material = new MeshBasicMaterial({ side: DoubleSide });
function geometry(positions) {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return result;
}
function hit(g, from, direction, far = 5) {
  const mesh = new Mesh(g, material);
  mesh.updateMatrixWorld();
  return new Raycaster(new Vector3(...from), new Vector3(...direction).normalize(), 0, far).intersectObject(mesh)[0];
}

test('production exchange skirts close the grounded perimeter and exclude pit, bridge and galleries', () => {
  const slabs = exchangePlatformSlabs();
  const added = geometry(slabs.flatMap(slab => exchangeGroundSkirt(slab, ALPHA_EXCHANGE_ORIGIN, () => 1)));
  try {
    for (const [from, direction] of [
      [[-19, -.12, -20], [1, 0, 0]],
      [[19, -.12, -20], [-1, 0, 0]],
      [[0, -.12, -41.8], [0, 0, 1]],
    ]) {
      const contact = hit(added, from, direction, 1.1);
      assert.ok(contact && Math.abs(contact.distance - 1) < .001, `unclosed exterior at ${from}`);
    }
    assert.equal(hit(added, [0, .2, -20], [1, 0, 0], 3), undefined);
    for (const slab of slabs.filter(s => !['south-walk', 'archive-wing', 'clearing-wing', 'rear-walk'].includes(s.id))) {
      assert.deepEqual(exchangeGroundSkirt(slab, ALPHA_EXCHANGE_ORIGIN, () => 1), [], `unexpected skirt at ${slab.id}`);
    }
    assert.ok(Math.abs(added.getAttribute('position').array.reduce((min, y, i) => i % 3 === 1 ? Math.min(min, y) : min, Infinity) + .165) < 1e-6);
    // A sloping survey must reach actual ground at each local vertex, not a fixed base Y.
    const heightAt = (x, z) => 1 + (x - 60) * .001 + (z + 75) * .001;
    const varied = exchangeGroundSkirt(slabs.find(s => s.id === 'archive-wing'), ALPHA_EXCHANGE_ORIGIN, heightAt);
    for (let i = 0; i < varied.length; i += 3) if (varied[i + 1] < .16) {
      const earth = heightAt(varied[i] + 60, varied[i + 2] - 55) - 1.14;
      assert.ok(Math.abs(varied[i + 1] - earth + .025) < 1e-9);
    }
  } finally { added.dispose(); }
});

test('production DJC support triangles form eight finite short piles embedded in surveyed earth', () => {
  let count = 0;
  for (const polygon of CLUB_WALKWAYS) {
    const outline = djcWalkwayOutline(polygon);
    const { positions, posts } = djcWalkwaySupports(outline, () => 1), added = geometry(positions);
    try {
      assert.equal(posts.length, 4);
      assert.ok(positions.length < 5000 && positions.every(Number.isFinite));
      for (const { x, z, bottom, top } of posts) {
        assert.equal(bottom, .97);
        assert.ok(top > 1.2 && top < 1.46, 'pile must meet the deck underside, below its walking surface');
        assert.ok(hit(added, [x, 1.05, z], [1, 0, 0], .11), `missing actual pile triangles at ${x},${z}`);
        count++;
      }
      // The very same builder adapts its feet to a gently sloping survey.
      const heightAt = (x, z) => 1 + (x - 50) * .001 + (z - 55) * .001;
      for (const post of djcWalkwaySupports(outline, heightAt).posts) assert.ok(Math.abs(post.bottom - heightAt(post.x, post.z) + .03) < 1e-9);
    } finally { added.dispose(); }
  }
  assert.equal(count, 8);
});

test('production default pool returns close submerged coping and omit every access section', () => {
  const positions = [];
  let openSections = 0;
  for (let i = 0; i < CLUB_POOL.segments; i++) {
    const wall = djcPoolInnerReturn(i * Math.PI * 2 / CLUB_POOL.segments, (i + 1) * Math.PI * 2 / CLUB_POOL.segments);
    if (wall) positions.push(...wall.positions); else openSections++;
  }
  assert.ok(openSections > 0 && openSections < CLUB_POOL.segments / 2);
  const added = geometry(positions);
  try {
    for (const angle of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const [x, z] = CLUB_POOL.boundary(angle), dx = x - CLUB_POOL.center[0], dz = z - CLUB_POOL.center[2], length = Math.hypot(dx, dz);
      const wall = hit(added, [x - dx / length * .15, 1.14, z - dz / length * .15], [dx, 0, dz], .3);
      assert.ok(wall && wall.distance < .17, `missing mineral return at ${angle}`);
    }
    for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const [x, z] = CLUB_POOL.boundary(angle), dx = x - CLUB_POOL.center[0], dz = z - CLUB_POOL.center[2], length = Math.hypot(dx, dz);
      assert.equal(hit(added, [x - dx / length * .15, 1.14, z - dz / length * .15], [dx, 0, dz], .3), undefined, `access closed at ${angle}`);
    }
  } finally { added.dispose(); }
});

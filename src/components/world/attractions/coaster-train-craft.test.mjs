import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import { COASTER_CAR_PANELS } from './coaster-access.ts';
import { CoasterBatch } from './coaster-geometry.ts';
import { addCoasterTrainCraft } from './coaster-train-craft.ts';
import { INTENT_CRAFT, INTENT_CRAFT_ATTRIBUTE } from './intent-craft-surface.ts';

const batch = new CoasterBatch();
addCoasterTrainCraft(batch);
const geometry = batch.finish();
const material = new MeshBasicMaterial();
const car = new Mesh(geometry, material);
after(() => { geometry.dispose(); material.dispose(); });

const near = (actual, expected, context) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${context}: ${actual} vs ${expected}`);
const hits = (from, direction) =>
  new Raycaster(new Vector3(...from), new Vector3(...direction), 0, 4).intersectObject(car);
const vector = (xyz) => new Vector3(...xyz);
const position = geometry.getAttribute('position');
const triangle = new Triangle();
function at(i) {
  triangle.a.fromBufferAttribute(position, i);
  triangle.b.fromBufferAttribute(position, i + 1);
  triangle.c.fromBufferAttribute(position, i + 2);
  return triangle;
}

test('train stays in its original envelope with one draw batch and the existing material roles', () => {
  assert.ok(position.count / 3 >= 1500 && position.count / 3 <= 2500);
  assert.equal(geometry.index, null);
  assert.equal(geometry.groups.length, 0);
  assert.equal(geometry.hasAttribute('uv'), false);
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  for (let i = 0; i < position.count; i += 3) assert.ok(at(i).getArea() > 1e-8, `triangle ${i / 3}`);
  const role = geometry.getAttribute(INTENT_CRAFT_ATTRIBUTE);
  assert.ok(role.array instanceof Uint8Array);
  assert.equal(role.count, position.count);
  const { structuralCoat, galvanized, runningSteel, rubber } = INTENT_CRAFT;
  assert.deepEqual(new Set(role.array), new Set([structuralCoat, galvanized, runningSteel, rubber]));
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  // Frozen visual bounds measured from createCoasterCar at 362d8d0.
  [-1.45, -.18, -1.008].forEach((v, i) => near(min.getComponent(i), v, 'minimum'));
  [1.475, 1.475, 1.008].forEach((v, i) => near(max.getComponent(i), v, 'maximum'));
});

test('the boarding sill, central cushion and backrest still meet the contact datums', () => {
  const [floor, , seat, back] = COASTER_CAR_PANELS;
  const top = ({ at, size }) => at[1] + size[1] / 2;
  for (const x of [.6, .82, 1.05]) for (const z of [-.924, -.7, 0]) {
    near(hits([x, 1, z], [0, -1, 0])[0]?.point.y, top(floor), 'deck and sill');
  }
  for (const x of [-.35, -.17, 0, .29, .4]) for (const z of [-.27, 0, .27]) {
    near(hits([x, 1, z], [0, -1, 0])[0]?.point.y, top(seat), 'cushion patch');
  }
  for (const y of [.8, .97, 1.18, 1.33]) for (const z of [-.22, 0, .22]) {
    near(hits([.05, y, z], [-1, 0, 0])[0]?.point.x, back.at[0] + back.size[0] / 2, 'backrest patch');
  }
  for (const x of [-1, 1]) for (const z of [-.85, .85]) {
    near(hits([x, -.4, z], [0, 1, 0])[0]?.point.y, -.18, 'wheel tread');
  }
});

test('the geometry leaves the doorway and seated passenger volumes clear', () => {
  // Inset a millimetre from each contact plane so intended support is excluded.
  const volumes = [
    ['boarding side', [.60, .446, -1.20], [1.05, 1.65, .35]],
    ['seated torso and head', [-.439, .721, -.49], [.88, 1.95, .49]],
    ['shins and feet', [.56, .446, -.42], [1.11, .721, .42]],
  ];
  for (const [label, min, max] of volumes) {
    const volume = new Box3(vector(min), vector(max));
    for (let i = 0; i < position.count; i += 3) {
      assert.ok(!volume.intersectsTriangle(at(i)), `${label} intersects triangle ${i / 3}`);
    }
  }
});

test('the shoulder flares and the lower copper body tucks inward', () => {
  for (const side of [-1, 1]) {
    assert.ok(hits([.05, 1.28, side * .59], [-1, 0, 0]).length, 'shoulder wing');
    assert.equal(hits([.05, 1.445, side * .56], [-1, 0, 0]).length, 0, 'crown relief');
    const outer = (y) => Math.abs(hits([0, y, side * 1.2], [0, 0, -side])[0].point.z);
    assert.ok(outer(.382) - outer(.28) > .04, 'body folds in below its waist');
  }
});

test('rear and side samples have no coincident facing surfaces', () => {
  const probe = (from, direction) => {
    const surfaces = hits(from, direction);
    for (let i = 1; i < surfaces.length; i++) {
      assert.ok(surfaces[i].distance - surfaces[i - 1].distance > 1e-6, `overlapping faces from ${from}`);
    }
  };
  // Offset the grid from symmetry axes and shared triangle edges.
  for (let y = .66137; y < 1.46; y += .027) for (let z = -.59345; z < .6; z += .023) {
    probe([-1.6, y, z], [1, 0, 0]);
  }
  for (const side of [-1, 1]) for (let y = .58137; y < .925; y += .019) {
    for (let x = -1.37483; x < 1.15; x += .033) probe([x, y, side * 1.2], [0, 0, -side]);
  }
});

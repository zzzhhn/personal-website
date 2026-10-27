import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, Quaternion, Euler } from 'three';
import { advanceCoaster, coasterCurve, coasterDistanceAt, coasterFrame, coasterRidePose, coasterSupports, COASTER_CANOPY_BOUNDS, COASTER_INVERSION, COASTER_TUNNEL, COASTER_GATE_Z, coasterControlU, coasterWorld, COASTER_DURATION, COASTER_EXIT, COASTER_LENGTH } from '../coaster-track.ts';
import { attractionRide, beginAttractionRide, endAttractionRide, updateAttractionRide } from '../attraction-ride.ts';
import { createCoasterCar, createCoasterStructure } from '../coaster-geometry.ts';
import { INTENT_COASTER } from '../attraction-layout.ts';
import { INTENT_STATIONS, INTENT_TARGETS, intentInReach } from '../intent-stations.ts';

test('the continuous closed track fits its surveyed site and stays above ground', () => {
  assert.ok(COASTER_LENGTH > 940 && COASTER_LENGTH < 1000);
  assert.ok(coasterCurve.getPointAt(0).distanceTo(coasterCurve.getPointAt(1)) < 1e-8);
  assert.ok(coasterCurve.getTangentAt(0).dot(coasterCurve.getTangentAt(1)) > .999);
  let high = 0;
  for (let i = 0; i <= 1200; i++) {
    const f = coasterFrame(i / 1200), p = f.point;
    assert.ok([...p, ...f.rotation].every(Number.isFinite));
    assert.ok(p.x > INTENT_COASTER.bounds.minX + 2 && p.x < INTENT_COASTER.bounds.maxX - 2);
    assert.ok(p.z > INTENT_COASTER.bounds.minZ + 2 && p.z < INTENT_COASTER.bounds.maxZ - 2);
    assert.ok(p.y > 1.55); high = Math.max(high, p.y);
    assert.ok(Math.abs(f.rotation.length() - 1) < 1e-8);
    const orientationForward = new Vector3(1, 0, 0).applyQuaternion(f.rotation);
    assert.ok(orientationForward.dot(f.forward) > .99999);
  }
  assert.ok(high > 55 && high < 57);
});

test('merged static structure and three cars stay below the authored geometry budget', () => {
  for (const detailed of [false, true]) {
    const g = createCoasterStructure(detailed), car = createCoasterCar();
    const all = [g.steel, g.glow, car];
    // Frozen post-tower totals plus the authorized 20,000-triangle terrain increment.
    const budget = (detailed ? 94352 : 47296) + 20000;
    assert.ok((g.steel.getAttribute('position').count + g.glow.getAttribute('position').count + car.getAttribute('position').count * 3) / 3 <= budget);
    for (const geometry of all) {
      assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
      assert.equal(geometry.groups.length, 0); geometry.dispose();
    }
  }
});

test('nonadjacent rails clear the train and seated head envelope at all crossings', () => {
  const frames = Array.from({ length: 600 }, (_, i) => coasterFrame(i / 600));
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    if (Math.min(j - i, frames.length - (j - i)) / frames.length * COASTER_LENGTH < 12) continue;
    const a = frames[i], b = frames[j];
    assert.ok(a.point.distanceTo(b.point) > 4, `Rail proximity at ${i}, ${j}`);
    const headA = a.point.clone().addScaledVector(a.up, 2.25), headB = b.point.clone().addScaledVector(b.up, 2.25);
    assert.ok(headA.distanceTo(b.point) > 1.5 && headB.distanceTo(a.point) > 1.5, `Head clearance at ${i}, ${j}`);
  }
});

function segmentHitsBox(a, b, min, max) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 3; k++) {
    const delta = b[k] - a[k];
    if (Math.abs(delta) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return false; }
    else {
      let from = (min[k] - a[k]) / delta, to = (max[k] - a[k]) / delta;
      if (from > to) [from, to] = [to, from];
      lo = Math.max(lo, from); hi = Math.min(hi, to); if (lo > hi) return false;
    }
  }
  return true;
}
test('the station canopy never intersects any camera sight line during the complete ride', () => {
  for (let t = 0; t <= COASTER_DURATION; t += .1) for (const mode of ['chase', 'first-person', 'comfort']) {
    const pose = coasterRidePose(coasterDistanceAt(t), mode);
    assert.equal(segmentHitsBox(pose.cameraPosition, pose.cameraTarget, COASTER_CANOPY_BOUNDS.min, COASTER_CANOPY_BOUNDS.max), false, `${mode} at ${t}`);
  }
});


test('static night fill exists on every merged surface with finite nonnegative radiance', () => {
  const g = createCoasterStructure(true);
  for (const geometry of [g.steel, g.glow]) {
    const fill = geometry.getAttribute('nightRadiance');
    assert.equal(fill.count, geometry.getAttribute('position').count);
    assert.ok(fill.array.every(n => Number.isFinite(n) && n >= 0));
    assert.ok(fill.array.some(n => n > .3)); geometry.dispose();
  }
});

test('third-person cameras keep rider and forward sight clear through the entire actual structure', () => {
  const geometry = createCoasterStructure(true), material = new MeshBasicMaterial({ side: DoubleSide });
  const objects = [new Mesh(geometry.steel, material), new Mesh(geometry.glow, material)], ray = new Raycaster();
  objects.forEach(mesh => mesh.updateMatrixWorld());
  try {
    for (const mode of ['chase', 'comfort']) for (let sample = 0; sample < 1600; sample++) {
      const u = sample / 1600, t = `u=${u}`, pose = coasterRidePose(u, mode), frame = coasterFrame(u);
      const camera = new Vector3(...pose.cameraPosition), head = frame.point.clone().addScaledVector(frame.up, 2.2);
      assert.ok(camera.distanceTo(head) > 2.5, `${mode} remains third person at ${t}`);
      for (const target of [head, new Vector3(...pose.cameraTarget)]) {
        const direction = target.clone().sub(camera);
        ray.set(camera, direction.clone().normalize()); ray.near = .05; ray.far = direction.length();
        assert.equal(ray.intersectObjects(objects, false).length, 0, `${mode} obstructed at ${t}`);
      }
    }
    // Looking at a distant rail around a bend is expected; the eye and its near field must be clear.
    for (let sample = 0; sample < 1600; sample++) {
      const t = `u=${sample / 1600}`, pose = coasterRidePose(sample / 1600, 'first-person'), camera = new Vector3(...pose.cameraPosition);
      ray.set(camera, new Vector3(...pose.cameraTarget).sub(camera).normalize()); ray.near = .05; ray.far = 2;
      assert.equal(ray.intersectObjects(objects, false).length, 0, `first-person near field obstructed at ${t}`);
    }
  } finally { geometry.steel.dispose(); geometry.glow.dispose(); material.dispose(); }
});

test('architecture collision volumes clear a one-metre rider envelope throughout the loop', () => {
  const g = createCoasterStructure(true);
  try {
    for (let i = 0; i < 1200; i++) {
      const f = coasterFrame(i / 1200), head = f.point.clone().addScaledVector(f.up, 1.4);
      for (const c of g.colliders) {
        if (c.surface) continue;
        const delta = head.clone().sub(new Vector3(...c.position)).applyQuaternion(new Quaternion().setFromEuler(new Euler(...(c.rotation ?? [0,0,0]))).invert());
        assert.ok(Math.abs(delta.x) >= c.half[0] + 1 || Math.abs(delta.y) >= c.half[1] + 1 || Math.abs(delta.z) >= c.half[2] + 1, `collider ${c.position} at ${i / 1200}`);
      }
    }
  } finally { g.steel.dispose(); g.glow.dispose(); }
});

test('candidate preserves two merged static draws within the frozen baseline plus tower allowance', () => {
  for (const detailed of [false, true]) {
    const g = createCoasterStructure(detailed);
    try {

      const triangles = (g.steel.attributes.position.count + g.glow.attributes.position.count) / 3;
      // Static-only baseline excludes the unchanged 756 triangles of the three cars.
      assert.ok(triangles <= (detailed ? 93596 : 46540) + 20000, `${triangles} exceeds terrain sample budget`);
      assert.equal(g.steel.groups.length, 0); assert.equal(g.glow.groups.length, 0);
      for (const geometry of [g.steel,g.glow]) {
        geometry.computeBoundingBox();
        assert.ok(geometry.boundingBox.min.x >= INTENT_COASTER.bounds.minX);
        assert.ok(geometry.boundingBox.max.x <= INTENT_COASTER.bounds.maxX);
        assert.ok(geometry.boundingBox.min.z >= INTENT_COASTER.bounds.minZ);
        assert.ok(geometry.boundingBox.max.z <= INTENT_COASTER.bounds.maxZ);
      }
    } finally { g.steel.dispose(); g.glow.dispose(); }
  }
});

test('cyan technical lighting has substantial visible surface rather than isolated hairline marks', async () => {
  const candidate=createCoasterStructure(true);
  const cyanArea = g => {
    const p=g.attributes.position,c=g.attributes.color;let area=0;
    for(let i=0;i<p.count;i+=3){
      if(c.getY(i)<c.getX(i)*1.3 || c.getZ(i)<c.getX(i)*1.3)continue;
      const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),d=new Vector3().fromBufferAttribute(p,i+2);
      area+=b.sub(a).cross(d.sub(a)).length()*.5;
    }
    return area;
  };
  try { assert.ok(cyanArea(candidate.glow)>300); assert.ok(cyanArea(candidate.glow)>137.13*4); }
  finally { for(const g of [candidate.steel,candidate.glow])g.dispose(); }
});

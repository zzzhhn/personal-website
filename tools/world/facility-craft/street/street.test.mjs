import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import * as React from 'react';
import { Matrix4, Quaternion, Ray, Vector3 } from 'three';
import { families, loadWorldModule } from './runtime.mjs';
import { compareContact, meshFromBatch, mountStreetContacts } from './contact-fixture.mjs';

const A = loadWorldModule(), legacyAssets = loadWorldModule('WorldStreetAssets.ts', '?facilityCraft=legacy');
const current = families(A), legacy = families(legacyAssets);
const source = id => JSON.parse(readFileSync(new URL('./source/'+id+'.json',import.meta.url),'utf8'));
const contracts=source('placement-contracts');
const archived=Object.fromEntries(Object.keys(current).map(id=>{
  const timber=id==='timberPost'||id==='timberBeam';
  const family=source((timber?'timberRail':id)+'.source');
  assert.equal(family.base,contracts.base);
  return [id,['L0','L1'].map(level=>family.baseline[level].find(node=>node.name===(id==='timberPost'?'timberPost.start':id)))];
}));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const visual = b => [...[b.pos,b.nrm,b.col,b.mat,b.suv].map(values=>Array.from(values,Math.fround)),b.idx,b.parts,b.cell];
const proxies = b => b.hulls().map(a => Array.from(a));

test('all eight facility families keep their archived builder proxies and legacy geometry', () => {
  for (const id of Object.keys(current)) for (const level of [0, 1]) {
    const reference=archived[id][level];
    const channels=(...arrays)=>arrays.map(values=>Array.from(values,Math.fround));
    const expected=digest([...channels(reference.position,reference.normal,reference.color,reference.aMat,reference.aSuv),reference.index,reference.parts]);
    const comparable=b=>digest([...channels(b.pos,b.nrm,b.col,b.mat,b.suv),b.idx,b.parts.map(p=>({...p,end:p.end<0?b.pos.length/3:p.end}))]);
    assert.equal(digest(proxies(current[id][level])),reference.baselineHullSHA256,id+' collider');
    assert.equal(comparable(legacy[id][level]),expected,id+' legacy visual');
    if(level===1) assert.equal(comparable(current[id][level]),expected,id+' distant visual');
    else assert.notEqual(comparable(current[id][level]),expected,id+' close craft');
  }
});

test('candidate attributes, triangle winding and geometric normals are valid', () => {
  for (const [id, pair] of Object.entries(current)) for (const B of pair) {
    const count = B.pos.length / 3;
    assert.equal(B.nrm.length, count * 3); assert.equal(B.col.length, count * 3);
    assert.equal(B.mat.length, count * 4); assert.equal(B.suv.length, count * 2);
    for (const a of [B.pos, B.nrm, B.col, B.mat, B.suv]) assert.ok(a.every(Number.isFinite), `${id} finite`);
    assert.ok(B.idx.every(i => Number.isInteger(i) && i >= 0 && i < count));
    for (let i = 0; i < B.idx.length; i += 3) {
      const [a, b, c] = B.idx.slice(i, i + 3).map(v => B.pos.slice(v * 3, v * 3 + 3));
      const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      assert.ok(Math.hypot(...cross) > 1e-10, `${id} degenerate face`);
      const normalSum = [0, 1, 2].map(axis => B.idx.slice(i, i + 3).reduce((sum, vertex) => sum + B.nrm[vertex * 3 + axis], 0));
      assert.ok(cross.reduce((sum, x, axis) => sum + x * normalSum[axis], 0) > 0, `${id} winding disagrees with shading normals`);
    }
    for (let i = 0; i < B.nrm.length; i += 3) assert.ok(Math.abs(Math.hypot(...B.nrm.slice(i, i + 3)) - 1) < 1e-8, `${id} unit normal`);
  }
});

test('seat datums, atlas faces, lighting codes and untouched lamp variants keep their interfaces', () => {
  for (const key of ['BENCH_SEAT_LOCAL', 'SHELTER_SEAT_LOCAL', 'LAMP_HEAD_LOCAL']) assert.equal(digest(A[key]), digest(contracts.anchors[key]), key);
  const poster = b => {
    const data = [];
    for (let i = 0; i < b.pos.length / 3; i++) if (b.mat[i * 4 + 3] === 1) data.push(...b.pos.slice(i * 3, i * 3 + 3), ...b.mat.slice(i * 4, i * 4 + 4), ...b.suv.slice(i * 2, i * 2 + 2));
    return data;
  };
  assert.equal(digest(poster(current.shelter[0])), digest(poster({pos:archived.shelter[0].position,mat:archived.shelter[0].aMat,suv:archived.shelter[0].aSuv})));
  for (const [id, expected] of [['lamp', [1, 2]], ['signal', [3, 4, 5]], ['shelter', [2, 7]], ['roadblock', [6]]]) {
    const codes = new Set(current[id][0].mat.filter((_, i) => i % 4 === 2));
    expected.forEach(code => assert.ok(codes.has(code), `${id} glow ${code}`));
  }
  for (const height of [2.3, 2.6]) {
    const opts = { height, arm: 0, cyanRing: false };
    assert.equal(digest(visual(A.lampGeometry(opts))), contracts.postLamps[height], 'year/park shared post-top lamps untouched');
  }
});

function checkContact(visual, colliders, origin, direction, length, tolerance, label) {
  const contact = compareContact(visual, colliders, origin, direction, length);
  assert.ok(contact.visual !== null && contact.physical !== null && Math.abs(contact.visual - contact.physical) < tolerance,
    `${label} ${JSON.stringify(contact)}`);
  return contact;
}

test('six G11 placements register separate footings and date frames against both drawn LODs', t => {
  const { BUILDINGS_V4, ROAD_Y } = loadWorldModule('layout-v4-flag.ts');
  const items = Array.from(BUILDINGS_V4, (building, i) => ({ id: `year-${building.id}`, kind: 'year', yaw: Math.PI / 2,
    position: [building.position[0] + building.size[0] / 2 + 5, ROAD_Y + .01, building.position[2]], road: 'avenue', cell: [i / 8, 0, 1 / 8, .5] }));
  const host = mountStreetContacts('year', items);
  t.after(host.dispose);
  assert.equal(host.bodies.length, 6);
  let maxNeckGap = 0;
  for (const [i, item] of items.entries()) {
    const { body, colliders } = host.bodies[i];
    assert.equal(body.mass(), 42);
    assert.ok(body.isSleeping());
    assert.deepEqual(colliders.map(({ name }) => name.slice(name.indexOf('/') + 1)), ['footing', 'base', 'shaft', 'cap', 'head', 'date-frame']);
    for (const [level, distance] of [[0, 10], [1, 50]]) {
      const [x, y, z] = item.position;
      host.frame([x + distance, y, z]);
      assert.equal(host.mesh.getGeometryIdAt(i), 2 * i + level);
      const visual = meshFromBatch(host.mesh, i);
      t.after(() => { visual.geometry.dispose(); visual.material.dispose(); });
      const neck = checkContact(visual, colliders, [.75, .54, 0], [-1, 0, 0], 1, .003, `${item.id} neck L${level}`);
      assert.ok(neck.physical > .63, 'the visible neck has open space beyond its silhouette');
      maxNeckGap = Math.max(maxNeckGap, Math.abs(neck.visual - neck.physical));
      checkContact(visual, colliders, [0, .03, .75], [0, 0, -1], 1, .02, `${item.id} footing L${level}`);
      checkContact(visual, colliders, [0, 1.585, .75], [0, 0, -1], 1, .011, `${item.id} placard L${level}`);
    }
  }
  t.diagnostic(`Largest physical-to-visual G11 neck difference ${maxNeckGap.toFixed(6)} m`);
});

test('varying rail lengths retain their roots and baseline physics; static trimeshes use the proxy', () => {
  for (const len of [.8, 2, 4.2, 7.35]) for (const name of ['timberBeam', 'seawallBay']) {
    assert.equal(digest(proxies(A[name](0, len))), contracts.railHulls[name][len], `${name} ${len} m`);
  }
  const releases=[];
  const [staticComponent,C] = loadWorldModule(['WorldStreetStatic.tsx','WorldStreetFacilityCraft.ts'],'',false,{
    react:{...React,useMemo:f=>f(),useEffect:f=>releases.push(f())},
    '@react-three/fiber':{useFrame(){}},
  });
  const original = legacyAssets.benchGeometry(0), crafted = C.finishStreetFacility(original,'bench',0);
  const matrix=new Matrix4().makeRotationY(.71).setPosition(4,2,-6);
  try {
    const mounted=staticComponent.default({name:'bench-proof',claims:[],assetId:'bench',
      kinds:[{id:'bench',L0:crafted,L1:legacyAssets.benchGeometry(1),lodNear:10,far:30,collide:'trimesh'}],
      placements:[{kind:'bench',matrix}]});
    const body=mounted.props.children.find(child=>child?.props?.name==='bench-proof-solid');
    const [points,indices]=body.props.children[0].props.args;
    assert.deepEqual(Array.from(indices),Array.from(original.idx));
    const local=Float32Array.from(original.pos),p=new Vector3();
    for(let i=0;i<points.length;i+=3){
      p.fromArray(local,i).applyMatrix4(matrix);
      for(let axis=0;axis<3;axis++)assert.equal(points[i+axis],Math.fround(p.getComponent(axis)));
    }
  } finally {releases.forEach(dispose=>dispose?.());}
});

function insidePart(builder, name, point) {
  const part = builder.parts.find(part => part.name === name);
  assert.ok(part, name);
  const end = part.end < 0 ? builder.pos.length / 3 : part.end;
  const ray = new Ray(new Vector3(...point), new Vector3(1, .001, .002).normalize());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3(), hits = [];
  for (let i = 0; i < builder.idx.length; i += 3) {
    const [j, k, l] = builder.idx.slice(i, i + 3);
    if ([j, k, l].some(index => index < part.start || index >= end)) continue;
    if (ray.intersectTriangle(a.fromArray(builder.pos, j * 3), b.fromArray(builder.pos, k * 3), c.fromArray(builder.pos, l * 3), false, hit)) {
      const distance = hit.distanceTo(ray.origin);
      if (!hits.some(previous => Math.abs(previous - distance) < 1e-6)) hits.push(distance);
    }
  }
  return hits.length % 2 === 1;
}

test('all four G12 splayed legs overlap the real shoes and upper hinge in the built source', () => {
  const source = current.roadblock[0];
  for (const x of [-.56, .56]) for (const side of [-1, 1]) {
    const leg = `frame.splayed-legs-${x}`;
    for (const [joint, point] of [['shoes', [x, .031, side * .2943]], ['hinge', [x, .93, side * .042]]]) {
      assert.ok(insidePart(source, leg, point) && insidePart(source, `frame.${joint}-${x}`, point), `leg at ${x}/${side} meets ${joint}`);
    }
  }
});

test('G12 scene mounts 28 kg roadblocks with independent feet, open air and true panel contact', t => {
  const host = mountStreetContacts('roadblock');
  t.after(host.dispose);
  assert.equal(host.bodies.length, 4);
  const verifyInventory = () => {
    const traced = host.inventory();
    assert.deepEqual(Array.from(traced.errors), []);
    assert.equal(traced.registrations['street-roadblock-group'], 168);
  };
  verifyInventory();
  const source = host.mesh.userData.worldCollisionBatchedInstances;
  assert.deepEqual(Array.from(source.placements, placement => placement.id), ['roadblock-0', 'roadblock-1', 'roadblock-2', 'roadblock-3']);
  assert.equal(source.geometries[0].ranges.reduce((sum, range) => sum + range.indexCount, 0), 5040);
  assert.equal(source.geometries[1].ranges.reduce((sum, range) => sum + range.indexCount, 0), 576);
  assert.equal(source.geometries[1].ranges.find(range => range.id === 'leg--0.56/-1').surfaceIds.length, 3);
  const names = new Set();
  let worstPanelGap = 0;
  for (const [i, { id, body, colliders }] of host.bodies.entries()) {
    assert.ok(Math.abs(body.mass() - 28) < .001 && Math.abs(body.localCom().y - .35) < .001 && body.isSleeping());
    const visual = meshFromBatch(host.mesh, i);
    t.after(() => { visual.geometry.dispose(); visual.material.dispose(); });
    for (const { name } of colliders) {
      assert.ok(name.startsWith(`street-collider-${id}/`) && !names.has(name));
      names.add(name);
    }
    for (const x of [-.56, .56]) for (const side of [-1, 1]) {
      checkContact(visual, colliders, [x, -.15, side * .3], [0, 1, 0], .3, .001, `${id} foot`);
      checkContact(visual, colliders, [x + Math.sign(x) * .06, -.15, side * .355], [0, 1, 0], .3, .001, `${id} shoe toe`);
    }
    for (const [origin, direction, length] of [[[0, -.15, 0], [0, 1, 0], .3], [[.9, .025, 0], [-1, 0, 0], .4],
      [[0, .615, 1], [0, 0, -1], 2]]) {
      assert.deepEqual(compareContact(visual, colliders, origin, direction, length), { visual: null, physical: null }, `${id} open space`);
    }
    for (const side of [-1, 1]) {
      const panel = checkContact(visual, colliders, [0, .77, side], [0, 0, -side], 1, .003, `${id} panel`);
      worstPanelGap = Math.max(worstPanelGap, Math.abs(panel.visual - panel.physical));
    }
  }
  t.diagnostic(`Largest physical-to-visual G12 panel difference ${worstPanelGap.toFixed(6)} m`);

  const { body, colliders } = host.bodies[0], home = body.translation();
  const probe = host.world.createRigidBody(R.RigidBodyDesc.dynamic().setCcdEnabled(true)
    .setTranslation(home.x, home.y + .77, home.z + 1.3).setLinvel(0, 0, -4));
  const bumper = host.world.createCollider(R.ColliderDesc.ball(.23).setMass(65), probe);
  let touched = false;
  for (let step = 0; step < 25; step++) {
    host.world.step();
    for (const { collider } of colliders) host.world.contactPair(bumper, collider, manifold => { touched ||= manifold.numSolverContacts() > 0; });
  }
  const moved = body.translation(), turn = body.rotation();
  assert.ok(touched && !body.isSleeping() && Math.hypot(moved.x - home.x, moved.z - home.z) > .05);
  const expected = new Matrix4().compose(new Vector3(moved.x, moved.y, moved.z), new Quaternion(turn.x, turn.y, turn.z, turn.w), new Vector3(1, 1, 1));
  for (const [level, distance] of [[0, 5], [1, 40]]) {
    host.frame([moved.x + distance, moved.y, moved.z]);
    assert.equal(host.mesh.getGeometryIdAt(0), level);
    verifyInventory();
    const rendered = new Matrix4(); host.mesh.getMatrixAt(0, rendered);
    assert.ok(rendered.elements.every((v, k) => Math.abs(v - expected.elements[k]) < .00001));
  }
  assert.equal(host.state()[0].phase, 'knocked');
  host.world.removeRigidBody(probe);
  const camera = [home.x + 6, home.y + 4, home.z];
  for (let i = 0; i < 29 * 60; i++) host.frame(camera);
  assert.equal(host.state()[0].phase, 'knocked');
  for (let i = 0; i < 160; i++) host.frame(camera);
  assert.equal(host.state()[0].phase, 'home');
  assert.deepEqual({ ...body.translation() }, { ...home });
  assert.ok(body.isSleeping());
  host.frame([home.x + 150, home.y, home.z]);
  assert.equal(host.mesh.getVisibleAt(0), false);
  verifyInventory();
});

test('G12 comparison render modes also use their own open framework', t => {
  for (const search of ['?streetRework=baseline', '?facilityCraft=legacy']) {
    const host = mountStreetContacts('roadblock', undefined, search);
    t.after(host.dispose);
    const { colliders } = host.bodies[0], visual = meshFromBatch(host.mesh, 0);
    t.after(() => { visual.geometry.dispose(); visual.material.dispose(); });
    assert.ok(colliders.length > 4 && colliders.every(({ name }) => name.startsWith('street-collider-roadblock-0/')));
    assert.deepEqual(Array.from(host.inventory().errors), []);
    assert.equal(host.inventory().registrations['street-roadblock-group'], colliders.length * 4);
    assert.deepEqual(compareContact(visual, colliders, [0, -.15, 0], [0, 1, 0], .3), { visual: null, physical: null }, search);
    checkContact(visual, colliders, [.56, -.15, .3], [0, 1, 0], .3, .001, `${search} foot`);
  }
});

test('main-street lamps, signal posts and bins preserve contact and clearance at their placed headings', t => {
  const { knockablesV4 } = loadWorldModule('layout-v4.ts');
  const { PLAYER_RADIUS, PLAYER_HALF_HEIGHT, PLAYER_CENTER_HEIGHT } = loadWorldModule('actor-physics.ts');
  const cases = {
    lamp: { mass: 140, com: .55, pass: .52, block: .36, heights: [.035, .48, .64, 1.5] },
    signal: { mass: 180, com: .6, pass: .53, block: .37, heights: [.035, .5, 1.55] },
    bin: { mass: 16, com: .3, pass: .66, block: .56, heights: [.015, .50, .81, .94] },
  };
  const items = Array.from(knockablesV4()).filter(item => Object.hasOwn(cases, item.kind));
  const host = mountStreetContacts('knock', items);
  t.after(host.dispose);
  assert.equal(items.length, 36);
  const capsule = new R.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS), cabin = new R.Cuboid(.90, 1.60, .45);
  const worst = {};
  for (const [i, item] of items.entries()) {
    const { body, colliders } = host.bodies[i], config = cases[item.kind];
    assert.ok(body.isSleeping() && Math.abs(body.mass() - config.mass) < .001 && Math.abs(body.localCom().y - config.com) < .001);
    assert.equal(host.state()[i].lockedForPeople, item.kind !== 'bin');
    const visual = meshFromBatch(host.mesh, i);
    // Offset the rays from the lathe seam after applying the authored heading.
    const probes = config.heights.map(y => checkContact(visual, colliders, [1, y, .002], [-1, 0, 0], 1.1, .012, `${item.id} y=${y}`));
    if (item.kind === 'signal') probes.push(checkContact(visual, colliders, [-1, 2.15, .002], [1, 0, 0], 1.1, .016, `${item.id} low signal head`));
    worst[item.kind] = Math.max(worst[item.kind] ?? 0, ...probes.map(contact => Math.abs(contact.physical - contact.visual)));

    const handles = new Set(colliders.map(member => member.collider.handle));
    const axis = new Vector3(0, 1, 0), rotation = new Quaternion().setFromAxisAngle(axis, item.yaw);
    function sweep(origin, movement, shape) {
      return host.world.castShape(new Vector3(...origin).applyMatrix4(visual.matrixWorld), rotation,
        new Vector3(...movement).applyQuaternion(rotation), shape, .002, 1, true,
        undefined, undefined, undefined, undefined, collider => handles.has(collider.handle));
    }
    assert.equal(sweep([config.pass, PLAYER_CENTER_HEIGHT, -1.4], [0, 0, 2.8], capsule), null, `${item.id} capsule side passage`);
    assert.ok(sweep([config.block, PLAYER_CENTER_HEIGHT, -1.4], [0, 0, 2.8], capsule), `${item.id} capsule meets the visible body`);
    if (item.kind === 'signal' || item.kind === 'lamp') {
      assert.equal(sweep([0, 1.6, -3.8], [0, 0, 2.5], cabin), null, `${item.id} 3.2 m vehicle envelope under the arm`);
    }
    visual.geometry.dispose(); visual.material.dispose();
  }
  t.diagnostic(`Largest reachable physical/visual differences by asset ${JSON.stringify(worst)}`);
});

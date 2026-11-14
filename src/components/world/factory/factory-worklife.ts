import { Bone, Float32BufferAttribute, Group, Mesh, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import type { FactoryLamp, FactorySolid } from './factory-geometry.ts';
import { bakeFactoryLight, createFactoryMaterial } from './factory-lighting.ts';

type Palette = Record<'cream'|'teal'|'steel'|'silver'|'dark'|'amber', Surf>;
export const FACTORY_WORKLIFE_STATIONS = [
  { id: 'preparation', at: [-14, .12, 21.5] as V3 },
  { id: 'maintenance', at: [-39, .12, 7] as V3 },
] as const;
const navy: Surf = { color: '#2c455a', rough: .82, metal: 0 };
const visor: Surf = { color: '#233b47', rough: .42, metal: .08 };
const ease = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

/** Factory-local, two fixed workstations. Elapsed is monotonic seconds. Only
 * active/unpaused deltas advance the bounded demonstration loops; no walking,
 * production events, batch IDs or physics bodies are generated. Parent this
 * root once under the existing FACTORY.origin group and append its solids.
 * Material, geometry and skeleton are owned here, including detached meshes. */
export function buildFactoryWorklife(palette: Palette, options: {
  lamps?: readonly FactoryLamp[]; nightUniform?: { value: number };
} = {}) {
  const P = palette, fixed = new Builder(), moving = new Builder(), root = new Group(), solids: FactorySolid[] = [];
  root.name = 'factory-worklife'; root.visible = false;
  const gloves: Surf = { color: P.amber.color, rough: .9, metal: 0 };
  const skins: number[] = [], weights: number[] = [];
  const point = (origin: V3, at: V3): V3 => at.map((v, i) => v + origin[i]) as V3;
  const box = (origin: V3, at: V3, size: V3, s: Surf, bevel = 0) => cbox(fixed, point(origin, at), size, s, bevel);
  const solid = (origin: V3, at: V3, size: V3) => solids.push({ at: point(origin, at), size: [...size] });
  const mark = (bone: number, add: () => void) => {
    const first = moving.pos.length / 3; add();
    for (let i = first; i < moving.pos.length / 3; i++) { skins.push(bone, 0, 0, 0); weights.push(1, 0, 0, 0); }
  };
  const armAnchors = FACTORY_WORKLIFE_STATIONS.map(s => point(s.at, [.18, .9, .12]));
  const prepAnchor = new Vector3(...armAnchors[0]);
  const grip = new Vector3(0, -.075, .275), pickup = new Vector3(), scratch = new Vector3();
  const rotation = new Quaternion(), axisY = new Vector3(0, 1, 0), axisX = new Vector3(1, 0, 0), pitch = new Quaternion();
  pickup.copy(grip).applyAxisAngle(axisY, -.62).add(prepAnchor);

  FACTORY_WORKLIFE_STATIONS.forEach((station, index) => {
    const o = station.at;
    // An accessible-height table, a side rack and one under-table remnants bin.
    for (const x of [-.34, .7]) for (const z of [.33, .97]) {
      box(o, [x, .37, z], [.075, .62, .075], P.teal, .008);
      box(o, [x, .04, z], [.16, .08, .15], P.steel);
    }
    for (const z of [.33, .97]) box(o, [.18, .68, z], [1.18, .08, .08], P.steel);
    box(o, [.18, .76, .66], [1.25, .08, .88], P.silver, .012);
    solid(o, [.18, .4, .66], [1.25, .8, .88]);
    for (const x of [-1.45, -.85]) for (const z of [.25, 1]) box(o, [x, .58, z], [.055, 1.16, .055], P.teal);
    for (const y of [.16, .66, 1.16]) box(o, [-1.15, y, .625], [.7, .06, .85], P.steel, .008);
    solid(o, [-1.15, .58, .625], [.7, 1.16, .85]);
    for (let i = 0; i < 3; i++) {
      const x = -1.36 + i * .21;
      box(o, [x, .25, .55], [.12, .12, .42], index ? P.cream : P.silver, .008);
      box(o, [x, .78, .66], [.13, .18, .25], P.teal, .01);
    }
    box(o, [.18, .19, .65], [.57, .07, .43], P.dark);
    for (const x of [-.1, .46]) box(o, [x, .29, .65], [.025, .2, .43], P.cream);
    for (const z of [.45, .85]) box(o, [.18, .29, z], [.54, .2, .025], P.cream);
    for (let i = 0; i < 3; i++) box(o, [.03 + .14 * i, .25 + .018 * i, .65], [.20, .025, .12], P.silver);

    // PPE and planted stance. Stationary upper arms meet the driven elbow.
    for (const side of [-1, 1]) {
      box(o, [side * .11, .09, .035], [.18, .18, .31], P.dark, .025);
      box(o, [side * .11, .38, 0], [.16, .46, .18], navy, .018);
    }
    box(o, [0, .65, 0], [.4, .14, .27], navy, .02);
    box(o, [0, .935, 0], [.43, .45, .29], navy, .025);
    box(o, [0, .745, .155], [.42, .045, .025], gloves);
    bar(fixed, point(o, [.21, 1.1, 0]), point(o, [.18, .9, .12]), .065, P.cream, 6);
    bar(fixed, point(o, [-.21, 1.1, 0]), point(o, [-.22, .88, .19]), .065, P.cream, 6);
    box(o, [-.22, .88, .23], [.10, .10, .14], gloves, .01);
    fixed.tr(o, [0, 0, 0], () => {
      lathe(fixed, [[0, 1.16], [.14, 1.18], [.215, 1.25], [.22, 1.36], [.18, 1.49], [.1, 1.55], [0, 1.57]], P.cream, { sides: 10 });
      lathe(fixed, [[0, 1.18], [.25, 1.18], [.25, 1.215], [0, 1.215]], P.cream, { sides: 10 });
    });
    box(o, [0, 1.34, .18], [.30, .15, .07], visor, .025);
    for (const side of [-1, 1]) bar(fixed, point(o, [side * .20, 1.33, 0]), point(o, [side * .265, 1.33, 0]), .065, gloves, 8);
    solid(o, [0, .79, 0], [.55, 1.58, .43]);
    mark(index + 1, () => {
      const at = armAnchors[index];
      moving.tr(at, [0, 0, 0], () => {
        cbox(moving, [0, 0, .12], [.10, .10, .24], P.cream, .012);
        cbox(moving, [0, 0, .275], [.115, .105, .10], gloves, .012);
        if (index) {
          bar(moving, [0, 0, .32], [0, .085, .32], .01, P.silver, 6);
          moving.tr([0, .105, .32], [Math.PI / 2, 0, 0], () => lathe(moving,
            [[.017, -.008], [.032, -.008], [.032, .008], [.017, .008], [.017, -.008]], P.silver, { sides: 8, caps: false }));
        }
      });
    });
  });
  const prep = FACTORY_WORKLIFE_STATIONS[0].at, repair = FACTORY_WORKLIFE_STATIONS[1].at;
  for (const side of [-1, 1]) {
    const x = .18 + side * Math.sin(.62) * .275, z = .12 + Math.cos(.62) * .275;
    for (const dx of [-.115, .115]) box(prep, [x + dx, .815, z], [.016, .03, .216], P.teal);
    for (const dz of [-.108, .108]) box(prep, [x, .815, z + dz], [.214, .03, .016], P.teal);
  }
  for (const x of [-.07, .43]) box(repair, [x, .805, .8], [.1, .01, .35], P.steel);
  box(repair, [.18, 1.01, .8], [.66, .4, .4], P.teal, .025);
  for (const x of [-.11, .47]) box(repair, [x, 1.01, .59], [.08, .4, .06], P.cream);
  for (const y of [.84, 1.18]) box(repair, [.18, y, .59], [.5, .06, .06], P.cream);
  box(repair, [.18, 1.01, .62], [.50, .28, .02], P.steel);
  bar(fixed, point(repair, [.18, 1.005, .42]), point(repair, [.18, 1.005, .635]), .012, P.silver, 8);
  fixed.tr(point(repair, [.18, 1.005, .44]), [Math.PI / 2, 0, 0], () => lathe(fixed,
    [[0, -.01], [.015, -.01], [.015, .01], [0, .01]], P.silver, { sides: 6, faceted: true }));
  mark(3, () => moving.tr([pickup.x, pickup.y, pickup.z], [0, 0, 0], () => {
    // One finite U-shaped cleat, never a duplicated or newly produced part.
    for (const x of [-.065, .065]) cbox(moving, [x, 0, -.015], [.03, .045, .07], P.silver, .004);
    cbox(moving, [0, 0, .035], [.16, .045, .03], P.silver, .004);
  }));

  const fixedGeometry = bakeFactoryLight(fixed.build(), options.lamps ?? []);
  const movingGeometry = bakeFactoryLight(moving.build(), options.lamps ?? []);
  movingGeometry.setAttribute('skinIndex', new Uint16BufferAttribute(skins, 4));
  movingGeometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  movingGeometry.boundingSphere!.radius += .65;
  const material = createFactoryMaterial(true, options.nightUniform ?? { value: 0 });
  const structure = new Mesh(fixedGeometry, material), mechanism = new SkinnedMesh(movingGeometry, material);
  structure.name = 'worklife-benches-workers-and-racks'; mechanism.name = 'worklife-working-arms-and-cleat';
  structure.castShadow = true; mechanism.castShadow = false;
  structure.receiveShadow = mechanism.receiveShadow = true;
  mechanism.boundingSphere = movingGeometry.boundingSphere!.clone();
  const rig = new Bone(), sortingArm = new Bone(), serviceArm = new Bone(), cleat = new Bone();
  sortingArm.name = 'preparation-forearm'; serviceArm.name = 'maintenance-wrench-axis'; cleat.name = 'single-circulating-cleat';
  sortingArm.position.set(...armAnchors[0]); serviceArm.position.set(...point(armAnchors[1], [0, .105, .32]));
  cleat.position.copy(pickup); rig.add(sortingArm, serviceArm, cleat); mechanism.add(rig); root.add(structure, mechanism);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton([rig, sortingArm, serviceArm, cleat]); mechanism.bind(skeleton);
  let time = 0, last: number | null = null, disposed = false;
  const pose = () => {
    const cycle = Math.floor(time / 8), t = time / 8 - cycle, direction = cycle % 2 ? -1 : 1;
    const start = -.62 * direction, end = .62 * direction;
    const traverse = ease((t - .28) / .32), yaw = start + (end - start) * traverse;
    const lift = t < .28 ? .22 * ease((t - .12) / .16) : t < .60 ? .22 : .22 * (1 - ease((t - .60) / .15));
    const releaseLift = t >= .78 ? .1 * Math.sin(Math.PI * ease((t - .78) / .22)) : 0;
    rotation.setFromAxisAngle(axisY, yaw); pitch.setFromAxisAngle(axisX, -lift - releaseLift); sortingArm.quaternion.copy(rotation).multiply(pitch);
    if (t < .12 || t >= .75) {
      scratch.copy(grip).applyAxisAngle(axisY, t < .12 ? start : end).add(prepAnchor);
      cleat.position.copy(scratch); cleat.quaternion.setFromAxisAngle(axisY, t < .12 ? start : end);
    } else {
      scratch.copy(grip).applyQuaternion(sortingArm.quaternion); cleat.position.set(...armAnchors[0]).add(scratch);
      cleat.quaternion.copy(sortingArm.quaternion);
    }
    // A short torque-and-release motion around the real fixed valve axis.
    serviceArm.rotation.z = .22 * Math.sin(time * Math.PI / 2.4);
  };
  pose();
  const metrics = { triangles: fixed.triangles + moving.triangles, drawCalls: 2, shadowDrawCalls: 1, drivenObjects: 3,
    bones: 4, geometries: 2, materials: 1, colliders: solids.length };
  root.userData.factoryWorklife = { stations: FACTORY_WORKLIFE_STATIONS, metrics };
  return { root, solids, metrics, update(elapsed: number, active: boolean, paused: boolean) {
    if (disposed) return;
    root.visible = active;
    if (!Number.isFinite(elapsed) || !active || paused) { last = null; return; }
    if (last !== null) time += Math.max(0, Math.min(.1, elapsed - last));
    last = elapsed; pose();
  }, dispose() {
    if (disposed) return; disposed = true;
    fixedGeometry.dispose(); movingGeometry.dispose(); material.dispose(); skeleton.dispose();
  } };
}

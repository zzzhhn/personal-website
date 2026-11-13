import { Color, Euler, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { Vec3 } from '../types';
import { CoasterBatch, COASTER_PALETTE as P } from './coaster-geometry.ts';
import { coasterWorld } from './coaster-track.ts';
import { WORKSHOP_INTAKE, WORKSHOP_TOOLS } from './intent-workshop-layout.ts';

export interface WorkshopArcadeCollider { position: Vec3; half: Vec3; rotation?: Vec3 }
export interface WorkshopArcade {
  body: BufferGeometry;
  glow: BufferGeometry;
  colliders: WorkshopArcadeCollider[];
  triangles: number;
  dispose(): void;
}

/** Static world-space architecture. No group translation, animation, lights or materials. */
export function createWorkshopArcade(): WorkshopArcade {
  const bodyBatch = new CoasterBatch(), glowBatch = new CoasterBatch();
  const colliders: WorkshopArcadeCollider[] = [], lamps: Vec3[] = [];
  const warm = '#ffe9cf', magenta = '#d678a5', panel = '#b9c2b8';
  const solid = (at: Vec3, size: Vec3, color: string, q?: Quaternion) => {
    const position = coasterWorld(at);
    bodyBatch.box(position, size, color, q);
    const collider: WorkshopArcadeCollider = { position, half: size.map(v => v / 2) as Vec3 };
    if (q) {
      const e = new Euler().setFromQuaternion(q);
      collider.rotation = [e.x, e.y, e.z];
    }
    colliders.push(collider);
  };
  const line = (a: Vec3, b: Vec3, height: number, depth: number, color: string, glow = false) => {
    const av = new Vector3(...a), bv = new Vector3(...b), delta = bv.clone().sub(av);
    const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), delta.clone().normalize());
    const at = av.add(bv).multiplyScalar(.5).toArray() as Vec3;
    const size: Vec3 = [delta.length(), height, depth];
    if (glow) glowBatch.box(coasterWorld(at), size, color, q);
    else solid(at, size, color, q);
  };
  const pier = (x: number, z: number) => {
    solid([x, .11, z], [.72, .22, .72], P.concrete);
    solid([x, 2.86, z], [.42, 5.28, .42], P.steel);
    solid([x, .4, z], [.48, .36, .48], P.copper);
  };
  const bays = [...WORKSHOP_TOOLS, { id: 'intake', at: WORKSHOP_INTAKE }];
  for (const { id, at: [x, , z] } of bays) {
    const rear = z - 1.85, front = z + 2.5, roofWidth = id === 'intake' ? 5.8 : 4.2;
    // Low backs leave the 3.15 m carrier plane and every branch completely open.
    solid([x, 1.375, rear - .04], [4.1, 2.55, .16], P.dark);
    for (const side of [-1, 1]) {
      solid([x + side * 1.94, 1.375, rear + .06], [.22, 2.55, .24], P.steel);
      // The face is recessed behind the projecting frame, with no coplanar overlay.
      solid([x + side * .9, 1.375, rear + .055], [1.74, 2.1, .03], panel);
    }
    for (const y of [.2, 2.55]) solid([x, y, rear + .06], [3.66, .2, .24], P.steel);
    const reachZ = id === 'act' ? rear : front;
    for (const side of [-1, 1]) {
      const sx = x + side * 2;
      // Act's rear-left pier would cut its diagonal carrier branch. Its two
      // front-side piers instead flank the operating face and entry passage.
      // Intake's left brace starts behind the bell overhead volume. Extract's
      // left pier sits alongside its device, clear of the rewrite approach and
      // beyond the carrier branch (moving it only 1 m forward hits that branch).
      const supportZ = id === 'act' ? z + 2.15
        : id === 'intake' && side === -1 ? rear - .6
          : id === 'extract' && side === -1 ? z + .2 : rear;
      const direction = Math.sign(reachZ - supportZ);
      pier(sx, supportZ);
      line([sx, 5.45, Math.min(rear, supportZ)], [sx, 5.45, front], .24, .2, P.steel);
      line([sx, 4.25, supportZ], [sx, 5.45, supportZ + direction * 1.35], .17, .17, P.steel);
    }
    solid([x, 5.68, (rear + front) / 2], [roofWidth, .22, front - rear], P.white);
    solid([x, 5.58, front], [roofWidth, .32, .22], P.steel);
    solid([x, 5.79, rear + .28], [roofWidth, .08, .12], P.copper);
    // Two adjoining work-lamp runs read as one warm working edge per bay.
    for (const side of [-1, 1]) {
      const lx = x + side * .88, lz = z + .55;
      solid([lx, 5.36, lz], [1.72, .12, .32], P.dark);
      glowBatch.box(coasterWorld([lx, 5.285, lz]), [1.64, .03, .23], warm);
      lamps.push(coasterWorld([lx, 5.2, lz]));
    }
  }
  // The service spine follows the outside of the actual workshop, never a
  // diagonal across its open central sky. Roof panels remain separate bays.
  const spine: Vec3[] = bays.map(({ at: [x, , z] }) => [x, 5.57, z - 1.85]);
  spine.push([-25.8, 5.57, 71.15], spine[0]);
  pier(-25.8, 71.15);
  for (let i = 1; i < spine.length; i++) {
    line(spine[i - 1], spine[i], .26, .24, P.steel);
    const raised = (p: Vec3): Vec3 => [p[0], 5.735, p[2]];
    line(raised(spine[i - 1]), raised(spine[i]), .055, .07, P.cyan, true);
  }
  for (const id of ['debug', 'act', 'intake']) {
    const { at: [x, , z] } = bays.find(bay => bay.id === id)!;
    solid([x, 5.78, z - 1.85], [.32, .17, .32], P.dark);
    glowBatch.box(coasterWorld([x, 5.88, z - 1.85]), [.18, .035, .18], magenta);
  }
  // One grouped service cabinet, outside the operator routes; no floor clutter.
  solid([-26.2, .9, 69.4], [.8, 1.8, 1.6], P.steel);
  solid([-26.2, .94, 70.23], [.65, 1.46, .06], panel);
  solid([-26.42, 1.05, 70.28], [.06, .3, .04], P.copper);
  line([-26.2, 1.8, 69.4], [-26.2, 5.45, 69.4], .12, .12, P.copper);
  line([-26.2, 5.45, 69.4], [-25.8, 5.45, 71.15], .12, .12, P.copper);
  const body = bodyBatch.finish(), glow = glowBatch.finish();
  addWorkLampFill(body, lamps);
  let disposed = false;
  return {
    body, glow, colliders,
    triangles: (body.getAttribute('position').count + glow.getAttribute('position').count) / 3,
    dispose() { if (!disposed) { disposed = true; body.dispose(); glow.dispose(); } },
  };
}

/** Baked fill affects only this module's static faces, never existing scene assets. */
function addWorkLampFill(geometry: BufferGeometry, lamps: Vec3[]) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color'), night = geometry.getAttribute('nightRadiance');
  const warm = new Color('#ffe9cf');
  for (let i = 0; i < p.count; i++) {
    let fill = 0;
    for (const [x, y, z] of lamps) {
      const dx = x - p.getX(i), dy = y - p.getY(i), dz = z - p.getZ(i);
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= 7) continue;
      const facing = Math.max(0, (n.getX(i) * dx + n.getY(i) * dy + n.getZ(i) * dz) / Math.max(.01, distance));
      fill += (1 - distance / 7) ** 2 * facing * .7;
    }
    night.setXYZ(i, night.getX(i) + color.getX(i) * warm.r * fill,
      night.getY(i) + color.getY(i) * warm.g * fill, night.getZ(i) + color.getZ(i) * warm.b * fill);
  }
}

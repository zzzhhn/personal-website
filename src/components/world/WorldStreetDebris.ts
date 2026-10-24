/**
 * Street props: knocked-prop debris solver (street session).
 *
 * Why: the vehicle controller's wheel rays accept any solid collider as support, so a knocked pole or bin
 * lying under a car used to jack the chassis up (integration: lamp-6, van 5 m/s, +0.58 m). A prop that a
 * vehicle hits (or that lies on the ground when a vehicle approaches) therefore leaves the Rapier solver:
 * its colliders are disabled (invisible to wheel rays and chassis) and its body becomes kinematic, driven
 * by this small position-based rigid-body solver:
 *   - gravity, support-point contacts with the ground (raycast against fixed colliders), Coulomb-like
 *     friction and restitution, real torque from off-centre contacts (poles topple, bins roll);
 *   - vehicles push it as a moving oriented box (positional correction + carried velocity), people as a
 *     capsule, so cars shove debris ahead / aside instead of riding on it, and nothing clips through.
 * Substepped XPBD-style (Mueller et al. 2020, "Detailed rigid body simulation with extended position
 * based dynamics"), reduced to point-vs-plane / point-vs-box contacts. Pure math; no three.js scene work.
 */
import { Quaternion, Vector3 } from 'three';

export interface DebrisShape { points: Vector3[]; com: Vector3; mass: number; inertia: Vector3 }
export interface Pusher { kind: 'box' | 'capsule'; p: Vector3; q: Quaternion; half: Vector3; v: Vector3; radius?: number; height?: number }
export interface DebrisState { p: Vector3; q: Quaternion; v: Vector3; w: Vector3; rest: number; asleep: boolean }

const G = 9.81, SUB = 4, MU = .55, RESTITUTION = .18, LIN_DAMP = .15, ANG_DAMP = .6;
const tv = new Vector3(), tr = new Vector3(), tn = new Vector3(), tq = new Quaternion(), qPrev = new Quaternion(), pPrev = new Vector3();
const tmp1 = new Vector3(), tmp2 = new Vector3(), invQ = new Quaternion(), local = new Vector3();

/** Support points from hull clouds (local, body origin frame). Hull vertices only sit at the ends / collars
 * of a pole, so each long hull is also sliced every 0.3 m along its longest axis with a ring of 6 points
 * (ellipse of the hull's cross-section extents): a bumper meeting the middle of a pole finds points there. */
export function supportPoints(hulls: Float32Array[], perHull = 10) {
  const out: Vector3[] = [];
  for (const h of hulls) {
    const pts: Vector3[] = []; const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < h.length; i += 3) { const p = new Vector3(h[i], h[i + 1], h[i + 2]); pts.push(p); lo.min(p); hi.max(p); }
    // Extremal vertices (farthest-point sample) for corners and footings.
    const c = lo.clone().add(hi).multiplyScalar(.5), pick = [pts.reduce((a, b) => (b.distanceToSquared(c) > a.distanceToSquared(c) ? b : a))];
    const d = pts.map(p => p.distanceToSquared(pick[0]));
    while (pick.length < Math.min(perHull, pts.length)) { let k = 0; for (let i = 1; i < pts.length; i++) if (d[i] > d[k]) k = i; pick.push(pts[k]); for (let i = 0; i < pts.length; i++) d[i] = Math.min(d[i], pts[i].distanceToSquared(pts[k])); }
    out.push(...pick.map(p => p.clone()));
    const size = hi.clone().sub(lo), ax = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2, L = size.getComponent(ax);
    if (L > .6) {
      const u = (ax + 1) % 3, w = (ax + 2) % 3, ru = size.getComponent(u) / 2, rw = size.getComponent(w) / 2;
      for (let t = .3; t < L - .15; t += .3) for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, p = c.clone();
        p.setComponent(ax, lo.getComponent(ax) + t); p.setComponent(u, c.getComponent(u) + Math.cos(a) * ru); p.setComponent(w, c.getComponent(w) + Math.sin(a) * rw);
        out.push(p);
      }
    }
  }
  return out;
}
/** Box-inertia estimate from the support bounds around the centre of mass. */
export function makeShape(points: Vector3[], com: Vector3, mass: number): DebrisShape {
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) { lo.min(p); hi.max(p); }
  const s = hi.sub(lo);
  const inertia = new Vector3(s.y * s.y + s.z * s.z, s.x * s.x + s.z * s.z, s.x * s.x + s.y * s.y).multiplyScalar(mass / 12);
  return { points: points.map(p => p.clone().sub(com)), com: com.clone(), mass, inertia };
}

/** Apply a positional correction `corr` at world offset r (from the COM): linear + angular share by
 * generalised inverse mass (rigid body, infinitely heavy partner). Returns the multiplier used. */
function correct(s: DebrisState, shape: DebrisShape, r: Vector3, corr: Vector3) {
  const len = corr.length(); if (len < 1e-7) return;
  tn.copy(corr).divideScalar(len);
  // Inverse inertia in world: R I^-1 R^T applied to (r x n).
  tr.crossVectors(r, tn);
  invQ.copy(s.q).invert(); local.copy(tr).applyQuaternion(invQ);
  local.set(local.x / shape.inertia.x, local.y / shape.inertia.y, local.z / shape.inertia.z);
  const wgen = 1 / shape.mass + tr.dot(tmp1.copy(local).applyQuaternion(s.q));
  const lambda = len / wgen;
  s.p.addScaledVector(tn, lambda / shape.mass);
  // Angular: dq = 0.5 * (I^-1 (r x P)) * q.
  tmp1.copy(local).applyQuaternion(s.q).multiplyScalar(lambda);
  tq.set(tmp1.x, tmp1.y, tmp1.z, 0).multiply(s.q);
  s.q.set(s.q.x + .5 * tq.x, s.q.y + .5 * tq.y, s.q.z + .5 * tq.z, s.q.w + .5 * tq.w).normalize();
}

/** One frame. ground(x, z, yHint) -> support height (or null over water). */
export function stepDebris(s: DebrisState, shape: DebrisShape, dt: number, ground: (x: number, z: number, y: number) => number | null, pushers: Pusher[]) {
  if (s.asleep) {
    // Wake only if a pusher overlaps (cheap bound test).
    const r = shape.points.reduce((m, p) => Math.max(m, p.length()), 0);
    if (!pushers.some(u => u.p.distanceTo(s.p) < r + u.half.length() + .3)) return;
    s.asleep = false; s.rest = 0;
  }
  // Ground heights once per frame at each support point's current xz.
  const world = shape.points.map(p => tv.copy(p).applyQuaternion(s.q).add(s.p).clone());
  const gy = world.map(x => ground(x.x, x.z, x.y));
  const h = dt / SUB;
  for (let k = 0; k < SUB; k++) {
    pPrev.copy(s.p); qPrev.copy(s.q);
    s.v.y -= G * h;
    s.p.addScaledVector(s.v, h);
    tq.set(s.w.x, s.w.y, s.w.z, 0).multiply(s.q);
    s.q.set(s.q.x + .5 * h * tq.x, s.q.y + .5 * h * tq.y, s.q.z + .5 * h * tq.z, s.q.w + .5 * h * tq.w).normalize();
    let touching = false;
    // Ground contacts (normal + static friction from the contact point's tangential slip this substep).
    shape.points.forEach((pl, i) => {
      const g = gy[i]; if (g === null) return;
      const r = tmp2.copy(pl).applyQuaternion(s.q), x = tv.copy(r).add(s.p), pen0 = g - x.y;
      if (pen0 <= 0) return;
      // Deep "penetration" means the support ray started inside a curb / wall, not a real contact depth:
      // resolve at most 3 cm per substep so a bad sample can never become launch velocity.
      const pen = Math.min(pen0, .03);
      touching = true;
      correct(s, shape, r.clone(), new Vector3(0, pen, 0));
      const rPrev = tmp2.copy(pl).applyQuaternion(qPrev).add(pPrev), xNow = tv.copy(pl).applyQuaternion(s.q).add(s.p);
      const slip = new Vector3(xNow.x - rPrev.x, 0, xNow.z - rPrev.z), sl = slip.length();
      if (sl > 1e-6) correct(s, shape, tmp1.copy(pl).applyQuaternion(s.q).clone(), slip.multiplyScalar(-Math.min(1, MU * pen / sl)));
    });
    // Pushers: ONE aggregated correction per pusher (the deepest support point along a single push direction),
    // so many overlapping points never add up to a launch. Vehicles push along their travel direction when the
    // debris is ahead of the bumper, otherwise sideways; people push radially. Torque comes from applying the
    // correction at the deepest point.
    for (const u of pushers) {
      invQ.copy(u.q).invert();
      let best = 0, bestR: Vector3 | null = null; const dir = new Vector3();
      if (u.kind === 'capsule') {
        const R = u.radius ?? .35;
        shape.points.forEach(pl => {
          const r = tmp2.copy(pl).applyQuaternion(s.q), x = tv.copy(r).add(s.p);
          if (x.y < u.p.y - .9 || x.y > u.p.y + (u.height ?? 1.8)) return;
          const dx = x.x - u.p.x, dz = x.z - u.p.z, d = Math.hypot(dx, dz);
          if (d < R && R - d > best) { best = R - d; bestR = r.clone(); dir.set(d > 1e-4 ? dx / d : 1, 0, d > 1e-4 ? dz / d : 0); }
        });
      } else {
        const cl = tmp1.copy(s.p).sub(u.p).applyQuaternion(invQ), vl = new Vector3().copy(u.v).applyQuaternion(invQ);
        // Ahead of the moving bumper -> push forward; otherwise push out the nearest side.
        const forward = Math.abs(vl.x) > .3 && Math.sign(cl.x) === Math.sign(vl.x) && Math.abs(cl.x) > u.half.x * .6;
        const axisL = forward ? new Vector3(Math.sign(vl.x), 0, 0) : new Vector3(0, 0, Math.sign(cl.z || 1));
        shape.points.forEach(pl => {
          const r = tmp2.copy(pl).applyQuaternion(s.q), x = tv.copy(r).add(s.p);
          local.copy(x).sub(u.p).applyQuaternion(invQ);
          if (Math.abs(local.x) >= u.half.x || Math.abs(local.y) >= u.half.y || Math.abs(local.z) >= u.half.z) return;
          const depth = forward ? u.half.x - local.x * axisL.x : u.half.z - local.z * axisL.z;
          if (depth > best) { best = depth; bestR = r.clone(); }
        });
        dir.copy(axisL).applyQuaternion(u.q).setY(0).normalize();
      }
      if (!bestR) continue;
      // At most 5 cm per substep (300 m/s^2 equivalent at 4 x 60 Hz is plenty to keep ahead of a car).
      correct(s, shape, bestR, dir.multiplyScalar(Math.min(best + .005, .05)));
    }
    s.v.copy(s.p).sub(pPrev).divideScalar(h);
    tq.copy(s.q).multiply(qPrev.invert());
    s.w.set(tq.x, tq.y, tq.z).multiplyScalar((tq.w >= 0 ? 2 : -2) / h);
    // Never faster than the fastest pusher + 1.5 m/s horizontally, never more than 3 rad/s spin from contacts.
    const vmax = Math.max(0, ...pushers.map(u => Math.hypot(u.v.x, u.v.z))) + 1.5, vh = Math.hypot(s.v.x, s.v.z);
    if (vh > vmax) { s.v.x *= vmax / vh; s.v.z *= vmax / vh; }
    if (s.w.length() > 6) s.w.setLength(6);
    if (s.v.y > 2.5) s.v.y = 2.5;
    if (touching) {
      // Contact projection must not turn into launch velocity: keep a small bounce at most.
      if (s.v.y > 0) s.v.y = Math.min(s.v.y, RESTITUTION * 2);
      s.v.multiplyScalar(Math.exp(-LIN_DAMP * h * 6)); s.w.multiplyScalar(Math.exp(-ANG_DAMP * h * 4));
    } else { s.v.multiplyScalar(Math.exp(-LIN_DAMP * h * .2)); s.w.multiplyScalar(Math.exp(-ANG_DAMP * h * .2)); }
  }
  // Sleep when nearly still for 0.6 s (or fallen below the sea floor: the reset handles it).
  if (s.v.length() < .06 && s.w.length() < .12) { if ((s.rest += dt) > .6) { s.asleep = true; s.v.set(0, 0, 0); s.w.set(0, 0, 0); } } else s.rest = 0;
}

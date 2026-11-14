import { Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { Builder, bar, cbox, type V3 } from '../WorldStreetGeometry.ts';
import { FACTORY_CONVEYOR_TOP, FACTORY_LINE_Z, type FactoryOperation } from './factory-operation.ts';
import { FACTORY_MODULES, type FactoryModule } from './factory-game.ts';
import { factoryIntakePath, factoryRoutingPath, sampleFactoryRoute } from './factory-routing.ts';
import { createFactoryMaterial } from './factory-lighting.ts';
import type { FactoryCarrierPalette } from './factory-carrier.ts';

export const FACTORY_ROLLER_RADIUS = .115;
// The first 4.85 m is a continuous inlet belt. Never put round rollers through
// that belt or through the transverse routing table at x=-21.
export const FACTORY_CONVEYORS = [
  ...FACTORY_MODULES.map(module => ({ module, x0: -19.7, x1: 29,
    z: FACTORY_LINE_Z[module], y: FACTORY_CONVEYOR_TOP - FACTORY_ROLLER_RADIUS })),
  { module: null, x0: 32.35, x1: 89, z: 20, y: .85 },
] as const;

export interface FactoryBeltRun { id: string; a: V3; b: V3; edge: number; kind: 'intake'|'routing' }
const inclineY = (x: number) => .98 + (x + 33.7) / 7.7 * (FACTORY_CONVEYOR_TOP - .98) - .12;
/** Visible chain runs stop before table junctions; loop returns stay below the
 * support deck. They do not add round rollers through continuous belt faces. */
export const FACTORY_BELT_RUNS: readonly FactoryBeltRun[] = [
  { id: 'sorting', a: [-35.6, .86, -22], b: [-34, .86, -22], edge: .82, kind: 'intake' },
  { id: 'incline', a: [-33.45, inclineY(-33.45), -22], b: [-26.3, inclineY(-26.3), -22], edge: .82, kind: 'intake' },
  ...FACTORY_MODULES.map(module => ({ id: module,
    a: [-24.6, FACTORY_CONVEYOR_TOP - .12, FACTORY_LINE_Z[module]] as V3,
    b: [-22.2, FACTORY_CONVEYOR_TOP - .12, FACTORY_LINE_Z[module]] as V3,
    edge: 1.16, kind: 'routing' as const })),
  { id: 'transfer', a: [-21, FACTORY_CONVEYOR_TOP - .12, -20.25],
    b: [-21, FACTORY_CONVEYOR_TOP - .12, 15.4], edge: .94, kind: 'routing' },
];
const CHAIN_RADIUS = .13, TAU = Math.PI * 2;
const clamp = (v: number, max = 1) => Math.max(0, Math.min(max, v));

/** Sample the top, end sprocket, underside return and start sprocket of a
 * closed loop. Position and tangent share a continuous arc-length parameter. */
export function sampleFactoryChain(length: number, distance: number, out: { u: number; y: number; angle: number }) {
  const arc = Math.PI * CHAIN_RADIUS, loop = length * 2 + arc * 2;
  let s = ((distance % loop) + loop) % loop;
  if (s < length) { out.u = s; out.y = 0; out.angle = 0; }
  else if ((s -= length) < arc) {
    const t = s / CHAIN_RADIUS; out.u = length + CHAIN_RADIUS * Math.sin(t);
    out.y = -CHAIN_RADIUS + CHAIN_RADIUS * Math.cos(t); out.angle = -t;
  } else if ((s -= arc) < length) { out.u = length - s; out.y = -2 * CHAIN_RADIUS; out.angle = -Math.PI; }
  else {
    const t = (s - length) / CHAIN_RADIUS; out.u = -CHAIN_RADIUS * Math.sin(t);
    out.y = -CHAIN_RADIUS - CHAIN_RADIUS * Math.cos(t); out.angle = -Math.PI - t;
  }
  return out;
}

export function factoryRollerPositions() {
  return FACTORY_CONVEYORS.flatMap((line, lineIndex) => {
    const result: { at: [number, number, number]; line: number }[] = [];
    for (let x = line.x0; x < line.x1 - .1; x += .8)
      result.push({ at: [x, line.y, line.z], line: lineIndex });
    return result;
  });
}
/** Two instanced draws. The colour bands are actual roller faces, not coplanar
 * decals. Their tangential velocity follows the carrier's 47 m outfeed travel.
 * No timers, React ticks, textures, lights or scene-wide frame callbacks. */
export function createFactoryConveyors(P: FactoryCarrierPalette, night: { value: number }) {
  const b = new Builder();
  bar(b, [0, 0, -.92], [0, 0, .92], FACTORY_ROLLER_RADIUS, P.silver, 16);
  bar(b, [0, 0, -1.09], [0, 0, 1.09], .034, P.steel, 8);
  const geometry = b.build(), p = geometry.attributes.position, n = geometry.attributes.normal;
  const colours = geometry.attributes.color, dark = new Color(P.dark.color), amber = new Color(P.amber.color);
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getZ(i)) > .921 || Math.hypot(p.getX(i), p.getY(i)) < .1) continue;
    // A longitudinal index face and two darker faces make rotation readable.
    const colour = n.getY(i) > .92 ? amber : n.getX(i) < -.9 ? dark : null;
    if (colour) colours.setXYZ(i, colour.r, colour.g, colour.b);
  }
  const placements = factoryRollerPositions(), material = createFactoryMaterial(false, night);
  const mesh = new InstancedMesh(geometry, material, placements.length), group = new Group();
  mesh.name = 'factory-driven-rollers'; mesh.receiveShadow = true;
  group.name = 'factory-conveyor-motion'; group.add(mesh);
  const chainBuilder = new Builder();
  cbox(chainBuilder, [0, 0, 0], [.18, .065, .045], P.amber, 0);
  const chainGeometry = chainBuilder.build();
  const runs = FACTORY_BELT_RUNS.map(run => {
    const direction = new Vector3(...run.b).sub(new Vector3(...run.a)), length = direction.length(); direction.normalize();
    const side = new Vector3(-direction.z, 0, direction.x).normalize(), up = side.clone().cross(direction);
    const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(direction, up, side));
    return { ...run, direction, up, side, rotation, length, travel: 0,
      horizontal: Math.hypot(run.b[0] - run.a[0], run.b[2] - run.a[2]) };
  });
  const beltPlacements = runs.flatMap((run, index) => {
    const loop = 2 * run.length + TAU * CHAIN_RADIUS, count = Math.ceil(loop / .58);
    return [-1, 1].flatMap(side => Array.from({ length: count }, (_, i) => ({ run: index, side, distance: i * loop / count })));
  });
  const belts = new InstancedMesh(chainGeometry, material, beltPlacements.length);
  belts.name = 'factory-state-driven-belt-chains'; belts.receiveShadow = true; group.add(belts);
  const matrix = new Matrix4(), q = new Quaternion(), axis = new Vector3(0, 0, 1);
  const pos = new Vector3(), scale = new Vector3(1, 1, 1), angles = [0, 0, 0, 0];
  const chainPoint = { u: 0, y: 0, angle: 0 }, chainRotation = new Quaternion();
  const point: V3 = [0, 0, 0], previousPoint: V3 = [0, 0, 0];
  let path: V3[] | null = null, reverse = false, hasPoint = false, routeLine: FactoryModule | undefined;
  let previous: FactoryOperation | null = null, previousProgress = 0, disposed = false;
  const upload = () => {
    for (let i = 0; i < placements.length; i++) {
      const { at, line } = placements[i];
      q.setFromAxisAngle(axis, angles[line]); pos.set(...at);
      mesh.setMatrixAt(i, matrix.compose(pos, q, scale));
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  const uploadBelts = () => {
    for (let i = 0; i < beltPlacements.length; i++) {
      const placement = beltPlacements[i];
      const run = runs[placement.run];
      sampleFactoryChain(run.length, placement.distance + run.travel, chainPoint);
      pos.set(...run.a).addScaledVector(run.direction, chainPoint.u)
        .addScaledVector(run.up, chainPoint.y).addScaledVector(run.side, placement.side * run.edge);
      chainRotation.setFromAxisAngle(axis, chainPoint.angle); q.copy(run.rotation).multiply(chainRotation);
      belts.setMatrixAt(i, matrix.compose(pos, q, scale));
    }
    belts.instanceMatrix.needsUpdate = true;
  };
  const sample = (op: FactoryOperation, progress: number) => {
    if (path) sampleFactoryRoute(path, reverse ? 1 - progress : progress, point);
    else if (op.action.type === 'process') {
      point[0] = -27 + 47 * progress; point[1] = FACTORY_CONVEYOR_TOP; point[2] = FACTORY_LINE_Z[op.action.module];
    }
  };
  upload(); uploadBelts(); mesh.computeBoundingSphere(); belts.computeBoundingSphere();
  // Conservative fixed sphere includes both sides and the complete lower
  // return loop; updates never trigger a per-frame bounds allocation.
  if (belts.boundingSphere) belts.boundingSphere.radius += .6;
  const metrics = { colorDraws: 2, geometries: 2, materials: 1, colliders: 0,
    rollerInstances: placements.length, chainInstances: beltPlacements.length,
    triangles: b.triangles * placements.length + chainBuilder.triangles * beltPlacements.length };
  return { group, mesh, belts, placements, beltPlacements, metrics,
    /** routingLine is the material's recorded destination during a reverse
     * route (op.action.line is absent). Never guess the intended module line. */
    update(op: FactoryOperation | null, paused: boolean, routingLine?: FactoryModule) {
      if (paused || disposed) return;
      const currentLine = op?.action.type === 'route' ? op.action.line ?? routingLine : undefined;
      if (op !== previous || currentLine !== routeLine) {
        previous = op; previousProgress = 0; hasPoint = false; routeLine = currentLine;
        reverse = op?.action.type === 'route' && !op.action.line;
        path = op?.action.type === 'extract' ? factoryIntakePath(op.action.module)
          : op?.action.type === 'route' && currentLine ? factoryRoutingPath(op.action.module, currentLine) : null;
      }
      const type = op?.action.type;
      const active = op && (type === 'process' || type === 'extract') && (op.phase === 'outfeed' || op.phase === 'done')
        || op && type === 'route' && path && (op.phase === 'cycle' || op.phase === 'done');
      if (!op || !active) { hasPoint = false; return; }
      const progress = Math.max(0, Math.min(1, op.progress));
      const delta = progress - previousProgress; previousProgress = progress;
      if (delta <= 0) {
        if (delta < 0) { sample(op, progress); previousPoint[0] = point[0]; previousPoint[1] = point[1]; previousPoint[2] = point[2]; hasPoint = true; }
        return;
      }
      if (!hasPoint) { sample(op, 0); previousPoint[0] = point[0]; previousPoint[1] = point[1]; previousPoint[2] = point[2]; }
      sample(op, progress); hasPoint = true;
      if (op.action.type === 'process') {
        const line = FACTORY_MODULES.indexOf(op.action.module);
        angles[line] = (angles[line] - delta * 47 / FACTORY_ROLLER_RADIUS) % TAU;
        upload();
      }
      let changed = false;
      for (const run of runs) {
        if (run.kind === 'intake' ? type !== 'extract' : type === 'extract') continue;
        const dx = (run.b[0] - run.a[0]) / run.horizontal, dz = (run.b[2] - run.a[2]) / run.horizontal;
        const beforeCross = (previousPoint[0] - run.a[0]) * -dz + (previousPoint[2] - run.a[2]) * dx;
        const afterCross = (point[0] - run.a[0]) * -dz + (point[2] - run.a[2]) * dx;
        if (Math.abs(beforeCross) > .08 || Math.abs(afterCross) > .08) continue;
        const before = clamp((previousPoint[0] - run.a[0]) * dx + (previousPoint[2] - run.a[2]) * dz, run.horizontal);
        const after = clamp((point[0] - run.a[0]) * dx + (point[2] - run.a[2]) * dz, run.horizontal);
        const travel = (after - before) * run.length / run.horizontal;
        if (Math.abs(travel) < 1e-9) continue;
        run.travel = (run.travel + travel) % (2 * run.length + TAU * CHAIN_RADIUS); changed = true;
      }
      previousPoint[0] = point[0]; previousPoint[1] = point[1]; previousPoint[2] = point[2];
      if (changed) uploadBelts();
    },
    dispose() { if (disposed) return; disposed = true; mesh.dispose(); belts.dispose(); geometry.dispose(); chainGeometry.dispose(); material.dispose(); },
  };
}

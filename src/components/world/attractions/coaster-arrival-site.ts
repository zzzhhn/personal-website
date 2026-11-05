/** Small, renderer-free site survey. The map, vegetation, road mesh and recovery
 * share these samples; importing the map must not eagerly load Three. */
export type SitePoint = [number, number];
export type SiteMesh = { positions: number[]; indices: number[] };
export const COASTER_ARRIVAL_CENTER: SitePoint = [5, -121];
export const COASTER_ARRIVAL_RADIUS = 6.4;
export const COASTER_ROAD_HALF = 3.2;
export const COASTER_WALK_Z = [-124.5, -121.5] as const;
export const COASTER_ROAD_TOP = 1.045;
export const COASTER_APRON_TOP = 1.12;
export const COASTER_WORKSHOP_APRON: SitePoint[] = [[16,-140],[47,-140],[52,-130],[49,-117],[37,-115],[21,-118],[16,-128]];
export function onCoasterWorkshopApron(x:number,z:number) {
  if(x<16||x>52||z<-140||z>-115)return false;
  let inside=false;
  for(let i=0,j=COASTER_WORKSHOP_APRON.length-1;i<COASTER_WORKSHOP_APRON.length;j=i++) {
    const a=COASTER_WORKSHOP_APRON[j],b=COASTER_WORKSHOP_APRON[i];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const cross = (a: SitePoint, b: SitePoint) => a[0] * b[1] - a[1] * b[0];
const sub = (a: SitePoint, b: SitePoint): SitePoint => [a[0] - b[0], a[1] - b[1]];
const distance = (a: SitePoint, b: SitePoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Matches the existing open centripetal CatmullRomCurve3 and its default
 * 200-sample length estimate. Keeping it numeric preserves the lazy map chunk. */
export function sampleAttractionRoad(path: readonly SitePoint[]): SitePoint[] {
  const at = (t: number): SitePoint => {
    const p = (path.length - 1) * t, i = Math.min(path.length - 2, Math.floor(p)), w = p - i;
    const p1 = path[i], p2 = path[i + 1];
    const p0 = path[i - 1] ?? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3 = path[i + 2] ?? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    let d0 = Math.sqrt(distance(p0, p1)), d1 = Math.sqrt(distance(p1, p2)), d2 = Math.sqrt(distance(p2, p3));
    if (d1 < 1e-4) d1 = 1;
    if (d0 < 1e-4) d0 = d1;
    if (d2 < 1e-4) d2 = d1;
    return [0, 1].map(k => {
      const a = ((p1[k] - p0[k]) / d0 - (p2[k] - p0[k]) / (d0 + d1) + (p2[k] - p1[k]) / d1) * d1;
      const b = ((p2[k] - p1[k]) / d1 - (p3[k] - p1[k]) / (d1 + d2) + (p3[k] - p2[k]) / d2) * d1;
      return p1[k] + a * w + (-3 * p1[k] + 3 * p2[k] - 2 * a - b) * w * w
        + (2 * p1[k] - 2 * p2[k] + a + b) * w * w * w;
    }) as SitePoint;
  };
  let length = 0, previous = at(0);
  for (let i = 1; i <= 200; i++) { const p = at(i / 200); length += distance(previous, p); previous = p; }
  const divisions = Math.ceil(length);
  return Array.from({ length: divisions + 1 }, (_, i) => at(i / divisions));
}

export function roadRail(points: readonly SitePoint[], offset: number): SitePoint[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    return [p[0] - dz / l * offset, p[1] + dx / l * offset];
  });
}

export function sitePolylineDistance(x: number, z: number, points: readonly SitePoint[]) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

const branchStart: SitePoint = [-15, -123];
const branchDirection = sub(COASTER_ARRIVAL_CENTER, branchStart);
const branchLength = Math.hypot(...branchDirection);
const along: SitePoint = branchDirection.map(v => v / branchLength) as SitePoint;
const across: SitePoint = [-along[1], along[0]];
export const arrivalCrossCoordinate = (p: SitePoint) => cross(along, sub(p, branchStart));
const branchPoint = (s: number, t: number): SitePoint => [branchStart[0] + along[0] * s + across[0] * t, branchStart[1] + along[1] * s + across[1] * t];

function railIntersection(rail: SitePoint[], lateral: number) {
  const line = branchPoint(0, lateral);
  for (let i = 1; i < rail.length; i++) {
    const a = rail[i - 1], d = sub(rail[i], a), denominator = cross(d, along);
    if (Math.abs(denominator) < 1e-8) continue;
    const t = cross(sub(line, a), along) / denominator;
    const p: SitePoint = [a[0] + d[0] * t, a[1] + d[1] * t];
    if (t >= 0 && t <= 1 && distance(p, branchStart) < 12) return { point: p, index: i - 1 + t };
  }
  throw new Error('Coaster arrival must meet the retained main road edge');
}

const circleX = (z: number) => COASTER_ARRIVAL_CENTER[0] + Math.sqrt(COASTER_ARRIVAL_RADIUS ** 2 - (z - COASTER_ARRIVAL_CENTER[1]) ** 2);
/** Actual western apron edge, from [16,-128] to [21,-118]. */
export const coasterApronWestX = (z: number) => 16 + (z + 128) / 2;
export function coasterWalkHeight(x: number, z: number) {
  const start = circleX(z), t = Math.max(0, Math.min(1, (x - start) / (coasterApronWestX(z) - start)));
  return mix(COASTER_ROAD_TOP, COASTER_APRON_TOP, t);
}

/** Upward triangle fan for a star-shaped site outline. */
export function siteFan(outline: readonly SitePoint[], center: SitePoint, height: (x: number, z: number) => number): SiteMesh {
  const points = [center, ...outline], positions = points.flatMap(([x, z]) => [x, height(x, z), z]);
  const indices: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = i + 1, b = (i + 1) % outline.length + 1;
    const sign = cross(sub(points[a], center), sub(points[b], center));
    if (Math.abs(sign) > 1e-8) indices.push(0, ...(sign < 0 ? [a, b] : [b, a]));
  }
  return { positions, indices };
}

export function createCoasterArrivalSite(mainRoad: SitePoint[]) {
  const half = COASTER_ROAD_HALF, radius = COASTER_ARRIVAL_RADIUS, shoulder = 1.05;
  const innerRail = roadRail(mainRoad, half), outerRail = roadRail(mainRoad, half + shoulder);
  const top = railIntersection(innerRail, half), bottom = railIntersection(innerRail, -half);
  const outerTop = railIntersection(outerRail, half), outerBottom = railIntersection(outerRail, -half);
  const phi = Math.atan2(along[1], along[0]), limit = Math.PI - Math.asin(half / radius);
  const angles = Array.from({ length: 41 }, (_, i) => phi + limit - 2 * limit * i / 40);
  const walkAngles = COASTER_WALK_Z.map(z => Math.asin((z - COASTER_ARRIVAL_CENTER[1]) / radius));
  angles.push(...walkAngles); angles.sort((a, b) => b - a);
  const circle = (a: number, r: number): SitePoint => [COASTER_ARRIVAL_CENTER[0] + Math.cos(a) * r, COASTER_ARRIVAL_CENTER[1] + Math.sin(a) * r];
  const arc = angles.map(a => circle(a, radius));
  const outerLimit = Math.PI - Math.asin((half + shoulder) / (radius + shoulder));
  const outerArc = angles.map(a => {
    if (walkAngles.some(w => Math.abs(w - a) < 1e-8)) return circle(Math.asin(Math.sin(a) * radius / (radius + shoulder)), radius + shoulder);
    return circle(phi + (a - phi) / limit * outerLimit, radius + shoulder);
  });
  // The branch starts exactly on the sampled main asphalt edge, following its
  // intervening vertices. It is not a disk laid over another road ribbon.
  const closing: SitePoint[] = [];
  for (let i = Math.ceil(Math.min(top.index, bottom.index)); i < Math.max(top.index, bottom.index); i++) closing.push(innerRail[i]);
  if (bottom.index > top.index) closing.reverse();
  const roadOutline = [top.point, ...arc, bottom.point, ...closing];
  const shoulderInner = [top.point, ...arc, bottom.point];
  const shoulderOuter = [outerTop.point, ...outerArc, outerBottom.point];
  const shoulderPolygons: SitePoint[][] = [];
  for (let i = 1; i < shoulderInner.length; i++) {
    const middleZ = (shoulderInner[i - 1][1] + shoulderInner[i][1]) / 2;
    const onEastArc = i > 1 && i < shoulderInner.length - 1 && (angles[i - 2] + angles[i - 1]) / 2 > -Math.PI / 2;
    if (onEastArc && middleZ > COASTER_WALK_Z[0] && middleZ < COASTER_WALK_Z[1]) continue;
    shoulderPolygons.push([shoulderInner[i - 1], shoulderOuter[i - 1], shoulderOuter[i], shoulderInner[i]]);
  }
  const walkArc = arc.filter(([, z], i) => angles[i] > -Math.PI / 2 && z >= COASTER_WALK_Z[0] - 1e-8 && z <= COASTER_WALK_Z[1] + 1e-8);
  const walkOutline: SitePoint[] = [...walkArc, [coasterApronWestX(COASTER_WALK_Z[0]), COASTER_WALK_Z[0]], [coasterApronWestX(COASTER_WALK_Z[1]), COASTER_WALK_Z[1]]];
  const walkCenter: SitePoint = [(circleX(-123) + coasterApronWestX(-123)) / 2, -123];
  return { roadOutline, shoulderPolygons, walkOutline,
    road: siteFan(roadOutline, COASTER_ARRIVAL_CENTER, () => COASTER_ROAD_TOP),
    walk: siteFan(walkOutline, walkCenter, coasterWalkHeight),
  };
}

/** Clip only the east main-road shoulder at the branch opening. Asphalt and
 * the western shoulder remain exactly on their original sampled triangles. */
export function clipArrivalJunction(polygon: SitePoint[]) {
  if (!polygon.some(p => distance(p, branchStart) < 12)) return [polygon];
  const keep = (sign: number) => {
    const output: SitePoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = sign * arrivalCrossCoordinate(a) - COASTER_ROAD_HALF, db = sign * arrivalCrossCoordinate(b) - COASTER_ROAD_HALF;
      if (da >= 0) output.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); output.push([mix(a[0], b[0], t), mix(a[1], b[1], t)]); }
    }
    return output;
  };
  return [keep(-1), keep(1)].filter(p => p.length >= 3);
}

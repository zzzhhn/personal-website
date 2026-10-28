import { Builder, cbox, bar, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_RAMP } from './ibd-yard-layout.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import { buildIbdArchitecture, buildIbdStores, type IbdSolid } from './ibd-yard-architecture.ts';
import { buildIbdSite } from './ibd-yard-site.ts';
import { bakeIbdLight } from './ibd-yard-lighting.ts';
import { addInspectionTools, addWoundCoil, addYardControl } from './ibd-craft-geometry.ts';
import { buildIbdTruck } from './ibd-truck-geometry.ts';
export { IBD_MATERIALS } from './ibd-yard-palette.ts';
export type { IbdSolid } from './ibd-yard-architecture.ts';
export { buildIbdPack } from './ibd-pack-geometry.ts';
function buildIbdWalkSurface(b: Builder) {
  const vertices: number[] = [], indices: number[] = [], ids = new Map<string, number>();
  const boundary = new Map<string, { a: V3; end: V3; count: number }>();
  const vertex = (p: V3) => { const key = p.join(','); let id = ids.get(key); if (id === undefined) { id = vertices.length / 3; ids.set(key, id); vertices.push(...p); } return id; };
  const below = (p: V3): V3 => [p[0], p[1] - .2, p[2]];
  const face = (points: V3[]) => { const v = points.map(vertex); indices.push(v[0], v[1], v[2], v[0], v[2], v[3]); };
  const top = (points: V3[]) => {
    b.face(points, P.dark, [0, 1, 0]); face(points);
    const bottom = points.map(below).reverse(); b.face(bottom, P.dark, [0, -1, 0]); face(bottom);
    for (let i = 0; i < 4; i++) {
      const a = points[i], end = points[(i + 1) % 4], key = [vertex(a), vertex(end)].sort((x, y) => x - y).join(',');
      const prior = boundary.get(key);
      if (prior) prior.count++; else boundary.set(key, { a, end, count: 1 });
    }
  };
  top([[-25.6, 4.1, -12.2], [-25.6, .1, 3.5], [-22.4, .1, 3.5], [-22.4, 4.1, -12.2]]);
  const cuts = [-25.6, -22.4, -7.3, -4.7];
  for (let i = 0; i < cuts.length - 1; i++) top([[cuts[i], 4.1, -16], [cuts[i], 4.1, -12.2], [cuts[i + 1], 4.1, -12.2], [cuts[i + 1], 4.1, -16]]);
  top([[-7.3, 4.1, -12.2], [-7.3, 4.1, -2.5], [-4.7, 4.1, -2.5], [-4.7, 4.1, -12.2]]);
  for (const { a, end, count } of boundary.values()) if (count === 1) {
    const side = [a, below(a), below(end), end];
    b.face(side, P.dark, [a[2] - end[2], 0, end[0] - a[0]]); face(side);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
export function buildIbdStatic() {
  const b = new Builder(), solids: IbdSolid[] = [];
  const cube = (at: V3, size: V3, s: Surf, solid = false, bevel = .03, rotation?: V3) => {
    if (rotation) b.tr(at, rotation, () => cbox(b, [0, 0, 0], size, s, bevel)); else cbox(b, at, size, s, bevel);
    if (solid) solids.push({ at, size, ...(rotation ? { rotation } : {}) });
  };
  const groundSurface = buildIbdArchitecture(b, cube, solids);
  buildIbdStores(b, cube, solids);
  buildIbdSite(b, cube);
  for (const x of [-20, -12]) for (const z of [-4, ...(x === -12 ? [-9] : [])]) {
    cube([x, .095, z], [4.6, .02, 3.4], P.dark, false, 0);
    for (const side of [-1, 1]) cube([x + side * 2.35, .11, z], [.25, .015, 3.2], P.amber, false, 0);
  }
  // The narrow crane lane makes the front coil a physical occluder. The gantry lifts above its guards.
  for (const x of [-14.5, -9.5]) {
    cube([x, .75, -6.85], [.12, 1.5, 9.7], P.dark, true);
    cube([x, 1.53, -6.85], [.16, .06, 9.7], P.amber);
  }
  cube([-12, .75, -11.7], [5.1, 1.5, .12], P.dark, true);
  // One welded shell has no internal vertical box ends for the character's swept guard to hit.
  const gallerySurface = buildIbdWalkSurface(b);
  // Reuse the existing static Trimesh collider for the exact clipped paving and the unchanged gallery.
  const vertices = new Float32Array(groundSurface.vertices.length + gallerySurface.vertices.length);
  vertices.set(groundSurface.vertices); vertices.set(gallerySurface.vertices, groundSurface.vertices.length);
  const indices = new Uint32Array(groundSurface.indices.length + gallerySurface.indices.length);
  indices.set(groundSurface.indices);
  indices.set(gallerySurface.indices.map(i => i + groundSurface.vertices.length / 3), groundSurface.indices.length);
  const rollerVertices: number[] = [], rollerIndices: number[] = [];
  // Reuse each visible closed bar verbatim in the existing static trimesh. Preserve the
  // spaces between rollers and the two walking gaps instead of filling the whole lane.
  const rollerBar = (a: V3, end: V3, radius: number, surf: Surf, sides: number) => {
    const firstVertex = b.pos.length / 3, firstIndex = b.idx.length;
    bar(b, a, end, radius, surf, sides);
    const offset = rollerVertices.length / 3 - firstVertex;
    rollerVertices.push(...b.pos.slice(firstVertex * 3));
    for (let i = firstIndex; i < b.idx.length; i++) rollerIndices.push(b.idx[i] + offset);
  };
  const rail = (a: V3, end: V3) => {
    bar(b, a, end, .06, P.amber, 6);
    const dx = end[0] - a[0], dy = end[1] - a[1], dz = end[2] - a[2];
    solids.push({ at: [(a[0] + end[0]) / 2, (a[1] + end[1]) / 2, (a[2] + end[2]) / 2],
      size: dx ? [Math.abs(dx), .12, .12] : [.12, .12, Math.hypot(dy, dz)],
      ...(dx ? {} : { rotation: [Math.atan2(-dy, dz), 0, 0] as V3 }) });
  };
  for (const x of [-25.5, -22.5]) {
    for (const h of [.55, 1.05]) rail([x, .1 + h, IBD_RAMP.south], [x, 4.1 + h, IBD_RAMP.north]);
    for (let i = 0; i <= 8; i++) bar(b, [x, .1 + i / 2, IBD_RAMP.south - i * IBD_RAMP.length / 8], [x, 1.15 + i / 2, IBD_RAMP.south - i * IBD_RAMP.length / 8], .05, P.steel, 6);
  }
  const edges: [V3, V3][] = [
    [[-25.5, 0, -12.2], [-25.5, 0, -15.9]], [[-25.5, 0, -15.9], [-4.8, 0, -15.9]],
    [[-22.4, 0, -12.3], [-7.3, 0, -12.3]], [[-4.8, 0, -15.9], [-4.8, 0, -2.6]],
    [[-7.2, 0, -12.2], [-7.2, 0, -2.6]], [[-7.2, 0, -2.6], [-4.8, 0, -2.6]],
  ];
  for (const [a, end] of edges) for (const h of [4.65, 5.15]) rail([a[0], h, a[2]], [end[0], h, end[2]]);
  for (const [a, end] of edges) {
    const count = Math.ceil(Math.hypot(end[0] - a[0], end[2] - a[2]) / 3);
    for (let i = 0; i <= count; i++) {
      const x = a[0] + (end[0] - a[0]) * i / count, z = a[2] + (end[2] - a[2]) * i / count;
      bar(b, [x, 4.1, z], [x, 5.15, z], .05, P.steel, 6);
    }
  }
  // Benches, load rollers and the prominent empty spaces in their trays carry the interaction.
  for (const x of [10, 18]) {
    cube([x, .72, -12], [3.6, .3, 3.2], P.dark, true);
    for (const xx of [-1.4, 1.4]) for (const z of [-13.3, -10.7]) cube([x + xx, .35, z], [.18, .7, .18], P.steel, true);
    cube([x, .94, -12], [3.3, .12, 3], P.steel);
    // Leave a standing gap in front of each inspection bench; guide arrows must not enter a roller bed.
    for (const [start, end] of [[-8.2, -3], [5, 7]]) {
      for (const xx of [-1.7, 1.7]) rollerBar([x + xx, .6, start], [x + xx, .6, end], .08, P.dark, 6);
      for (let z = start; z <= end; z += .8) rollerBar([x - 1.5, .65, z], [x + 1.5, .65, z], .13, P.steel, 8);
    }
  }
  // Exact roller/side-frame contacts stop grounded players; z=0 and z=4 stay open.
  // Receiving and tools have real work surfaces, not identical machine levers.
  for (const [x, z, top] of [[-3, 26, .8], [-6, 19, 1.1]]) {
    cube([x, top, z], [2.2, .16, 1.2], P.timber, true);
    for (const dx of [-.85, .85]) cube([x + dx, top / 2, z], [.18, top, .9], P.dark, true);
    cube([x, top + .14, z - .48], [2, .12, .12], P.amber);
  }
  for (const [x, z] of [[-6, .2], [-8, -4], [-8, -9], [7, -12], [21, -12], [7.8, -6.5], [20.2, -6.5], [8, 7.7], [8, 17.3], [7, 18]]) {
    const kind = x === -6 ? 'crane' : x === -8 ? 'turn' : z === -12 ? 'scale' : x === 7 && z === 18 ? 'dispatch' : 'load';
    addYardControl(b, cube, x, z, kind);
  }
  buildIbdTruck(b, cube, solids);
  // The quarantine dollies roll onto a marked floor bay. Raised rack feet used to clip the exchange path.
  for (const z of [-18.5, -14.5]) cube([15.5, .11, z], [15, .015, .14], P.rust, false, 0);
  for (const x of [8, 23]) cube([x, .11, -16.5], [.14, .015, 4], P.rust, false, 0);
  for (const x of [9, 22]) cube([x, 1.75, -19], [.14, 3.5, .14], P.dark, true);
  cube([14, 3.2, -19], [5.2, .95, .12], P.dark);
  for (let z = 3; z < 21; z += 3) cube([1, .092, z], [.15, .012, 1.7], P.pale, false, 0);
  for (const x of [-4.6, 4.6]) cube([x, 1.8, 28.2], [.22, 3.6, .22], P.dark, true);
  cube([0, 3.6, 28.2], [9.4, 1.6, .18], P.dark);
  for (const [x, z] of [[-6, -3.5], [-10, -13.5]]) {
    cube([x, 4.6, z - .4], [.18, 1.2, .18], P.steel);
    bar(b, [x, 5.25, z - .8], [x, 5.25, z + .2], .13, P.dark, 8);
  }
  cube([-28.3, .8, 3.96], [.14, 1.6, .14], P.dark, true);
  cube([-28.3, 1.6, 3.96], [2.7, .8, .12], P.dark, true);
  const walkSurface = {
    vertices: new Float32Array([...vertices, ...rollerVertices]),
    indices: new Uint32Array([...indices, ...rollerIndices.map(i => i + vertices.length / 3)]),
  };
  return { geometry: bakeIbdLight(b.build()), solids, walkSurface, groundSurface };
}

export function buildIbdCoil(damaged: boolean, number = 1) {
  const b = new Builder();
  addWoundCoil(b, damaged);
  cbox(b, [.8, .65, 1.37], [.65, .42, .04], P.pale, .02);
  for (let i = 0; i < number; i++) cbox(b, [.64 + i * .18, .65, 1.395], [.06, .24, .008], P.dark, .002);
  for (const x of [.52, 1.08]) cbox(b, [x, .8, 1.394], [.035, .035, .008], P.dark);
  cbox(b, [0, -2.07, 0], [3.9, .14, 2.7], P.dark, .03);
  // The cradles belong to the moving dolly, so exchanging a coil cannot drag through fixed timber blocks.
  for (const x of [-1.25, 1.25]) cbox(b, [x, -1.72, 0], [.45, .6, 2.7], P.timber, .03);
  for (const x of [-1.7, 1.7]) for (const z of [-1.05, 1.05])
    b.tr([x, -2.12, z], [0, 0, Math.PI / 2], () => lathe(b, [[0, -.09], [.13, -.09], [.13, .09], [0, .09]], P.steel, { sides: 8 }));
  return b.build();
}
export function buildIbdLid() {
  const b = new Builder();
  cbox(b, [0, 0, 1.25], [2.82, .12, 2.5], P.timber, .04);
  for (const x of [-.8, .8]) cbox(b, [x, .07, 1.25], [.12, .03, 2.5], P.amber, .01);
  return b.build();
}
export function buildIbdCrane() {
  const b = new Builder();
  // Open trolley chassis: four flanged wheels sit on the existing bridge rails.
  // All parts travel with the old trolley pivot, without additional scene nodes.
  for (const x of [-1.3, 1.3]) {
    cbox(b, [x, .25, 0], [.35, .4, 4.3], P.amber, .045);
    for (const z of [-2, 2]) b.tr([x, 0, z], [Math.PI / 2, 0, 0], () => {
      lathe(b, [[0, -.17], [.25, -.17], [.25, -.1], [.21, -.1], [.21, .1], [.25, .1], [.25, .17], [0, .17]], P.dark, { sides: 16 });
      lathe(b, [[0, -.18], [.09, -.18], [.09, .18], [0, .18]], P.cutSteel, { sides: 12 });
    });
    // Paired winding drums align with the two existing suspension cables.
    b.tr([x, .56, 0], [Math.PI / 2, 0, 0], () => {
      lathe(b, [[0, -.78], [.28, -.78], [.28, -.68], [.21, -.68], [.21, .68], [.28, .68], [.28, .78], [0, .78]], P.steel, { sides: 16 });
      for (let j = 0; j < 8; j++) {
        const y = -.56 + j * .16;
        lathe(b, [[.21, y], [.225, y], [.225, y + .025], [.21, y + .025]], P.dark, { sides: 10, caps: false });
      }
    });
    for (const z of [-.87, .87]) cbox(b, [x, .48, z], [.47, .63, .12], P.amber, .03);
  }
  for (const z of [-1.65, 1.65]) {
    cbox(b, [0, .25, z], [3.65, .35, .34], P.amber, .035);
    for (const x of [-1.6, 1.6]) cbox(b, [x, .46, z], [.24, .06, .27], P.dark, .01);
  }
  // Central motor and gearbox, with cooling ribs; the open corners reveal the
  // mechanical silhouette rather than disguising it with a larger solid box.
  cbox(b, [0, .53, 0], [.76, .55, 1.1], P.blue, .08);
  for (let i = 0; i < 6; i++) cbox(b, [0, .57, -.42 + i * .16], [.84, .52, .045], P.steel, .015);
  bar(b, [-1.3, .56, .76], [1.3, .56, .76], .055, P.cutSteel, 10);
  cbox(b, [0, .46, 1.65], [.76, .03, .25], P.pale, .01);
  return b.build();
}
export function buildIbdHook() {
  const b = new Builder();
  // Welded spreader beam, end clevises and curved clamp shoes contact the coil
  // shoulder. Existing cable anchors and the clearance above the coil stay fixed.
  cbox(b, [0, 0, 0], [3.5, .24, .12], P.amber, .02);
  for (const y of [-.145, .145]) cbox(b, [0, y, 0], [3.5, .05, .4], P.amber, .01);
  for (const x of [-1.3, 1.3]) {
    for (const z of [-.13, .13]) cbox(b, [x, -.15, z], [.26, .5, .07], P.steel, .025);
    bar(b, [x, -.27, -.21], [x, -.27, .21], .075, P.cutSteel, 10);
    bar(b, [x, -.27, 0], [x, -.87, 0], .07, P.dark, 10);
    cbox(b, [x, -.89, 0], [.33, .12, .45], P.cutSteel, .035);
  }
  for (const x of [-.7, 0, .7]) cbox(b, [x, 0, .076], [.055, .21, .035], P.dark);
  return b.build();
}
export function buildIbdCables() {
  const b = new Builder();
  for (const x of [-1.3, 1.3]) cbox(b, [x, -.5, 0], [.045, 1, .045], P.dark);
  return b.build();
}
export function buildIbdTools() {
  const b = new Builder();
  addInspectionTools(b);
  return b.build();
}
export function buildIbdShutter() {
  const b = new Builder();
  for (let y = 0; y < 3; y += .25) cbox(b, [0, y - 1.5, 0], [.13, .22, 8.8], P.green, .02);
  cbox(b, [-.1, 0, 0], [.06, .45, 3], P.amber);
  return b.build();
}

import { Builder, bar, cbox, lathe, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';

const cutSteel: Surf = { color: '#b8c2c2', rough: .38, metal: .88 };
const winding: Surf = { color: '#73828b', rough: .48, metal: .86 };
/** A continuous rolled sheet, with a genuinely recessed rear inspection defect.
 * All sheet faces and bands stay inside the existing 2 × 2 × 1.4 m half extents. */
export function addWoundCoil(b: Builder, damaged: boolean) {
  const barrel: Surf = { color: '#a1adb2', rough: .36, metal: .92 };
  const strap: Surf = { color: '#425c68', rough: .45, metal: .58 };
  const begin = b.pos.length / 3;
  b.tr([0, 0, 0], [Math.PI / 2, 0, 0], () => {
    // Rolled lip, slight barrel crown, and a recessed return at the bore.
    lathe(b, [[1.9, -1.35], [1.96, -1.31], [1.985, -1.2], [1.985, 1.2], [1.96, 1.31], [1.9, 1.35]], barrel, { sides: 48, caps: false });
    lathe(b, [[.65, 1.35], [.63, 1.3], [.63, -1.3], [.65, -1.35]], winding, { sides: 48, caps: false });
  });
  // Project barrel grain along its roll width; the cross-axis uses local Y,
  // avoiding an angular UV branch cut on the underside.
  // Negative surface codes are private to IBD; positive codes still belong to
  // paving/signs. UVs are physical coordinates, so turning moves the mill grain.
  for (let i = begin; i < b.pos.length / 3; i++) {
    b.mat[i * 4 + 3] = -2;
    b.suv[i * 2] = b.pos[i * 3 + 2];
    b.suv[i * 2 + 1] = b.pos[i * 3 + 1];
  }
  const dent = (x: number, y: number, side: number) => damaged && side < 0
    ? .24 * Math.max(0, 1 - Math.hypot((x + .72) / .53, (y - .82) / .68)) ** 2 : 0;
  const point = (r: number, a: number, side: number): V3 => {
    const x = r * Math.cos(a), y = r * Math.sin(a);
    return [x, y, side * (1.35 - dent(x, y, side))];
  };
  for (const side of [-1, 1]) {
    for (let ring = 0; ring < 12; ring++) for (let i = 0; i < 48; i++) {
      const r = .65 + ring * 1.25 / 12, outer = .65 + (ring + 1) * 1.25 / 12;
      const a = i / 48 * Math.PI * 2, next = (i + 1) / 48 * Math.PI * 2;
      const p = [point(r, a, side), point(outer, a, side), point(outer, next, side), point(r, next, side)];
      const depth = dent((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, side);
      const ids = b.face(p, depth > .012 ? (depth > .08 ? winding : P.rust) : cutSteel, [0, 0, side]);
      ids.forEach((id, j) => {
        b.suv[id * 2] = p[j][0]; b.suv[id * 2 + 1] = p[j][1];
        if (depth <= .012) b.mat[id * 4 + 3] = -1;
      });
    }
  }
  // Real narrow tension straps; no coplanar spiral decals. Mill layers are
  // derivative-filtered in the material, keeping distant coils stable.
  b.tr([0, 0, 0], [Math.PI / 2, 0, 0], () => {
    for (const z of [-.9, .9]) lathe(b, [[1.99, z - .055], [2, z - .055], [2, z + .055], [1.99, z + .055]], strap, { sides: 48, caps: false });
  });
  for (const z of [-.9, .9]) {
    cbox(b, [0, 1.975, z], [.23, .045, .19], winding, .012);
    cbox(b, [0, 1.998, z], [.14, .004, .12], cutSteel);
  }
}

/** Bare machined surfaces reuse the yard's physical mill response. Coordinates
 * stay in metres and no geometry, collision or additional material is created. */
export function applyIbdMachinedFinish(b: Builder, first = 0) {
  for (let i = first; i < b.pos.length / 3; i++) {
    if (b.mat[i * 4 + 1] < .5 || b.mat[i * 4 + 3] !== 0) continue;
    const nx=Math.abs(b.nrm[i*3]),ny=Math.abs(b.nrm[i*3+1]),nz=Math.abs(b.nrm[i*3+2]);
    const normal=nx>ny&&nx>nz?0:ny>nz?1:2;
    const u = normal === 0 ? 2 : 0, v = normal === 1 ? 2 : 1;
    b.mat[i*4+3] = -2;
    b.suv[i*2] = b.pos[i*3+u]; b.suv[i*2+1] = b.pos[i*3+v];
  }
}

/** Visual support stays below each original side bar. The exact original closed
 * roller/rail triangles remain the sole contact mesh, including their gaps. */
export function addIbdRollerFrame(b: Builder, x: number, start: number, end: number) {
  const first = b.pos.length / 3, length = end-start, middle = (start+end)/2;
  for (const side of [-1, 1]) {
    const railX = x+side*1.7;
    // Folded channel: vertical web and two returned lips support the bearings.
    cbox(b, [railX,.47,middle], [.055,.24,length], P.dark, .008);
    for (const y of [.365,.575]) cbox(b, [railX,y,middle], [.16,.035,length], P.steel, .007);
    for (const z of [start+.18,end-.18]) {
      cbox(b, [railX,.265,z], [.13,.29,.14], P.dark, .012);
      cbox(b, [railX,.12,z], [.16,.04,.28], P.steel, .01);
      // The short knee is in the side-frame plane, entirely inside this bank.
      bar(b, [railX,.2,z], [railX,.45,z+(z<middle?.32:-.32)], .035, P.steel, 6);
    }
    for (let z = start; z <= end; z += .8) {
      // Axle ends bridge the former 20 cm unsupported barrel/rail gap.
      bar(b, [x+side*1.49,.65,z], [x+side*1.755,.65,z], .037, P.cutSteel, 8);
      cbox(b, [railX,.605,z], [.15,.12,.22], P.dark, .018);
      b.tr([railX,.65,z], [0,0,Math.PI/2], () =>
        lathe(b, [[.038,-.075],[.082,-.075],[.082,.075],[.038,.075],[.038,-.075]],
          P.cutSteel, {sides:8,caps:false}));
    }
  }
  applyIbdMachinedFinish(b,first);
}

export function addInspectionTorch(b: Builder) {
  const first=b.pos.length/3;
  // Inspection head faces the cargo (-z); the handgrip stays in the old tool pivot.
  b.tr([0, 0, 0], [-Math.PI / 2, 0, 0], () => {
    lathe(b, [[0, -.27], [.085, -.27], [.09, -.23], [.09, .04], [.145, .1], [.145, .19], [0, .19]], P.dark, { sides: 16 });
    for (const y of [-.19, -.12, -.05]) lathe(b, [[.089, y], [.098, y], [.098, y + .025], [.089, y + .025]], P.rubber, { sides: 16 });
    lathe(b, [[.11, .18], [.147, .18], [.147, .205], [.11, .205], [.11, .18]], cutSteel, { sides: 20, caps: false });
    lathe(b, [[0, .197], [.108, .197], [.108, .2], [0, .2]], P.pale, { sides: 20 });
  });
  cbox(b, [.04, .098, .04], [.065, .025, .09], P.amber, .008);
  applyIbdMachinedFinish(b,first);
}
export function addInspectionTools(b: Builder) {
  const first=b.pos.length/3;
  addInspectionTorch(b);
  // Caliper beam, fixed jaw, sliding jaw and an engraved scale.
  cbox(b, [.4, 0, 0], [.6, .045, .07], cutSteel, .008);
  for (const x of [.13, .5]) {
    cbox(b, [x, -.09, 0], [.045, .21, .065], cutSteel, .006);
    cbox(b, [x + (x < .2 ? .03 : -.03), -.185, 0], [.09, .035, .065], cutSteel, .006);
  }
  cbox(b, [.5, .02, 0], [.16, .1, .1], P.blue, .012);
  cbox(b, [.5, .073, 0], [.1, .008, .055], P.dark);
  for (let i = 0; i < 11; i++) cbox(b, [.21 + i * .043, .024, -.005], [.006, .003, i % 5 === 0 ? .05 : .026], winding);
  // Slider thumbwheel is fixed to the jaw carriage, clear of the measuring tips.
  b.tr([.51,-.025,.055],[Math.PI/2,0,0],()=>
    lathe(b,[[0,-.012],[.045,-.012],[.05,-.006],[.05,.012],[0,.012]],cutSteel,{sides:12}));
  applyIbdMachinedFinish(b,first);
}

/** Task-specific controls share the existing protected base and physical reach anchors. */
export function addYardControl(b: Builder, cube: IbdCube, x: number, z: number, kind: 'crane' | 'turn' | 'scale' | 'load' | 'dispatch') {
  cube([x, kind==='crane'?.4:.6, z], [.8, kind==='crane'?.8:1.2, .7], P.dark, true);
  cube([x, .09, z], [.95, .16, .84], P.steel);
  cube([x, kind==='crane'?.85:1.25, z], [1, .16, .9], P.amber);
  if (kind === 'scale' || kind === 'dispatch') {
    cube([x, 1.51, z - .15], [.72, .39, .25], P.dark, false, .025, [-.2, 0, 0]);
    cube([x, 1.55, z - .008], [.55, .19, .026], P.pale, false, .005, [-.2, 0, 0]);
    for (const dx of [-.18, 0, .18]) cube([x + dx, 1.37, z + .18], [.1, .035, .1], dx === .18 ? P.rust : P.green);
    if (kind === 'dispatch') cube([x + .3, 1.38, z + .26], [.17, .06, .23], P.steel);
  } else if (kind === 'turn') {
    b.tr([x, 1.49, z], [Math.PI / 2 - .5, 0, 0], () => {
      lathe(b, [[.19, -.035], [.25, -.035], [.25, .035], [.19, .035], [.19, -.035]], P.dark, { sides: 20, caps: false });
      for (let i = 0; i < 3; i++) bar(b, [0, 0, 0], [.22 * Math.cos(i * Math.PI * 2 / 3), 0, .22 * Math.sin(i * Math.PI * 2 / 3)], .018, P.steel, 6);
    });
    bar(b, [x, 1.3, z], [x, 1.49, z], .05, P.steel, 8);
  } else {
    // Crane levers are articulated scene-owned meshes sharing their pivots with the hands.
    for (const dx of kind === 'crane' ? [] : [0]) {
      bar(b, [x + dx, 1.3, z], [x + dx, 1.61, z + .13], .045, P.steel, 8);
      cube([x + dx, 1.65, z + .15], [.15, .16, .15], P.rubber, false, .035);
    }
    cube([x + .31, kind==='crane'?.96:1.36, z - .2], [.13, .06, .13], P.rust);
  }
}

export function buildIbdCraneLever(){
  const b=new Builder();
  bar(b,[0,0,0],[0,.14,.48],.045,P.steel,8);
  cbox(b,[0,.17,.5],[.15,.16,.15],P.rubber,.035);
  return b.build();
}

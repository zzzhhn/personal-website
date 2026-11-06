import { box, cbox, lathe, type Builder, type Surf, type V3 } from '../WorldStreetGeometry.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';
import type { CoilBayFinish } from './ibd-coil-bay';
import { IBD_CRANE_Y } from './ibd-yard-layout.ts';

const web: Surf = { color: '#be8c31', rough: .63, metal: .10 };
const flange: Surf = { color: '#d7aa51', rough: .58, metal: .16 };
const bearing: Surf = { color: '#778e98', rough: .51, metal: .31 };
const boards: Surf = { color: '#c79b69', rough: .82, metal: 0 };
const timberFrame: Surf = { color: '#ad8656', rough: .72, metal: 0 };
const backing: Surf = { color: '#795736', rough: .9, metal: 0 };

export function addIbdBridgeSample(b: Builder, z: number) {
  const y = IBD_CRANE_Y;
  // The web and both plates share faces at y-.27 and y+.28.
  cbox(b, [-17, y+.005, z], [27, .55, .35], web);
  cbox(b, [-17, y+.335, z], [27, .11, .5], flange);
  cbox(b, [-17, y-.33, z], [27, .12, .5], flange);
  // Fabricated web stiffeners and exposed, bolted end connections.
  for (const x of [-27,-22,-17,-12,-7]) for (const side of [-1,1])
    cbox(b,[x,y+.005,z+side*.205],[.055,.55,.06],flange,.006);
  for (const x of [-30, -3.8]) {
    cbox(b, [x, y-.385, z], [.76, .13, .56], bearing);
    for (const dx of [-.26,.26]) for (const dz of [-.18,.18])
      b.tr([x+dx,y-.301,z+dz],[0,0,0],()=>lathe(b,[[.032,0],[.032,.035],[0,.035]],P.cutSteel,{sides:6,caps:false}));
    // The bearing diaphragm covers the original post head between the stiffeners.
    cbox(b, [x, y-.132, z], [.425, .276, .496], bearing);
    for (const side of [-1, 1]) {
      cbox(b, [x+side*.25, y+.005, z], [.075, .55, .48], flange);
    }
  }
}

function timberFace(b: Builder, at: (along: number, across: number) => V3, outward: V3, seed: number) {
  const alongCuts = [0, .5, 1], acrossCuts = [0, .27, .63, 1];
  for (let row = 0; row < acrossCuts.length-1; row++) for (let col = 0; col < alongCuts.length-1; col++) {
    const a = alongCuts[col], c = alongCuts[col+1], v = acrossCuts[row], w = acrossCuts[row+1];
    const uv = [[a,v], [c,v], [c,w], [a,w]];
    const ids = b.face(uv.map(([u,t]) => at(u,t)), boards, outward);
    for (let j = 0; j < ids.length; j++) {
      const [u,t] = uv[j];
      const grain = Math.sin(t*21 + seed*2.1 + Math.sin(u*3+seed)*.68);
      const value = .97 + .12*grain + .045*Math.sin(seed*2.6);
      for (let channel = 0; channel < 3; channel++) b.col[ids[j]*3+channel] *= value;
    }
  }
}

export function addIbdStockCrateSample(b: Builder, x: number, y: number, z: number, finish?: CoilBayFinish) {
  const timber = (axis: 0 | 1 | 2, board: number, emit: () => void) => finish
    ? finish.markWood(emit, axis, board)
    : emit();
  b.tr([x,y,z], [0,0,0], () => {
    cbox(b, [0,-.022,0], [2.07, 1.456, 1.54], backing);
    for (let course = 0; course < 4; course++) {
      const bottom = -.742 + course*.36, top = bottom+.344;
      for (const side of [-1, 1]) {
        const ends = [side*.77,side*.802].sort((a,c) => a-c);
        const edges = [side*1.035,side*1.067].sort((a,c) => a-c);
        if (finish) {
          timber(0, course + (side > 0 ? 1 : 5), () => box(b, [-1.035,bottom,ends[0]], [1.035,top,ends[1]], boards));
          timber(2, course + (side > 0 ? 9 : 5), () => box(b, [edges[0],bottom,-.77], [edges[1],top,.77], boards));
        } else {
          box(b, [-1.035,bottom,ends[0]], [1.035,top,ends[1]], boards, 0, side > 0 ? { pz: null } : { nz: null });
          box(b, [edges[0],bottom,-.77], [edges[1],top,.77], boards, 0, side > 0 ? { px: null } : { nx: null });
          timberFace(b, (u,v) => [-1.035+2.07*u,bottom+(top-bottom)*v,side*.802], [0,0,side], course+side);
          timberFace(b, (u,v) => [side*1.067,bottom+(top-bottom)*v,-.77+1.54*u], [side,0,0], course+5+side);
        }
      }
    }
    for (let plank = 0; plank < 5; plank++) {
      const minX = -1.035+plank*.414, maxX = minX+.402;
      if (finish) timber(2, plank + 1, () => box(b, [minX,.683,-.8], [maxX,.727,.8], boards));
      else {
        box(b, [minX,.683,-.8], [maxX,.727,.8], boards, 0, { py: null });
        timberFace(b, (u,v) => [minX+(maxX-minX)*v,.727,-.8+1.6*u], [0,1,0], plank+11);
      }
    }
    for (const xx of [-.96,.96]) for (const zz of [-.785,.785]) {
      timber(1, xx > 0 ? 3 : 1, () => cbox(b, [xx,0,zz], [.23,1.50,.19], timberFrame, .012));
    }
    for (const zz of [-.85,.85]) for (const yy of [-.6,.6]) {
      timber(0, yy > 0 ? 2 : 4, () => cbox(b, [0,yy,zz], [2.18,.12,.1], timberFrame, .009));
    }
    for (const xx of [-1.052,1.052]) for (const yy of [-.6,.6]) {
      timber(2, yy > 0 ? 3 : 5, () => cbox(b, [xx,yy,0], [.096,.12,1.56], timberFrame, .008));
    }
    for (const zz of [-.73,.73]) timber(0, 5, () => cbox(b, [0,.768,zz], [2.18,.08,.1], timberFrame, .008));
    for (const xx of [-.66,0,.66]) timber(2, 6, () => cbox(b, [xx,-.84,0], [.22,.18,1.6], P.endgrain));
    for (const xx of [-.484,.484]) {
      cbox(b, [xx,0,.902], [.045,1.38,.018], P.blue);
      cbox(b, [xx,.773,0], [.045,.035,1.52], P.blue);
    }
    cbox(b, [0,.05,.811], [.46,.29,.018], P.pale);
    for (const dx of [-.13,-.05,.04,.12]) cbox(b, [dx,.05,.824], [.025,.18,.008], P.dark);
  });
}

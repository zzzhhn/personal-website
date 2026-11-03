import { Color, Uint8BufferAttribute, type BufferGeometry } from 'three';
import { cbox, type Builder, type V3 } from '../WorldStreetGeometry.ts';
import type { IbdCube } from './ibd-yard-architecture.ts';
import { IBD_MATERIALS as P } from './ibd-yard-palette.ts';

export const COIL_ROLE = { wall: 1, roof: 2, zinc: 3, frame: 4, soffit: 5, rearWall: 6 } as const;
type Role = typeof COIL_ROLE[keyof typeof COIL_ROLE];
const shades = {
  1: new Color('#aab5b2'), 2: new Color('#617e83'), 3: new Color('#a4b2b3'),
  4: new Color('#496471'), 5: new Color('#a6b3ab'), 6: new Color('#aab5b2'),
};

/** Per-vertex role, separate from the yard's light bake, ground flag and sign UV. */
export class CoilBayFinish {
  private readonly roles: number[] = [];
  constructor(private readonly builder: Builder) {}

  add(role: Role | ((i: number) => Role), emit: () => void, building = 0, paint?: string) {
    const b = this.builder;
    const start = b.pos.length / 3;
    const coat = paint ? new Color(paint) : null;
    emit();
    for (let i = start; i < b.pos.length / 3; i++) {
      const value = typeof role === 'function' ? role(i * 3) : role;
      const shade = coat && (value === COIL_ROLE.roof || value === COIL_ROLE.frame) ? coat : shades[value];
      this.roles[i] = value + building * 16;
      b.col[i * 3] = shade.r;
      b.col[i * 3 + 1] = shade.g;
      b.col[i * 3 + 2] = shade.b;
    }
  }

  bind(g: BufferGeometry) {
    const roles = new Uint8Array(g.getAttribute('position').count);
    for (let i = 0; i < this.roles.length; i++) roles[i] = this.roles[i] ?? 0;
    g.setAttribute('aIbdCladding', new Uint8BufferAttribute(roles, 1));
  }
}

/** Continuous pressed sheets over the inner side of the unchanged wall shell. */
export function addCoilBayWall(b: Builder, finish: CoilBayFinish, plane: number, start: number,
  end: number, h: number, inward = 1, rear = false, building = 0) {
  const count = Math.ceil((end - start) / 1.2);
  const point = (offset: number, y: number, along: number): V3 => rear
    ? [along, y, plane + inward * offset] : [plane + inward * offset, y, along];
  const box = (offset: number, y: number, along: number, depth: number, height: number, length: number, bevel: number) =>
    cbox(b, point(offset,y,along), rear ? [length,height,depth] : [depth,height,length], P.steel, bevel);
  finish.add(rear ? COIL_ROLE.rearWall : COIL_ROLE.wall, () => {
    for (let i = 0; i < count; i++) {
      const a = start + (end - start) * i / count;
      const width = (end - start) / count;
      const folds = [[0, 0], [.044, .056], [.12, .056], [.167, 0], [width, 0]];
      for (let j = 1; j < folds.length; j++) {
        const [z0, x0] = folds[j - 1], [z1, x1] = folds[j];
        b.face([point(x0,.68,a+z0),point(x1,.68,a+z1),point(x1,h-.04,a+z1),point(x0,h-.04,a+z0)],
          P.wall, rear ? [0,0,inward] : [inward,0,0]);
      }
    }
  }, building);
  finish.add(COIL_ROLE.zinc, () => {
    box(-.014,.685,(start+end)/2,.095,.055,end-start,.007);
    for (const z of [start, end-.026]) box(-.011,h/2+.33,z,.105,h-.68,.052,.006);
  }, building);
}

/** Folded eave cap and the short bearing that laps the front portal. */
export function addCoilBayEave(finish: CoilBayFinish, cube: IbdCube, x: number, h: number, side: number,
  start: number, front: number, building = 0, portals = [front]) {
  const middle = (start + front + .5) / 2, length = front + .5 - start;
  const folded = portals.length > 1;
  finish.add(COIL_ROLE.zinc, () => {
    cube([x + side * .23,h-.025,middle], [.048,.29,length], P.steel, false, folded ? 0 : .009);
    cube([x + side * .15,h+.112,middle], [.19,.036,length], P.steel, false, folded ? 0 : .008);
    cube([x + side * .145,h-.166,middle], [.18,.042,length], P.steel, false, folded ? 0 : .009);
    for (const z of portals) cube([x - side * .09,h-.183,z], [.57,.125,.30], P.steel, false, .01);
  }, building);
}

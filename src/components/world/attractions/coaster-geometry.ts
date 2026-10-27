import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { coasterFrame, coasterSupports, coasterWorld, COASTER_LENGTH, COASTER_TUNNEL, COASTER_INVERSION, COASTER_GATE_Z } from './coaster-track.ts';
import { COASTER_BOARDING } from './coaster-transition.ts';
import { INTENT_COASTER_FOOTPRINT } from './attraction-layout.ts';
import { addCoasterCliffs } from './coaster-landscape-cliffs.ts';
import { lightCoasterCliffs } from './coaster-landscape-lighting.ts';
import { INTENT_STATIONS } from './intent-stations.ts';
import { bakeIntentNight, INTENT_LAMP_POINTS } from './intent-lighting.ts';
import { addCoasterLandscape } from './coaster-landscape.ts';
import { addCoasterTerrainRelief } from './coaster-terrain-relief.ts';
import type { Vec3 } from '../types';

export const COASTER_PALETTE = { steel: '#526b79', dark: '#273e4e', rail: '#c2ccd1', concrete: '#a9aaa1', copper: '#c38c50', cyan: '#69dedb', gold: '#ffcc83', white: '#d9ddd5' };
const P = COASTER_PALETTE;
export class CoasterBatch {
  parts: BufferGeometry[] = [];
  readonly lightingOrigin: Vec3;
  constructor(lightingOrigin: Vec3 = [0, 0, 0]) { this.lightingOrigin = lightingOrigin; }
  add(geometry: BufferGeometry, color: string, matrix?: Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    const c = new Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(colors, 3)); bakeIntentNight(g, this.lightingOrigin); lightCoasterCliffs(g, this.lightingOrigin); this.parts.push(g);
  }
  box(position: Vec3, size: Vec3, color: string, rotation?: Quaternion) {
    const segments = size.map(v => Math.min(16, Math.max(1, Math.ceil(v / 4)))) as Vec3;
    this.add(new BoxGeometry(...size, ...segments), color, new Matrix4().compose(new Vector3(...position), rotation ?? new Quaternion(), new Vector3(1, 1, 1)));
  }
  beam(a: Vec3, b: Vec3, radius: number, color: string, sides = 6) {
    const start = new Vector3(...a), end = new Vector3(...b), d = end.clone().sub(start);
    if (d.lengthSq() < .00001) return;
    this.add(new CylinderGeometry(radius, radius, d.length(), sides, 1), color,
      new Matrix4().compose(start.add(end).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()), new Vector3(1, 1, 1)));
  }
  housing(position: Vec3, size: Vec3, color: string) {
    const [w, h, d] = size, cut = Math.min(.65, h * .2, w * .15), shape = new Shape();
    shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2); shape.lineTo(w / 2, h / 2 - cut);
    shape.lineTo(w / 2 - cut, h / 2); shape.lineTo(-w / 2 + cut, h / 2); shape.lineTo(-w / 2, h / 2 - cut); shape.closePath();
    let geometry: BufferGeometry = new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    if (h > 20) {
      // Static point-light spill needs interior samples on tall wall faces.
      // Only the service-tower shells need this; small housings stay unchanged.
      const sampled = new TessellateModifier(8, 6).modify(geometry);
      geometry.dispose(); geometry = sampled;
    }
    this.add(geometry, color, new Matrix4().makeTranslation(position[0], position[1], position[2] - d / 2));
  }
  finish() {
    const g = mergeGeometries(this.parts, false) ?? new BufferGeometry();
    this.parts.forEach(p => p.dispose()); this.parts.length = 0;
    g.computeBoundingSphere(); return g;
  }
}
const tuple = (v: Vector3) => v.toArray() as Vec3;
export interface CoasterCollider { position: Vec3; half: Vec3; rotation?: Vec3; surface?: boolean }
export function createCoasterStructure(detailed: boolean) {
  const steel = new CoasterBatch(), glow = new CoasterBatch(), colliders: CoasterCollider[] = [];
  const steps = detailed ? 800 : 256;
  for (let i = 0; i < steps; i++) {
    const a = coasterFrame(i / steps), b = coasterFrame((i + 1) / steps);
    for (const offset of [-.78, .78]) steel.beam(tuple(a.point.clone().addScaledVector(a.side, offset)), tuple(b.point.clone().addScaledVector(b.side, offset)), .11, P.rail);
    if (i % 3 === 0) steel.beam(tuple(a.point.clone().addScaledVector(a.side, -1)), tuple(a.point.clone().addScaledVector(a.side, 1)), .09, P.copper);
    if (i % 4 === 0) {
      const c = coasterFrame((i + 4) / steps);
      const spine = (f: ReturnType<typeof coasterFrame>) => f.point.clone().addScaledVector(f.up, -Math.min(.42, Math.max(.15, f.point.y - 1.45)));
      const spineA = spine(a), spineB = spine(c);
      steel.beam(tuple(spineA), tuple(spineB), .3, P.dark, 4);
      steel.beam(tuple(a.point.clone().addScaledVector(a.side, -.75)), tuple(spineB), .065, P.steel, 4);
    }
    if (i % 8 !== 7) for (const side of [-1, 1]) {
      const lightA = a.point.clone().addScaledVector(a.side, side * .98).addScaledVector(a.up, -.12);
      const lightB = b.point.clone().addScaledVector(b.side, side * .98).addScaledVector(b.up, -.12);
      const tint = Math.abs(i / steps - COASTER_INVERSION.top) < .025 ? '#ed7bb6' : '#37dce8';
      for (const axis of ['side', 'up'] as const) {
        const vertices = [lightA.clone().addScaledVector(a[axis], -.12), lightB.clone().addScaledVector(b[axis], -.12), lightB.clone().addScaledVector(b[axis], .12), lightA.clone().addScaledVector(a[axis], .12)];
        const order = axis === 'side' ? [0, 2, 1, 0, 3, 2] : side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        const strip = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(order.flatMap(v => vertices[v].toArray())), 3));
        strip.computeVertexNormals(); glow.add(strip, tint);
      }
    }
  }
  for (const { a, b, top } of coasterSupports(detailed)) {
    for (const p of [a, b]) {
      steel.beam([p.x, 1.2, p.z], tuple(p), .38, P.steel);
      steel.housing([p.x, 1.4, p.z], [2.1, .8, 2.1], P.concrete);
      colliders.push({ position: [p.x, (p.y + 1.2) / 2, p.z], half: [.38, (p.y - 1.2) / 2, .38] }, { position: [p.x, 1.4, p.z], half: [1.05, .4, 1.05] });
    }
    steel.beam(tuple(a), tuple(b), .3, P.dark);
    if(a.distanceTo(top)>3) steel.beam(tuple(b),tuple(top),.36,P.dark);
    if (top.y > 9) {
      steel.beam([a.x, 1.6, a.z], tuple(b), .15, P.steel);
      steel.beam([b.x, 1.6, b.z], tuple(a), .15, P.steel);
    }
  }
  addArchitecture(steel, glow, colliders, detailed);
  addTunnel(steel, glow, detailed);
  const art = addCoasterLandscape(steel, glow, colliders, detailed);
  addCoasterCliffs(steel, glow, colliders);
  const relief = addCoasterTerrainRelief(steel);
  return { steel: steel.finish(), glow: glow.finish(), colliders, art, relief };
}

function addTunnel(steel: CoasterBatch, glow: CoasterBatch, detailed: boolean) {
  const { start, end } = COASTER_TUNNEL, count = detailed ? 18 : 9;
  const bayLength = (end - start) * COASTER_LENGTH / count;
  for (let i = 0; i <= count; i++) {
    const f = coasterFrame(start + (end - start) * i / count);
    const p = (side: number, up: number) => tuple(f.point.clone().addScaledVector(f.side, side).addScaledVector(f.up, up));
    for (const side of [-3, 3]) {
      steel.beam(p(side, -.4), p(side, 4.25), .22, P.steel);
      glow.beam(p(side * .92, .2), p(side * .92, 4.1), .075, i % 3 ? P.cyan : P.gold, 4);
      if (i < count) steel.box(p(side, 1.5), [bayLength, 3.1, .3], i % 3 ? P.concrete : P.steel, f.rotation);
    }
    steel.beam(p(-3, 4.25), p(3, 4.25), .22, P.steel);
    glow.beam(p(-2.76, 4.1), p(2.76, 4.1), .075, i % 3 ? P.cyan : P.gold, 4);
    if (i < count) steel.box(p(0, 4.5), [bayLength, .45, 6.4], P.dark, f.rotation);
  }
}

/** The service tower stays west of the crest; all dimensions here use actual metres. */
export function addCoasterTower(steel: CoasterBatch, glow: CoasterBatch, colliders: CoasterCollider[], detailed: boolean) {
  const box = (p: Vec3, size: Vec3, color: string, solid = true, surface = false) => {
    steel.box(coasterWorld(p), size, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3, surface });
  };
  const shell = (p: Vec3, size: Vec3, color: string) => {
    steel.housing(coasterWorld(p), size, color);
    colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3 });
  };
  const beam = (a: Vec3, b: Vec3, radius: number, color = P.steel, sides = 6) =>
    steel.beam(coasterWorld(a), coasterWorld(b), radius, color, sides);
  const light = (p: Vec3, size: Vec3, color = P.gold) => glow.box(coasterWorld(p), size, color);
  // Recessed machinery core and four load-bearing corners replace the uninterrupted white wall.
  shell([-40, 27, -80], [5.8, 54, 7.8], P.dark);
  for (const x of [-42.95, -37.05]) for (const z of [-83.95, -76.05]) {
    shell([x, 26.6, z], [1.1, 53.2, 1.1], P.white);
    shell([x, 1.1, z], [1.5, 2.2, 1.5], P.concrete);
    for (const y of [8.3, 22, 38, 51.6]) box([x, y, z], [1.18, .32, 1.18], P.steel, false);
  }
  // The existing western service spine remains; braces and equipment break up its long silhouette.
  shell([-44.2, 22.09, -81], [2, 44.18, 6], P.dark);
  shell([-40, 3.682, -73.8], [12, 7.364, 4], P.concrete);
  for (const y of [10.5, 24.5, 39.5]) {
    shell([-44.9, y, -81], [.6, 6.2, 4.7], P.steel);
    for (const z of [-83.6, -78.4]) beam([-45.05, y - 3.1, z], [-45.05, y + 3.1, z], .13, P.rail);
    beam([-45.08, y - 2.8, -83.4], [-45.08, y + 2.8, -78.6], .11, P.copper);
  }
  // Layered east-facing casings keep their outer skin inside the original tower's rail-side boundary.
  for (const [y, h] of [[6, 8], [17, 9], [31, 10], [45, 8]]) {
    shell([-36.72, y, -80], [.32, h, 5.1], P.white);
    box([-36.53, y - h / 2 + .45, -80], [.08, .38, 4.5], P.copper, false);
    box([-36.52, y + h / 2 - .55, -80], [.08, .5, 4.5], P.steel, false);
  }
  for (const y of [11.4, 23.7, 38.3, 50.2]) {
    // Short glazed recesses sit between opaque panels; only their inner lower sill emits light.
    box([-36.96, y, -80], [.2, 1.65, 4.8], P.steel);
    box([-36.83, y, -80], [.08, 1.23, 4.25], P.dark, false);
    for (const z of [-81.4, -80, -78.6]) box([-36.76, y, z], [.14, 1.5, .12], P.rail, false);
    light([-36.77, y - .53, -80], [.06, .12, 3.9], P.cyan);
  }
  for (const y of [10, 26, 42]) {
    box([-36.3, y, -80], [.4, .45, .9], P.dark);
    light([-36.075, y - .12, -80], [.06, .13, .65]);
  }
  // Front equipment bays are inset between the corners, rather than pasted over a continuous wall.
  for (const [y, h] of [[12, 6], [25.8, 9.2], [42, 10]]) {
    shell([-40, y, -75.96], [4.3, h, .35], P.steel);
    for (const x of [-41.35, -38.65]) {
      shell([x, y, -75.65], [.9, h - 1.3, .35], P.white);
      beam([x, y - h / 2 + .3, -75.35], [x, y + h / 2 - .3, -75.35], .12, P.copper);
    }
    for (let i = 0; i < (detailed ? 5 : 3); i++) box([-40, y - 1 + i * .5, -75.7], [1.2, .17, .18], P.dark, false);
  }
  // Four staff platforms retain the original footprint, now with a deck, knee braces and solid guardrails.
  for (const y of [5, 15, 28, 41].map(v => v * 54 / 44)) {
    box([-40, y, -74.95], [8.5, 1.227, 2.3], P.steel, true, true);
    box([-40, y + .65, -74.95], [8.1, .08, 2.08], P.concrete, false);
    for (const x of [-43.8, -40, -36.2]) {
      box([x, y + 1.22, -73.88], [.13, 1.2, .13], P.copper);
      if (x !== -40) beam([x, y - 2.4, -75.5], [x, y - .65, -74.05], .16, P.steel);
    }
    for (const height of [.95, 1.8]) {
      box([-40, y + height, -73.88], [7.73, .11, .11], P.copper);
      for (const x of [-43.8, -36.2]) box([x, y + height, -74.9], [.11, .11, 2.14], P.copper);
    }
    // Bulkhead fixtures correspond to the existing baked warm pools on the front facade.
    box([-40, y + 2.2, -75.6], [1.5, .48, .32], P.dark, false);
    light([-40, y + 2.14, -75.4], [1.14, .21, .09]);
    box([-42.3, y + 1.45, -75.62], [.8, 1.35, .24], P.dark, false);
    light([-42.3, y + 1.9, -75.47], [.4, .16, .08]);
  }
  // A capped drive head gives the summit a readable termination without reaching across the rails.
  shell([-40, 53.8, -80], [7, 1.2, 9], P.steel);
  shell([-40.7, 54.8, -80.7], [3.7, 1.1, 4.5], P.dark);
  for (const z of [-82, -79.4]) beam([-42.7, 54.45, z], [-38.7, 54.45, z], .25, P.copper, 8);
  beam([-42.6, 54.4, -82.9], [-42.6, 56, -82.9], .08);
  light([-42.6, 56, -82.9], [.24, .4, .24]);
  // Low cabinets and louvres give the foot of the tower human scale; no guest ladder is implied.
  for (const x of [-43.5, -36.5]) {
    shell([x, 2.8, -71.93], [2.2, 4.6, .4], P.steel);
    for (let i = 0; i < 5; i++) box([x, 1.5 + i * .5, -71.69], [1.6, .16, .12], P.dark, false);
  }
  if (detailed) for (const y of [8.3, 22, 38, 51.6]) {
    for (const x of [-42.95, -37.05]) for (const dz of [-.26, .26])
      beam([x + dz, y, -75.44], [x + dz, y, -75.35], .075, P.copper);
    for (const z of [-83.95, -76.05]) for (const dy of [-.3, .3])
      beam([-36.46, y + dy, z], [-36.38, y + dy, z], .075, P.copper);
  }
}

/** Folded roof stays wholly inside the original station canopy collision volume. */
export function addCoasterStationRoof(steel: CoasterBatch) {
  const section = new Shape();
  [[-9,6.2],[9,6.2],[9,6.55],[6.7,7.4],[-6.7,7.4],[-9,6.55]].forEach(([x,y],i)=>i?section.lineTo(x,y):section.moveTo(x,y));
  section.closePath();
  steel.add(new ExtrudeGeometry(section,{depth:23,bevelEnabled:false}),P.steel,
    new Matrix4().makeTranslation(...coasterWorld([-2,0,30])));
}

/** Static architecture only: existing solids and all luminous geometry retain their owners. */
export function addCoasterBuildingArt(steel: CoasterBatch, detailed: boolean) {
  const box=(p:Vec3,size:Vec3,color:string)=>steel.box(coasterWorld(p),size,color);
  const shell=(p:Vec3,size:Vec3,color:string)=>steel.housing(coasterWorld(p),size,color);
  const beam=(a:Vec3,b:Vec3,r:number,color=P.copper)=>steel.beam(coasterWorld(a),coasterWorld(b),r,color,6);
  // The open boarding hall reads as a roof carried by real columns, not a floating black slab.
  for(const x of [-10,6])for(const z of [31,x<0?43:51]){
    shell([x,.5,z],[1.14,1,1.14],P.steel);
    box([x,5.8,z],[1.14,.7,1.14],P.copper);
    beam([x,4.75,z],[x+(x<0?.42:-.42),6.15,z],.095,P.rail);
  }
  for(const z of [31.2,42.8,51.1])box([-2,6.24,z],[17.8,.28,.35],P.rail);
  for(const x of [-8.65,4.65])box([x,7.4,41.5],[.12,.06,22.8],P.copper);
  // Deep, chamfered front fascia frames the existing warm entrance light and open aisle.
  for(const x of [-9,5])shell([x,6.77,52.95],[3.6,1.05,.14],P.white);
  box([-2,7.2,52.98],[10.4,.32,.16],P.copper);
  box([-2,6.75,53.02],[6.8,.46,.08],P.dark);
  for(const x of [-4.7,-3.8,-2.9,-2,-1.1,-.2,.7])box([x,6.77,53.075],[.32,.12,.035],P.rail);
  // East annex: opaque lower panels, inset clerestory bays and full-height structural piers.
  for(const z of [36.32,40.7,45.2,49.68])box([10,3.15,z],[5.5,4.9,.64],P.white);
  for(const y of [.4,5.9])box([10,y,43],[5.5,.6,14],P.white);
  for(const z of [38.5,43,47.5]){
    shell([12.78,1.55,z],[.12,1.75,3.35],P.white);
    shell([12.78,5.1,z],[.12,1.0,3.35],P.white);
    box([12.8,3.45,z],[.07,1.5,3.05],P.dark);
    for(const y of [2.64,4.26])box([12.84,y,z],[.12,.13,3.3],P.copper);
    box([12.87,3.45,z],[.08,1.55,.1],P.rail);
  }
  // Closed service door is visibly distinct from the open passenger hall.
  shell([10,2.35,50.06],[2.6,4.1,.14],P.steel);
  box([10,2.35,50.15],[2.12,3.65,.08],P.dark);
  box([10,4.57,50.12],[3.8,.28,.22],P.copper);
  box([10.72,2.15,50.23],[.1,.48,.1],P.rail);
  for(const x of [8.85,11.15])box([x,.5,50.14],[.32,.5,.14],P.copper);
  // The small western service volume shares the same footing/header vocabulary.
  for(const z of [31.35,38.65])box([-14.5,2.7,z],[5,4,.7],P.white);
  for(const y of [.35,5.05])box([-14.5,y,35],[5,.7,8],P.white);
  for(const z of [33.2,36.8]){
    box([-17.04,2.7,z],[.1,3.3,2.5],P.dark);
    for(const y of [1.5,2.7,3.9])box([-17.11,y,z],[.12,.12,2.5],P.rail);
  }
  // Equipment buildings use corner posts and broad service bays within their retained shells.
  const equipment=(cx:number,base:number,cz:number,w:number,h:number,d:number)=>{
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=cx+sx*(w/2-.32),z=cz+sz*(d/2-.32);
      shell([x,base+h/2,z],[.64,h,.64],P.white);
      box([x,base+.45,z],[.65,.9,.65],P.copper);
    }
    for(const y of [base+.2,base+h*.48,base+h-.2]){
      for(const side of [-1,1])box([cx,y,cz+side*(d/2-.08)],[w-.65,.32,.2],P.white);
      for(const side of [-1,1])box([cx+side*(w/2-.08),y,cz],[.2,.32,d-.65],P.white);
    }
    for(const side of [-1,1]){
      const x=cx+side*(w/2+.035);
      for(const y of [base+h*.24,base+h*.74]){
        box([x,y,cz],[.1,h*.34,d-1.8],P.dark);
        box([x+side*.065,y,cz],[.1,h*.36,.28],P.copper);
        if(detailed)for(const z of [cz-1.6,cz+1.6]){
          box([x+side*.065,y,z],[.08,h*.32,.1],P.rail);
          for(const dy of [-.7,.7])beam([x,y+dy,z],[x+side*.13,y+dy,z],.075,P.copper);
        }
      }
    }
    const front=cz+d/2+.055;
    for(const x of [cx-w*.32,cx+w*.32]){
      shell([x,base+h*.27,front],[w*.18,h*.42,.13],P.white);
      shell([x,base+h*.75,front],[w*.18,h*.37,.13],P.white);
    }
    box([cx,base+h-.75,front],[w*.5,.38,.18],P.copper);
    if(detailed)for(const x of [cx-w*.32,cx+w*.32])for(const y of [base+h*.12,base+h*.43,base+h*.6,base+h*.9])
      beam([x,y,front+.06],[x,y,front+.16],.085,P.rail);
  };
  equipment(-36,0,13,9,10.8,9);
  equipment(24,5,-92,10,7.6,8);
  if(detailed){
    // Connection plates and fasteners are close-range accents, not a second far-LOD silhouette.
    for(const z of [36.32,40.7,45.2,49.68])for(const y of [.8,5.5]){
      box([12.82,y,z],[.13,.4,.42],P.steel);
      beam([12.88,y,z],[12.98,y,z],.075,P.copper);
    }
    for(const x of [-9,5])for(const y of [6.55,7.05])beam([x,y,53.03],[x,y,53.15],.09,P.copper);
  }
}

function addArchitecture(steel: CoasterBatch, glow: CoasterBatch, colliders: CoasterCollider[], detailed: boolean) {
  const box = (p: Vec3, size: Vec3, color: string, solid = false, surface = false) => {
    steel.box(coasterWorld(p), size, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3, surface });
  };
  const housing = (p: Vec3, size: Vec3, color: string, solid = true, inset = 0) => {
    // Recess only these building cores behind their cladding; retain the original collision shell.
    steel.housing(coasterWorld(p), size.map(v=>v-inset*2) as Vec3, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3 });
  };
  const light = (p: Vec3, size: Vec3, color = P.gold) => glow.box(coasterWorld(p), size, color);
  const beam = (a: Vec3, b: Vec3, radius: number, color = P.steel) => steel.beam(coasterWorld(a), coasterWorld(b), radius, color);
  // Warm, deep station frontage. The central aisle and actual boarding apron stay level.
  box([0, .04, 60.5], [110, .08, 9], P.concrete, true, true);
  box([-2, .04, 41.5], [18, .08, 23], P.concrete, true, true);
  box([0, .04, 55], [10, .08, 8], P.concrete, true, true);
  // Functional boarding passage: six real treads and a flush bridge to the stopped car.
  for (const step of [...COASTER_BOARDING.stairs, COASTER_BOARDING.threshold]) {
    steel.box(step.position, step.size, P.concrete, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), step.yaw));
    colliders.push({ position: step.position, half: step.size.map(v => v / 2) as Vec3, rotation: [0, step.yaw, 0], surface: true });
  }
  addCoasterStationRoof(steel);
  colliders.push({position:coasterWorld([-2,6.8,41.5]),half:[9,.6,11.5]});
  for (const x of [-10, 6]) for (const z of [31, x < 0 ? 43 : 51]) {
    housing([x, 3.1, z], [1.1, 6.2, 1.1], P.white);
    light([x - Math.sign(x) * .58, 3.8, z], [.08, 1.8, .5], P.gold);
  }
  housing([10, 3.1, 43], [5.5, 6.2, 14], P.steel, true, .06);
  housing([-14.5, 2.7, 35], [5, 5.4, 8], P.steel, true, .06);
  for (const z of [34, 39, 44, 49]) {
    light([-5, 5.9, z], [5, .15, .25]);
    box([7.17, 2.7, z], [.15, 1.6, 2.8], P.dark);
    light([7.06, 3.25, z], [.06, .3, 2.5], P.cyan);
  }
  box([-2, 7.55, 40], [9, .3, 6], P.steel);
  housing([10, 6.6, 43], [3.8, .8, 8], P.dark, false);
  addCoasterTower(steel, glow, colliders, detailed);
  // A tangible equipment house inside the descending helix, plus a separate rear power block.
  housing([-36, 5.4, 13], [9, 10.8, 9], P.steel, true, .06);
  housing([-36, 11.3, 13], [10.2, 1, 10.2], P.dark);
  housing([-35, 12.6, 13], [3.5, 1.6, 3.5], P.steel, false);
  housing([24, 8.8, -92], [10, 7.6, 8], P.steel, true, .06);
  housing([24, 13.1, -92], [10.8, 1, 8.8], P.dark);
  for (const x of [-39.5, -32.5]) light([x, 8.7, 17.58], [.3, 2.8, .1], P.cyan);
  for (let i = 0; i < 5; i++) {
    box([-36, 4.2 + i * .48, 17.58], [4.5, .18, .14], P.dark);
    box([24, 8 + i * .45, -87.94], [5, .16, .12], P.dark);
  }
  beam([-30.8, 1.2, 10], [-30.8, 8.7, 10], .42, P.copper);
  beam([-30.8, 8.7, 10], [-33, 8.7, 10], .42, P.copper);
  addCoasterBuildingArt(steel, detailed);
  // Layered service structure is staff-only; closed stair access distinguishes it from the route to the ride.
  const deck = (p: Vec3, size: Vec3) => {
    box(p, size, P.concrete, true, true);
    const [x, y, z] = p, [w, , d] = size;
    for (const sx of [-1, 1]) beam([x + sx * w / 2, y + 1.2, z - d / 2], [x + sx * w / 2, y + 1.2, z + d / 2], .055, P.copper);
    for (let at = -d / 2; at <= d / 2; at += 3) for (const sx of [-1, 1]) beam([x + sx * w / 2, y, z + at], [x + sx * w / 2, y + 1.2, z + at], .055, P.copper);
  };
  deck([-51, 15.5, -5], [2.4, .45, 38]);
  deck([-47.7, 15.5, -24], [9, .45, 2.4]);
  deck([-44.5, 15.5, 14], [15.4, .45, 2.4]);
  for (const z of [-23, -8, 7]) housing([-51, 7.75, z], [.7, 15.5, .7], P.steel);
  for (let i = 0; i < 16; i++) box([-38.5 + i * .24, 15.3 - i * .23, 14], [.35, .2, 2], P.steel);
  // The irregular fence follows the surveyed coast, keeping the established central gate.
  const boundary = [[-54,56],[54,56], ...INTENT_COASTER_FOOTPRINT.slice(5).map(([x,z]) => [x-50,z+195])];
  for (let i=0;i<boundary.length;i++) {
    const a=boundary[i], b=boundary[(i+1)%boundary.length];
    const sections=i===0?[[a,[-5,56]],[[5,56],b]]:[[a,b]];
    for(const [from,to] of sections){
      const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz),yaw=-Math.atan2(dz,dx);
      // The open railings need open collision too. A full-height invisible wall
      // collapsed a legal walking orbit to 13 cm beside the station entrance.
      for(const y of [1,2.7]) {
        beam([from[0],y,from[1]],[to[0],y,to[1]],.08);
        colliders.push({position:coasterWorld([(from[0]+to[0])/2,y,(from[1]+to[1])/2]),half:[length/2,.08,.08],rotation:[0,yaw,0]});
      }
      for(let d=0;d<length;d+=5) housing([from[0]+dx*d/length,1.6,from[1]+dz*d/length],[.32,3.2,.32],P.concrete);
    }
  }
  for (const x of [-5.8, 5.8]) {
    housing([x, 3.3, COASTER_GATE_Z], [1.6, 6.6, 1.8], P.white);
    light([x, 3.5, COASTER_GATE_Z + .92], [.25, 2.3, .1], P.cyan);
  }
  housing([0, 6.4, COASTER_GATE_Z], [13.2, 1.3, 2], P.dark);
  if (detailed) {
    for (let i = 0; i < 6; i++) box([8.5 + i * .6, 6.9, 43], [.25, .35, 5.5], P.rail);
    for (const x of [-41, -31]) beam([x, 12, 8], [x, 12, 18], .07, P.copper);
    for (const z of [8, 18]) beam([-41, 12, z], [-31, 12, z], .07, P.copper);
    // Ladder is fenced staff access, not an implied guest route.
    for (const x of [-52, -51]) beam([x, .2, -23], [x, 15.7, -23], .08);
    for (let y = .4; y < 15.6; y += .5) beam([-52, y, -23], [-51, y, -23], .06);
    housing([-51.5, 1.8, -22.6], [1.5, 3.6, .2], P.dark);
  }
  for (const p of INTENT_LAMP_POINTS.filter(([x]) => x < -27 || x > -5)) {
    const [x, y, z] = p; housing([x, y / 2, z], [.4, y, .4], P.dark);
    light([x, y - .45, z], [.22, .7, .22]);
    housing([x, .2, z], [1.1, .4, 1.1], P.concrete);
  }
}

export function createCoasterCar() {
  const b = new CoasterBatch();
  b.box([0, .27, 0], [2.9, .35, 1.85], P.copper);
  b.box([1.4, .65, 0], [.15, .55, 1.8], P.dark);
  b.box([0, .64, 0], [1.1, .16, 1.22], P.dark);
  b.box([-.53, 1.05, 0], [.18, .85, 1.25], P.dark);
  for (const side of [-.85, .85]) {
    // Left-side opening spans local X .25..1.325, directly beside the footwell.
    if (side < 0) b.box([-.575, .75, side], [1.65, .35, .15], P.steel);
    else b.box([-.1, .75, side], [2.6, .35, .15], P.steel);
    b.beam([1.25, .5, side], [1.25, 1.22, side], .065, P.rail);
    for (const x of [-1, 1]) b.beam([x, .08, side - .15], [x, .08, side + .15], .26, P.dark);
  }
  b.beam([1.25, 1.22, -.85], [1.25, 1.22, .85], .065, P.rail);
  b.box([1.46, .7, 0], [.03, .12, 1.2], P.cyan);
  return b.finish();
}

export function createIntentMicroBase(id: 'route' | 'press' | 'visitor', passed: readonly string[] = []) {
  const b = new CoasterBatch(coasterWorld(INTENT_STATIONS.find(s => s.id === id)!.origin));
  if (id === 'route') {
    for (const z of [-.5, .2, .85]) b.beam([-2.6, 1.4, z], [2.6, 1.4, z], .035, P.rail);
    for (const x of [-1.9, 0, 1.9]) b.box([x, 1.52, .85], [.65, .18, .65], P.concrete);
    b.beam([-1.9, 1.55, .85], [-1.9, 2.35, .85], .12, P.white);
    b.box([0, 1.78, .85], [.7, .6, .65], P.copper);
    b.beam([1.6, 1.5, .85], [1.6, 2.1, .85], .06, P.steel);
    b.beam([2.2, 1.5, .85], [2.2, 2.1, .85], .06, P.steel);
    b.beam([1.6, 2.1, .85], [2.2, 2.1, .85], .06, P.steel);
    for (let i = 0; i < 4; i++) b.box([-1.8 + i * 1.2, 1.43, -1], [.65, .15, .4], P.dark);
    for (let i = 0; i < 3; i++) {
      b.box([-.7 + i * .7, 1.55, -1], [.35, .1, .32], passed.includes('T1') ? P.cyan : P.steel);
      if (passed.includes('T2')) b.beam([-1.9 + i * 1.9, 1.58, .5], [-1.9 + i * 1.9, 1.58, .78], .07, P.cyan);
    }
    if (passed.includes('T6')) b.box([-.7, 1.65, -1], [.5, .1, .12], P.gold);
    if (passed.includes('T5')) b.beam([-.4, 1.43, -.5], [.4, 1.43, .2], .065, P.cyan);
  } else if (id === 'press') {
    for (const x of [-1.55, 1.55]) {
      b.box([x, 1.5, 0], [1.5, .3, 1.9], P.concrete);
      for (const side of [-.65, .65]) b.box([x + side, 2, -.25], [.15, 1, .3], P.copper);
      b.box([x, 2.4, -.25], [1.6, .18, .35], P.dark);
    }
    b.beam([-2.2, 2, -.25], [-.9, 2, -.25], .32, P.steel);
    b.box([1.55, 1.9, -.25], [1.2, .18, .9], P.steel);
  } else {
    b.box([-.8, 1.8, -.2], [.65, 1.1, .45], P.copper);
    b.add(new CylinderGeometry(.3, .35, .55, 5), P.white, new Matrix4().makeTranslation(-.8, 2.6, -.2));
    b.beam([-.95, 1.5, -.2], [-1.1, 1.28, .3], .11, P.dark);
    b.beam([-.6, 1.5, -.2], [-.35, 1.28, .3], .11, P.dark);
    b.box([1, 1.45, .25], [1.3, .18, 1.3], P.copper);
    b.beam([1.6, 1.5, .25], [1.6, 2.45, .25], .07, P.steel);
    b.beam([1.6, 2.45, .25], [1, 2.45, .25], .07, P.steel);
    b.box([-.1, 1.47, .8], [.8, .05, .5], P.white);
    for (let i = 0; i < 3; i++) b.box([-.1, 1.5, .63 + i * .15], [.6, .015, .04], passed.includes('T7') ? P.cyan : P.dark);
  }
  if (id !== 'visitor') {
    b.beam([-2.9, 1.4, 1.4], [-2.9, 1.7, 1.4], .19, P.copper);
    b.box([-2.9, 1.72, 1.4], [.5, .06, .18], P.white);
  }
  return b.finish();
}

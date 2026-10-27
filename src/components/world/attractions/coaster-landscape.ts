import { BufferAttribute, BufferGeometry, IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { coasterFrame, coasterWorld } from './coaster-track.ts';
import type { CoasterBatch, CoasterCollider } from './coaster-geometry.ts';
import { onCoasterCliffWalk } from './coaster-landscape-cliffs.ts';
import { coasterInfieldHeight, onCoasterInfieldWalk, COASTER_INFIELD_LAMPS } from './coaster-terrain-relief.ts';
import type { Vec3 } from '../types';

const STONE = ['#777f82', '#899292', '#a2a69c', '#616f76'];
const LEAF = ['#355943', '#527247', '#68804b', '#899254'];
const frames = Array.from({ length: 900 }, (_, i) => coasterFrame(i / 900));
// Candidate placement checks preserve the rail/head envelope before mesh-level ray tests.
function clear(p: Vec3, half: Vec3, margin = 1.7) {
  if (onCoasterCliffWalk(p[0],p[2],Math.max(half[0],half[2])+2)) return false;
  if (onCoasterInfieldWalk(p[0],p[2],Math.max(half[0],half[2])+1)) return false;
  const world = new Vector3(...coasterWorld(p));
  return frames.every(f => {
    const points = [f.point, f.point.clone().addScaledVector(f.up, 2.2)];
    return points.every(q => Math.abs(q.x - world.x) > half[0] + margin || Math.abs(q.y - world.y) > half[1] + margin || Math.abs(q.z - world.z) > half[2] + margin);
  });
}
function facet(batch: CoasterBatch, p: Vec3, size: Vec3, color: string, seed: number) {
  const g = new IcosahedronGeometry(1, 0), q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), seed * 1.37);
  batch.add(g, color, new Matrix4().compose(new Vector3(...coasterWorld(p)), q, new Vector3(...size)));
}
function rock(batch: CoasterBatch, p: Vec3, size: Vec3, seed: number) {
  // Three irregular rings produce a readable broad top and broken vertical cliff faces.
  const vertices: number[] = [], colors: string[] = [], rings: Vec3[][] = [];
  for (let ring = 0; ring < 3; ring++) rings.push(Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4 + seed * .13, radius = (ring === 0 ? 1 : ring === 1 ? .9 : .72) * (1 + Math.sin(i * 5.8 + seed) * .13);
    return [p[0] + Math.cos(angle) * size[0] * radius, p[1] + size[1] * (ring === 0 ? -.5 : ring === 1 ? .22 : .5), p[2] + Math.sin(angle) * size[2] * radius];
  }));
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: string) => { vertices.push(...coasterWorld(a), ...coasterWorld(b), ...coasterWorld(c)); colors.push(color); };
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    for (let k = 0; k < 2; k++) {
      triangle(rings[k][i], rings[k + 1][j], rings[k][j], STONE[(i + k + seed) % 4]);
      triangle(rings[k][i], rings[k + 1][i], rings[k + 1][j], STONE[(i + k + seed) % 4]);
    }
    triangle([p[0], p[1] + size[1] * .5, p[2]], rings[2][(i + 1) % 8], rings[2][i], '#66734e');
  }
  // Group by palette to preserve flat face colour after merging.
  for (const color of new Set(colors)) {
    const positions = colors.flatMap((c, i) => c === color ? vertices.slice(i * 9, i * 9 + 9) : []);
    const g = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3)); g.computeVertexNormals(); batch.add(g, color);
  }
}
export function addCoasterLandscape(steel: CoasterBatch, glow: CoasterBatch, colliders: CoasterCollider[], detailed: boolean) {
  const box = (p: Vec3, size: Vec3, color: string, solid = false) => {
    steel.box(coasterWorld(p), size, color);
    if (solid) colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3 });
  };
  const light = (p: Vec3, size: Vec3, color = '#ffbd65') => glow.box(coasterWorld(p), size, color);
  const beam = (a: Vec3, b: Vec3, radius: number, color = '#60747d') => steel.beam(coasterWorld(a), coasterWorld(b), radius, color);
  const housing = (p: Vec3, size: Vec3, color: string) => {
    steel.housing(coasterWorld(p), size, color);
    colliders.push({ position: coasterWorld(p), half: size.map(v => v / 2) as Vec3 });
  };
  // Deliberate islands: tower foot, inside the inversion, central equipment and front-right coastal garden.
  const islands: [number, number, number, number, number][] = [
    [-43,-65,8,5.6,9], [-48,-9,5,2.7,8],
    [70,-81,9,6,12], [84,-57,7,5.8,9],
    [-36,13,5.8,2.4,5.8], [-25,47,7,2.4,6], [-44,43,7,2.8,8],
  ];
  const builtIslands: typeof islands = [];
  let treeCount = 0, shrubCount = 0;
  islands.forEach(([x,z,rx,h,rz], i) => {
    const p: Vec3 = [x, h / 2 - .15, z], half: Vec3 = [rx * 1.15, h / 2, rz * 1.15];
    if (clear(p, half, 1.2)) {
      builtIslands.push([x,z,rx,h,rz]);
      rock(steel, p, [rx,h,rz], i); colliders.push({ position: coasterWorld(p), half });
      for (let k = 0; k < (detailed ? 5 : 2); k++) {
        const angle = k * 2.4 + i, r = .85;
        const at: Vec3 = [x + Math.cos(angle) * rx * r, .7, z + Math.sin(angle) * rz * r];
        if (clear(at, [2.8,1.2,2.4])) facet(steel, at, [2.8,1.2,2.4], STONE[(i + k) % 4], i + k);
      }
      for (let k = 0; k < (detailed ? 6 : 3); k++) {
        const angle = k * 2.2 + i * .8;
        const at: Vec3 = [x + Math.cos(angle) * rx * .95, .8, z + Math.sin(angle) * rz * .95];
        if (clear(at, [1.8,1.2,1.8], 2)) {
          facet(steel, at, [1.8,1.2,1.8], LEAF[(i+k)%4], i+k); shrubCount++;
        }
      }
    }
  });
  // Tree groves follow the island groups, not a uniform scatter over the track.
  const trees: Vec3[] = [[-48,4.4,-48],[-40,4.4,-49],[-47,3.5,-27],[-49,2.8,-9],
    [-4,2.5,-45],[8,2.5,-47],[5,2.5,-37],[33,3,-45],[38,3,-38],[34,3,-32],
    [46,3.8,-15],[42,3.8,-10],[29,3.3,18],[34,3.3,23],[26,3.3,24],
    [43,3,36],[47,3,41],[36,3,43],[26,2.2,46],[21,2.2,43],[-46,2.8,43],[-42,2.8,47],[-27,2.4,48],[-22,2.4,50],
    // Small groves inhabit the continuous shoulders, leaving the track cuttings open.
    [-21,0,-58],[-17,0,-55],[-18,0,-43],[-14,0,-39],[-17,0,-25],[-12,0,-22],
    [7,0,-53],[11,0,-49],[13,0,-30],[17,0,-27],[28,0,-22],[32,0,-18],
    [39,0,-41],[42,0,-37],[38,0,-5],[34,0,1],[40,0,28],[38,0,33]];
  trees.forEach((original, i) => {
    const p: Vec3 = [...original];
    const island = builtIslands.find(([x,z,rx,,rz]) => ((p[0]-x)/rx)**2 + ((p[2]-z)/rz)**2 < .4);
    p[1] = coasterInfieldHeight(p[0],p[2]) ?? (island ? island[3] - .15 : 0);
    if (!detailed && i % 2) return;
    const h = 3.6 + (i % 3) * .7, crown: Vec3 = [p[0], p[1] + h + 1, p[2]];
    if (!clear(crown, [3.4,2.8,3.4], 2.3)) return;
    treeCount++;
    beam(p, [p[0] + .3, p[1] + h, p[2]], .28, '#6d6049');
    beam([p[0],p[1]+h*.65,p[2]], [p[0]-1.5,p[1]+h+1,p[2]+.6], .16, '#6d6049');
    colliders.push({ position: coasterWorld([p[0],p[1]+h/2,p[2]]), half: [.45,h/2,.45] });
    facet(steel, crown, [2.6,2.5,2.5], LEAF[i % 4], i);
    facet(steel, [p[0]-1.6,p[1]+h+.3,p[2]+.6], [1.8,1.7,1.8], LEAF[(i+1)%4], i+2);
    if (detailed) facet(steel,[p[0]+1.4,p[1]+h+.5,p[2]-.8],[1.5,1.9,1.5],LEAF[(i+2)%4],i+4);
  });
  // Continuous warm promenade reinforces the entrance-to-station route without moving its contacts.
  for (const [x,z,w,d] of [[-24,53,31,3],[31,53,34,3],[16,43,3,20],[-18,42,3,18]]) {
    box([x,.055,z],[w,.11,d],'#b2a58c');
    for (const side of [-1,1]) light([x,.13,z+side*(d/2-.2)],[w,.04,.09]);
  }
  for (const x of [-48,-38,-18,17,29,45]) {
    if(onCoasterCliffWalk(x,55,3)) continue;
    housing([x,.5,55],[5,1,1.8],'#777c6b');
    for (let i=0;i<3;i++) facet(steel,[x-1.6+i*1.6,1.4,55],[1.2,.9,.9],LEAF[(i+3)%4],i);
  }
  // The new loop is part of the same terrain/collision mesh. Four small lanterns mark its turns.
  for (const [x,z] of COASTER_INFIELD_LAMPS) {
    const y=coasterInfieldHeight(x,z)??0;
    beam([x,y,z],[x,y+3.1,z],.1,'#526768');
    housing([x,y+.16,z],[.8,.32,.8],'#8e9180');
    housing([x,y+2.8,z],[.6,.65,.6],'#354b50');
    light([x,y+2.8,z],[.37,.43,.63]);light([x,y+2.8,z],[.63,.43,.37]);
    colliders.push({position:coasterWorld([x,y+1.5,z]),half:[.16,1.5,.16]});
  }
  addEquipment(steel, glow, box, light, beam, housing, detailed);
  return { islands: builtIslands.length, trees: treeCount, shrubs: shrubCount };
}

type Box = (p: Vec3, size: Vec3, color: string, solid?: boolean) => void;
type Light = (p: Vec3, size: Vec3, color?: string) => void;
type Beam = (a: Vec3, b: Vec3, radius: number, color?: string) => void;
function addEquipment(steel: CoasterBatch, glow: CoasterBatch, box: Box, light: Light, beam: Beam, housing: Box, detailed: boolean) {
  {
    const p = ([x,y,z]: Vec3): Vec3 => [x,y*54/44,z-48];
    const size = ([x,y,z]: Vec3): Vec3 => [x,y*54/44,z];
    const towerHousing: Box = (a,s,c) => housing(p(a),size(s),c);
    const towerBox: Box = (a,s,c,solid) => box(p(a),size(s),c,solid);
    const towerLight: Light = (a,s,c) => light(p(a),size(s),c);
    const towerBeam: Beam = (a,b,r,c) => beam(p(a),p(b),r,c);
  // A split service core, asymmetric platforms and a broad crown break the plain white-column silhouette.
  towerHousing([-40,21,-27.15],[3,38,.85],'#294954');
  towerHousing([-44.5,20,-30.2],[2.6,35,2.3],'#46616b');
  towerHousing([-41.5,42.4,-32],[10,2.5,10],'#8e9897');
  towerHousing([-41.5,43.9,-32],[6.8,.8,7],'#263e4b');
  towerHousing([-43,44.2,-32],[2.5,1.2,3],'#aeb5aa');
  for (const y of [8.5,20,31.5,40]) {
    towerBox([-41.5,y,-26.4],[10.2,.65,4],'#9a9f96',true);
    for (const z of [-28.3,-24.5]) {
      towerBeam([-46.5,y+1.25,z],[-36.5,y+1.25,z],.09,'#b5905d');
      for (let x=-46.5;x<=-36.5;x+=2) towerBeam([x,y+.3,z],[x,y+1.25,z],.07,'#b5905d');
    }
    towerLight([-41.5,y-.25,-24.35],[8.2,.22,.12]);
    towerLight([-39.1,y+4,-26.65],[.55,4.8,.16],'#35dce9');
    towerLight([-41.5,y+3,-26.65],[.3,2.7,.16]);
  }
  for (const x of [-43,-37]) {
    towerBeam([x,3,-26.6],[x,38,-26.6],.24,'#bd925e');
    towerBeam([x,38,-26.6],[x,38,-30],.24,'#bd925e');
  }
  }
  // Heavy octagonal service collars and multiple roof levels make the helix house read from afar.
  housing([-36,3,13],[10.3,1.2,10.3],'#6e8187');
  housing([-36,8.3,13],[10.2,1,10.2],'#536d76');
  housing([-36,12,13],[7.7,.9,7.7],'#b7bcb2');
  housing([-36,13.1,13],[5.9,1.3,5.9],'#344e58');
  for (const side of [-1,1]) {
    light([-36,8.45,13+side*5.16],[7.6,.32,.12],'#35dce9');
    light([-36+side*5.16,8.45,13],[.12,.32,7.6],'#35dce9');
    light([-36,12.5,13+side*3.9],[5.8,.18,.12]);
  }
  housing([-36,1.2,20],[7.5,2.4,3],'#8f9c9c');
  for (const x of [-38,-35]) {
    housing([x,3.7,20],[1.2,3.4,1.4],'#4c6570');
    light([x,4.2,20.74],[.45,1.6,.12],'#35dce9');
  }
  for (const x of [-39,-36,-33]) {
    beam([x,13.8,12],[x,15.2,12],.35,'#b18b5b');
    box([x,15.2,12],[1.3,.35,1.3],'#566970');
  }
  {
    const move=([x,y,z]:Vec3):Vec3=>[x+21,y+5,z-49];
    const powerHousing: Box=(p,s,c)=>housing(move(p),s,c);
    const powerBox: Box=(p,s,c)=>box(move(p),s,c);
    const powerLight: Light=(p,s,c)=>light(move(p),s,c);
    const powerBeam: Beam=(a,b,r,c)=>beam(move(a),move(b),r,c);
  // Connected equipment platform and cable conduits behind the S bends.
  powerHousing([3,1,-43],[15,2,13],'#8b9290');
  powerHousing([3,8.7,-43],[8,.7,6.5],'#a8b0a7');
  for (const x of [-.5,3,6.5]) {
    powerHousing([x,9.8,-43],[2.3,1.6,3.7],'#415d65');
    for (let z=-44;z<=-42;z+=.7) powerBox([x,10.65,z],[1.8,.1,.18],'#adbbb6');
  }
  powerLight([3,6.8,-38.86],[7,.4,.12],'#35dce9');
  powerLight([3,2.1,-36.42],[12,.18,.12]);
  for (const x of [-4.5,10.5]) {
    powerBeam([x,2.1,-49.5],[x,3.3,-49.5],.08,'#bd9865');
    powerBeam([x,3.3,-49.5],[x,3.3,-36.5],.08,'#bd9865');
  }
  }
  // Deep station fascias and canopy lighting stay above the verified guest route.
  for (const x of [-10.8,6.8]) {
    box([x,6.9,41.5],[.5,1.2,23.4],'#475d67');
    light([x,6.25,41.5],[.16,.18,21.8]);
  }
  light([-2,6.25,53.1],[16,.22,.16]);
  for (const z of [35,41,47]) box([-2,7.65,z],[15,.32,.38],'#829196');
  if (detailed) {
    for (const z of [39,44,48]) {
      beam([12.85,1.1,z],[12.85,5.9,z],.15,'#b18b5b');
      box([12.9,3.5,z],[.3,1.3,.7],'#3f5a67');
    }
    for (const x of [-47,-40,-33,-26,-19,17,24,31,38,45]) {
      if(onCoasterCliffWalk(x,52,1)) continue;
      beam([x,.25,52],[x,2.8,52],.13,'#4f6267');
      box([x,2.45,52],[.7,.9,.7],'#283f4b');
      light([x,2.45,52],[.4,.65,.74]);
      light([x,2.45,52],[.74,.65,.4]);
    }
    // Bundled cable runs are attached to existing staff catwalks, not strung across the ride.
    for (const x of [-51.7,-51.4,-51.1]) beam([x,15.05,-23],[x,15.05,12],.075,'#b38551');
    for (const y of [5,6.1]) beam([-44.8,y,-73],[-44.8,y,-84],.18,'#c09461');
  }
}

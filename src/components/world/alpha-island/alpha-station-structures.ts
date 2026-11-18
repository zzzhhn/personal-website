import { BufferGeometry, Float32BufferAttribute, Quaternion, Uint32BufferAttribute, Vector3 } from 'three';
import type { Vec3 } from '../types';
import { AlphaStructureBuilder } from './alpha-structure-builder';
import { ALPHA_STATIONS } from './alpha-layout';
import { alphaGroundHeight } from './alpha-terrain';

const deck = { height: .52, thickness: .18, width: 7, boardDepth: .35, spacing: .38, firstZ: -2.7, boards: 15 };

export function createAlphaLodge() {
  const b = new AlphaStructureBuilder('alpha-dock-lodge');
  const [lx, ly, lz] = ALPHA_STATIONS.lodge;
  const width = 7.5, depth = 6.1, top = .36, bevel = .09;
  let bottom = 0;
  for (let iz = 0; iz <= 16; iz++) for (let ix = 0; ix <= 20; ix++) {
    const ground = alphaGroundHeight(lx + width * (ix / 20 - .5), lz + depth * (iz / 16 - .5));
    bottom = Math.min(bottom, ground - ly - bevel - .01);
  }
  b.select('foundation', 'floor');
  b.box('stone', [0,(top + bottom)/2,0], [width,top - bottom,depth], bevel);
  b.select('floorboards', 'floor');
  for (let i=0; i<deck.boards; i++)
    b.box('lodgeFloor',[0,deck.height-deck.thickness/2,deck.firstZ+i*deck.spacing],[deck.width,deck.thickness,deck.boardDepth],.025);

  b.select('walls-and-windows', 'enclosure');
  for (const x of [-3.2,3.2]) for (const z of [-2.6,2.6]) {
    b.box('stone',[x,.65,z],[.72,.8,.72],.08);
    b.beam('lodgeFrame',[x,.9,z],[x,4.05,z],.3);
  }
  for (const x of [-3.25,3.25]) for (let z=-2.5;z<2.8;z+=.46)
    b.box('lodgeWall',[x,1.75,z],[.2,2.5,.43]);
  for (let x=-3;x<3.2;x+=.46) b.box('lodgeWall',[x,1.75,-2.65],[.43,2.5,.2]);
  for (const x of [-2.25,2.25]) {
    b.box('lodgeWall',[x,1.7,2.65],[1.65,2.45,.2]);
    b.box('lodgeFrame',[x,2.15,2.79],[1.32,1.32,.14]);
    b.box('glass',[x,2.15,2.88],[1.08,1.08,.08]);
    b.beam('lodgeFrame',[x-.57,2.15,2.94],[x+.57,2.15,2.94],.07);
    b.beam('lodgeFrame',[x,1.58,2.94],[x,2.72,2.94],.07);
    b.box('lodgeFrame',[x,1.54,2.96],[1.5,.12,.25]);
  }

  b.select('roof', 'enclosure');
  for (const z of [-2.65,2.65]) {
    b.beam('lodgeFrame',[-3.5,3.2,z],[3.5,3.2,z],.25);
    b.beam('lodgeFrame',[-3.6,3.2,z],[0,5.25,z],.25);
    b.beam('lodgeFrame',[0,5.25,z],[3.6,3.2,z],.25);
    for (const x of [-3.2,3.2]) b.beam('lodgeFrame',[x,2.6,z],[x*.65,3.2,z],.17);
  }
  b.beam('lodgeFrame',[0,5.2,-3.2],[0,5.2,3.2],.27);
  for (const side of [-1,1]) for (let row=0;row<7;row++) {
    const x=side*(.25+row*.57), y=5.27-Math.abs(x)*.56;
    for (let z=-3.15;z<=3.2;z+=.64)
      b.box('roof',[x,y,z],[.7,.105,.68],.035,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-side*.51));
  }

  b.select('bell-bracket', 'enclosure');
  b.beam('lodgeFrame',[2.7,2.8,2.9],[2.7,2.8,3.7],.13);
  b.select('sand-table', 'enclosure');
  for (const x of [-1,1]) for (const z of [-.65,.65])
    b.beam('lodgeFrame',[x,.5,z+.1],[x,1.4,z+.1],.12);
  b.box('lodgeFloor',[0,1.43,.1],[2.45,.2,1.9]);
  b.box('stone',[0,1.55,.1],[2.1,.07,1.55],.07);
  b.select('sand-table-button', 'decoration');
  b.cyl('metal',[0,1.7,1.08],.07,.045);
  b.select('sand-table-rim', 'enclosure');
  for (const x of [-1.17,1.17]) b.box('lodgeWall',[x,1.64,.1],[.12,.22,1.9]);
  for (const z of [-.8,1]) b.box('lodgeWall',[0,1.64,z],[2.45,.22,.12]);
  b.select('notice-board', 'enclosure');
  b.box('lodgeWall',[-2.3,1.3,2.95],[1.25,1.4,.15]);
  b.select('paper-notices-and-pins', 'decoration');
  for (const x of [-2.65,-2.3,-1.95]) {
    b.cyl('metal',[x,1.95,3.07],.025,.15);
    b.box('paper',[x,1.65,3.08],[.25,.4,.025],.015);
  }
  return b.finish();
}

export function createAlphaRack() {
  const b = new AlphaStructureBuilder('alpha-lantern-rack');
  b.select('rack', 'enclosure');
  for (const x of [-1.25,1.25]) {
    b.box('stone',[x,.17,0],[.6,.34,.7],.07);
    b.beam('wood',[x,.25,0],[x,2.55,0],.18);
    b.beam('wood',[x,.5,0],[x*.6,.5,.65],.14);
    b.beam('wood',[x,2,0],[x*.7,2.5,0],.12);
  }
  b.beam('wood',[-1.5,2.55,0],[1.5,2.55,0],.2);
  b.box('wood',[0,.24,0],[2.9,.16,.85]);
  return b.finish();
}

export function createLodgeRamp() {
  const [cx, cy, cz] = ALPHA_STATIONS.lodge;
  const floor = cy + deck.height;
  const threshold = cz + deck.firstZ + (deck.boards-1)*deck.spacing + deck.boardDepth/2 - .06;
  const toe = cz + 4.6, landing = cz + 2.98, width = 2.2, slices = 8;
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  function vertex(p: Vec3, side = false) {
    points.push(...p);
    uv.push(side ? (p[1]-cy)/.318 : (p[0]-cx+width/2)/.318, (toe-p[2])/.7);
    return points.length/3-1;
  }
  function quad(a: number, b: number, c: number, d: number) { indices.push(a,b,c,b,d,c); }
  function row(z: number, height: (x:number)=>number) {
    return Array.from({length:slices+1},(_,i) => {
      const x = cx + width*(i/slices-.5);
      return vertex([x,height(x),z]);
    });
  }
  const rows = [row(toe,x => alphaGroundHeight(x,toe)-.015),row(landing,()=>floor+.004),row(threshold,()=>floor)];
  for (let j=1;j<rows.length;j++) for (let i=0;i<slices;i++)
    quad(rows[j-1][i],rows[j-1][i+1],rows[j][i],rows[j][i+1]);
  // Close both exposed cheeks against the hillside. Separate vertices preserve the edge normal.
  for (const i of [0,slices]) {
    const edge = rows.map(r => {
      const k = r[i]*3, x=points[k], y=points[k+1], z=points[k+2];
      return [vertex([x,y,z],true),vertex([x,Math.min(y,alphaGroundHeight(x,z))-.04,z],true)];
    });
    for (let j=1;j<edge.length;j++) {
      const [a,b]=edge[j-1], [c,d]=edge[j];
      if (i===0) quad(b,a,d,c); else quad(a,b,c,d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(points,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(points.length).fill(1),3));
  geometry.setAttribute('alphaEnd',new Float32BufferAttribute(new Float32Array(points.length/3),1));
  geometry.setIndex(new Uint32BufferAttribute(indices,1)); geometry.computeVertexNormals();
  return geometry;
}

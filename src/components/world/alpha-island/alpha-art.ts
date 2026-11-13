import { BufferGeometry,Color,CylinderGeometry,Float32BufferAttribute,LatheGeometry,Matrix4,Quaternion,SphereGeometry,Vector2,Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../types';
export type AlphaFinish='wood'|'darkwood'|'stone'|'roof'|'metal'|'rope'|'paper'|'glass';
export const ALPHA_COLORS:Record<AlphaFinish,string>={wood:'#ad7d49',darkwood:'#594332',stone:'#94938b',roof:'#586774',metal:'#a48247',rope:'#c9b184',paper:'#ffe1a0',glass:'#789b9a'};
/** Deterministic editable authoring source directly consumed by runtime. Connections are buried
 * mechanically, articulated parts are kept separate. +Y up, metres, bottom-contact origins. */
export class AlphaBuilder{
 parts=new Map<AlphaFinish,BufferGeometry[]>();
 add(g:BufferGeometry,m:AlphaFinish,p:Vec3=[0,0,0],q?:Quaternion,s:Vec3=[1,1,1]){if(m==='wood'||m==='darkwood'){g.computeBoundingBox();const size=g.boundingBox!.getSize(new Vector3()).toArray(),long=size.indexOf(Math.max(...size)),pos=g.getAttribute('position'),norm=g.getAttribute('normal'),uv=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){const v=[pos.getX(i),pos.getY(i),pos.getZ(i)],n=[norm.getX(i),norm.getY(i),norm.getZ(i)],face=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),cross=[0,1,2].find(k=>k!==long&&k!==face)??((long+1)%3);uv[i*2]=v[long]/.7;uv[i*2+1]=v[cross]/.32;}g.setAttribute('uv',new Float32BufferAttribute(uv,2));}g.applyMatrix4(new Matrix4().compose(new Vector3(...p),q??new Quaternion(),new Vector3(...s)));const n=g.index?g.toNonIndexed():g; if(n!==g)g.dispose();const col=new Float32Array(n.getAttribute('position').count*3),c=new Color('#ffffff');for(let i=0;i<col.length;i+=3){const t=.94+.06*Math.sin(i*1.73);col[i]=c.r*t;col[i+1]=c.g*t;col[i+2]=c.b*t;}n.setAttribute('color',new Float32BufferAttribute(col,3));for(const k of Object.keys(n.attributes))if(!['position','normal','uv','color'].includes(k))n.deleteAttribute(k);if(!n.getAttribute('uv'))n.setAttribute('uv',new Float32BufferAttribute(new Float32Array(n.getAttribute('position').count*2),2));const list=this.parts.get(m)??[];list.push(n);this.parts.set(m,list);}
 box(m:AlphaFinish,p:Vec3,size:Vec3,r=.025,q?:Quaternion){this.add(new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(x=>x/4))),m,p,q);}
 beam(m:AlphaFinish,a:Vec3,b:Vec3,w=.18,d=w){const x=new Vector3(...a),y=new Vector3(...b),v=y.clone().sub(x);this.box(m,x.add(y).multiplyScalar(.5).toArray() as Vec3,[w,v.length(),d],.018,new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.normalize()));}
 cyl(m:AlphaFinish,p:Vec3,r:number,h:number,r2=r){this.add(new CylinderGeometry(r2,r,h,12,1),m,p);}
 finish(){const out=[...this.parts].map(([finish,parts])=>{const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();return {finish,geometry};});this.parts.clear();return out;}
}
export function alphaLanternGeometry(){const b=new AlphaBuilder();const profile=[[.2,0],[.25,.05],[.3,.18],[.31,.4],[.27,.61],[.21,.7]].map(p=>new Vector2(...p as [number,number]));b.add(new LatheGeometry(profile,16), 'paper',[0,0,0]);for(const y of [.03,.13,.25,.38,.5,.61,.69])b.cyl('rope',[0,y,0],.215+Math.sin(y/.7*Math.PI)*.09,.012);b.cyl('darkwood',[0,.005,0],.2,.035);b.beam('rope',[-.17,.69,0],[0,.89,0],.014);b.beam('rope',[.17,.69,0],[0,.89,0],.014);return b.finish();}
export function createAlphaLodge(){const b=new AlphaBuilder();
 // Raised stone foundation, massive footings and framed clear opening on south side.
 b.box('stone',[0,.18,0],[7.5,.36,6.1],.09);
 for(let z=-2.7;z<=2.7;z+=.38) b.box('wood',[0,.43,z],[7,.18,.35],.025);
 for(const x of [-3.2,3.2])for(const z of [-2.6,2.6]){b.box('stone',[x,.65,z],[.72,.8,.72],.08);b.beam('wood',[x,.9,z],[x,4.05,z],.3);}
 for(const x of [-3.25,3.25])for(let z=-2.5;z<2.8;z+=.46)b.box('wood',[x,1.75,z],[.2,2.5,.43]);
 for(let x=-3;x<3.2;x+=.46)b.box('wood',[x,1.75,-2.65],[.43,2.5,.2]);
 for(const x of [-2.25,2.25]){b.box('wood',[x,1.7,2.65],[1.65,2.45,.2]);b.box('darkwood',[x,2.15,2.79],[1.32,1.32,.14]);b.box('glass',[x,2.15,2.88],[1.08,1.08,.08]);b.beam('wood',[x-.57,2.15,2.94],[x+.57,2.15,2.94],.07);b.beam('wood',[x,1.58,2.94],[x,2.72,2.94],.07);b.box('wood',[x,1.54,2.96],[1.5,.12,.25]);}
 for(const z of [-2.65,2.65]){b.beam('wood',[-3.5,3.2,z],[3.5,3.2,z],.25);b.beam('wood',[-3.6,3.2,z],[0,5.25,z],.25);b.beam('wood',[0,5.25,z],[3.6,3.2,z],.25);for(const x of [-3.2,3.2])b.beam('wood',[x,2.6,z],[x*.65,3.2,z],.17);}
 b.beam('darkwood',[0,5.2,-3.2],[0,5.2,3.2],.27);
 for(const side of [-1,1])for(let row=0;row<7;row++){const x=side*(.25+row*.57),y=5.27-Math.abs(x)*.56;for(let z=-3.15;z<=3.2;z+=.64)b.box('roof',[x,y,z],[.7,.105,.68],.035,new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-side*.51));}
 // Rope-bell and bronze suspension bracket, reachable from path.
 b.beam('darkwood',[2.7,2.8,2.9],[2.7,2.8,3.7],.13);
 // Sand table on four planted legs and broad rim. Scale route model is an actual raised polyline.
 for(const x of [-1,1])for(const z of [-.65,.65])b.beam('darkwood',[x,.5,z+.1],[x,1.4,z+.1],.12);
 b.box('wood',[0,1.43,.1],[2.45,.2,1.9]);b.box('stone',[0,1.55,.1],[2.1,.07,1.55],.07);b.cyl('metal',[0,1.7,1.08],.07,.045);
 for(const x of [-1.17,1.17])b.box('wood',[x,1.64,.1],[.12,.22,1.9]);for(const z of [-.8,1])b.box('wood',[0,1.64,z],[2.45,.22,.12]);
 b.box('wood',[-2.3,1.3,2.95],[1.25,1.4,.15]);for(const x of [-2.65,-2.3,-1.95]){b.cyl('metal',[x,1.95,3.07],.025,.15);b.box('paper',[x,1.65,3.08],[.25,.4,.025],.015);}
 return b.finish();}
export function createAlphaRack(){const b=new AlphaBuilder();for(const x of [-1.25,1.25]){b.box('stone',[x,.17,0],[.6,.34,.7],.07);b.beam('wood',[x,.25,0],[x,2.55,0],.18);b.beam('wood',[x,.5,0],[x*.6,.5,.65],.14);b.beam('wood',[x,2,0],[x*.7,2.5,0],.12);}b.beam('wood',[-1.5,2.55,0],[1.5,2.55,0],.2);b.box('wood',[0,.24,0],[2.9,.16,.85]);return b.finish();}

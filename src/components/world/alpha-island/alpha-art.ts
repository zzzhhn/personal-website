import { BufferGeometry,Color,CylinderGeometry,Float32BufferAttribute,LatheGeometry,Matrix4,Quaternion,SphereGeometry,Vector2,Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../types';
export type AlphaFinish='wood'|'darkwood'|'stone'|'roof'|'metal'|'rope'|'paper'|'glass'|'lodgeWall'|'lodgeFrame'|'lodgeFloor'|'bark'|'grammarBark'|'leafplate';
export const ALPHA_COLORS:Record<AlphaFinish,string>={wood:'#ad7d49',darkwood:'#594332',stone:'#94938b',roof:'#586774',metal:'#a48247',rope:'#c9b184',paper:'#ffe1a0',glass:'#789b9a',lodgeWall:'#9d8a68',lodgeFrame:'#65553e',lodgeFloor:'#a88355',bark:'#68503a',grammarBark:'#646454',leafplate:'#748259'};
export const isAlphaWood=(finish:string)=>['wood','darkwood','lodgeWall','lodgeFrame','lodgeFloor'].includes(finish);
/** Deterministic editable authoring source directly consumed by runtime. Connections are buried
 * mechanically, articulated parts are kept separate. +Y up, metres, bottom-contact origins. */
export class AlphaBuilder{
 parts=new Map<AlphaFinish,BufferGeometry[]>();
 add(g:BufferGeometry,m:AlphaFinish,p:Vec3=[0,0,0],q?:Quaternion,s:Vec3=[1,1,1]){
  if(isAlphaWood(m)){
   g.computeBoundingBox();const size=g.boundingBox!.getSize(new Vector3()).toArray(),long=size.indexOf(Math.max(...size)),pos=g.getAttribute('position'),norm=g.getAttribute('normal'),uv=new Float32Array(pos.count*2),ends=new Float32Array(pos.count),offset=(Math.sin(p[0]*13.7+p[1]*7.3+p[2]*21.1)+1)*.43;
   for(let i=0;i<pos.count;i++){
    const v=[pos.getX(i),pos.getY(i),pos.getZ(i)],n=[norm.getX(i),norm.getY(i),norm.getZ(i)],face=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),cross=[0,1,2].find(k=>k!==long&&k!==face)??((long+1)%3);
    // Each physical piece retains long-grain UVs before placement/rotation. Cut ends
    // have a two-dimensional cross section rather than a collapsed long-axis strip.
    if(face===long){const axes=[0,1,2].filter(k=>k!==long);uv[i*2]=v[axes[0]]/.32;uv[i*2+1]=v[axes[1]]/.32;ends[i]=Math.pow(Math.abs(n[long]),10);}
    else{uv[i*2]=v[long]/.7+offset;uv[i*2+1]=v[cross]/.318;}
   }
   g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('alphaEnd',new Float32BufferAttribute(ends,1));
  }
  g.applyMatrix4(new Matrix4().compose(new Vector3(...p),q??new Quaternion(),new Vector3(...s)));const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();const col=new Float32Array(n.getAttribute('position').count*3),c=new Color('#ffffff');for(let i=0;i<col.length;i+=3){const t=.97+.03*Math.sin(i*1.73);col[i]=c.r*t;col[i+1]=c.g*t;col[i+2]=c.b*t;}n.setAttribute('color',new Float32BufferAttribute(col,3));for(const k of Object.keys(n.attributes))if(!['position','normal','uv','color','alphaEnd'].includes(k))n.deleteAttribute(k);if(!n.getAttribute('uv'))n.setAttribute('uv',new Float32BufferAttribute(new Float32Array(n.getAttribute('position').count*2),2));const list=this.parts.get(m)??[];list.push(n);this.parts.set(m,list);
 }
 box(m:AlphaFinish,p:Vec3,size:Vec3,r=.025,q?:Quaternion){this.add(new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(x=>x/4))),m,p,q);}
 beam(m:AlphaFinish,a:Vec3,b:Vec3,w=.18,d=w){const x=new Vector3(...a),y=new Vector3(...b),v=y.clone().sub(x);this.box(m,x.add(y).multiplyScalar(.5).toArray() as Vec3,[w,v.length(),d],.018,new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.normalize()));}
 cyl(m:AlphaFinish,p:Vec3,r:number,h:number,r2=r){this.add(new CylinderGeometry(r2,r,h,12,1),m,p);}
 finish(){const out=[...this.parts].map(([finish,parts])=>{const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();return {finish,geometry};});this.parts.clear();return out;}
}
export function alphaLanternGeometry(){const b=new AlphaBuilder();const profile=[[.2,0],[.25,.05],[.3,.18],[.31,.4],[.27,.61],[.21,.7]].map(p=>new Vector2(...p as [number,number]));b.add(new LatheGeometry(profile,16), 'paper',[0,0,0]);for(const y of [.03,.13,.25,.38,.5,.61,.69])b.cyl('rope',[0,y,0],.215+Math.sin(y/.7*Math.PI)*.09,.012);b.cyl('darkwood',[0,.005,0],.2,.035);b.beam('rope',[-.17,.69,0],[0,.89,0],.014);b.beam('rope',[.17,.69,0],[0,.89,0],.014);return b.finish();}

import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Vector3} from 'three';
import {FACILITY_WOOD_TILE} from '../../WorldFacilitySurface';
import type {Vec3} from '../../types';
type V={p:Vector3;u:number;v:number};
type Face={points:V[];group:number};
type Segment={a:Vec3;b:Vec3};
const GAP=.006,LENGTH=1.8,BOARDS=4;
function clip(poly:V[],distance:(v:V)=>number){const out:V[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a),db=distance(b),ia=da>=-1e-10,ib=db>=-1e-10;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}}return out;}
function finish(p:number[],uv:number[],c:number[],ix:number[]){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('color',new Float32BufferAttribute(c,3));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingSphere();return g;}
/** Clips the original surface triangles in manufactured UV space. Every retained top
 * remains on its original plane; grooves remove visual wood, never move the collider. */
function boards(faces:Face[],halfWidth:number,depth:number,closeBottom:boolean){
 const p:number[]=[],uv:number[]=[],c:number[]=[],ix:number[]=[],vertices=new Map<string,number>(),edges=new Map<string,{a:number;b:number;count:number;tint:number}>();
 const add=(v:V,tint:number,down=0)=>{const j=p.length/3;p.push(v.p.x,v.p.y-down,v.p.z);uv.push(v.u/FACILITY_WOOD_TILE[0],v.v/FACILITY_WOOD_TILE[1]);c.push(tint,tint,tint);return j;};
 for(const face of faces)for(let band=0;band<BOARDS;band++){
  const lo=-halfWidth+band*2*halfWidth/BOARDS+GAP/2,hi=-halfWidth+(band+1)*2*halfWidth/BOARDS-GAP/2;
  let stripe=clip(clip(face.points,v=>v.v-lo),v=>hi-v.v);if(stripe.length<3)continue;
  const shift=band%2?LENGTH/2:0,min=Math.min(...stripe.map(v=>v.u)),max=Math.max(...stripe.map(v=>v.u));
  for(let tile=Math.floor((min+shift)/LENGTH);tile<=Math.floor((max+shift)/LENGTH);tile++){
   const poly=clip(clip(stripe,v=>v.u-(tile*LENGTH-shift+GAP/2)),v=>(tile+1)*LENGTH-shift-GAP/2-v.u);if(poly.length<3)continue;
   const id=`${face.group}/${band}/${tile}`,tint=.96+((face.group*13+band*7+tile*3)%13+13)%13*.004,top=poly.map(v=>{const key=id+'/'+[...v.p.toArray(),v.u,v.v].map(x=>x.toFixed(6)).join(',');let j=vertices.get(key);if(j===undefined){j=add(v,tint);vertices.set(key,j);}return j;});
   for(let k=1;k<top.length-1;k++)ix.push(top[0],top[k],top[k+1]);
   for(let k=0;k<top.length;k++){const a=top[k],b=top[(k+1)%top.length];if(a===b)continue;const key=id+'/'+[Math.min(a,b),Math.max(a,b)].join(',');const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1,tint});}
   if(closeBottom){const bottom=poly.map(v=>add(v,tint*.72,depth));for(let k=1;k<bottom.length-1;k++)ix.push(bottom[0],bottom[k+1],bottom[k]);}
  }
 }
 for(const {a,b,count,tint}of edges.values())if(count===1){const av=new Vector3().fromArray(p,a*3),bv=new Vector3().fromArray(p,b*3),j=p.length/3,au=uv[a*2],bu=uv[b*2],edge=av.distanceTo(bv)/FACILITY_WOOD_TILE[0],us=Math.abs(bu-au)<1e-6?[0,edge]:[au,bu];p.push(...av.toArray(),...bv.toArray(),bv.x,bv.y-depth,bv.z,av.x,av.y-depth,av.z);uv.push(us[0],0,us[1],0,us[1],-depth/FACILITY_WOOD_TILE[1],us[0],-depth/FACILITY_WOOD_TILE[1]);for(let k=0;k<4;k++)c.push(tint*.83,tint*.83,tint*.83);ix.push(j,j+3,j+2,j,j+2,j+1);}
 return {p,uv,c,ix};
}
export function boardingPlanks(source:BufferGeometry,segments:Segment[]){
 const position=source.getAttribute('position'),indices=source.index!.array,parent=Array.from({length:position.count},(_,i)=>i),root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
 for(let i=0;i<indices.length;i+=3){parent[root(indices[i+1])]=root(indices[i]);parent[root(indices[i+2])]=root(indices[i]);}
 const groups=new Map<number,number[]>();for(let i=0;i<position.count;i++){const k=root(i),list=groups.get(k)??[];list.push(i);groups.set(k,list);}
 const mappings=new Map<number,{group:number;a:Vector3;forward:Vector3;side:Vector3}>();
 for(const [id,ids]of groups){const center=ids.reduce((s,i)=>s.add(new Vector3().fromBufferAttribute(position,i)),new Vector3()).divideScalar(ids.length);let best=Infinity;
  segments.forEach(({a,b},group)=>{const from=new Vector3(...a),d=new Vector3(...b).sub(from),length=Math.hypot(d.x,d.z);if(length<1e-8)return;const forward=new Vector3(d.x,0,d.z).normalize(),side=new Vector3(-forward.z,0,forward.x),u=center.clone().sub(from).dot(forward),v=center.clone().sub(from).dot(side),plane=Math.max(...ids.map(i=>{const p=new Vector3().fromBufferAttribute(position,i);return Math.abs(p.y-a[1]-p.clone().sub(from).dot(forward)/length*d.y);})),score=plane*1000+Math.max(0,-u,u-length)*100+Math.abs(v);if(score<best){best=score;mappings.set(id,{group,a:from,forward,side});}});
 }
 const faces:Face[]=[];for(let i=0;i<indices.length;i+=3){const ids=[indices[i],indices[i+1],indices[i+2]],m=mappings.get(root(ids[0]));if(!m)continue;faces.push({group:m.group,points:ids.map(i=>{const p=new Vector3().fromBufferAttribute(position,i),d=p.clone().sub(m.a);return {p,u:d.dot(m.forward),v:d.dot(m.side)};})});}
 const result=boards(faces,.65,.08,true);
 // Two under-board stringers terminate within the existing fixed walkway envelope.
 for(const {a,b}of segments){const from=new Vector3(...a),to=new Vector3(...b),d=to.clone().sub(from),length=d.length();if(length<.05)continue;const side=new Vector3(-d.z,0,d.x).normalize(),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());for(const sign of[-1,1]){const g=new BoxGeometry(.09,length,.1),position=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i),z=position.getZ(i);uv.setXY(i,(Math.abs(normal.getY(i))>.5?x:y)/FACILITY_WOOD_TILE[0],(Math.abs(normal.getZ(i))>.5?x:z)/FACILITY_WOOD_TILE[1]);}const center=from.clone().add(to).multiplyScalar(.5).addScaledVector(side,sign*.45);center.y-=.12;g.applyMatrix4(new Matrix4().compose(center,q,new Vector3(1,1,1)));const offset=result.p.length/3;for(let i=0;i<position.count;i++){result.p.push(position.getX(i),position.getY(i),position.getZ(i));result.uv.push(uv.getX(i),uv.getY(i));result.c.push(.72,.72,.72);}for(const i of g.index!.array)result.ix.push(offset+i);g.dispose();}}

 return finish(result.p,result.uv,result.c,result.ix);
}
export function troughPlanks(vertices:Float32Array,indices:Uint32Array,length:number,snowCut:number){const rows=vertices.length/6,halfWidth=new Vector3().fromArray(vertices,0).distanceTo(new Vector3().fromArray(vertices,3))/2,faces:Face[]=[];for(let i=0;i<indices.length;i+=3){const points=[indices[i],indices[i+1],indices[i+2]].map(index=>({p:new Vector3().fromArray(vertices,index*3),u:Math.floor(index/2)/(rows-1)*length,v:index%2?halfWidth:-halfWidth})),clipped=clip(points,v=>snowCut-v.p.y);if(clipped.length>=3)faces.push({group:0,points:clipped});}const d=boards(faces,halfWidth,.12,false);return finish(d.p,d.uv,d.c,d.ix);}
/** Retains every original shell face and the snow-side top with its original normals/colors. */
export function snowAndShell(source:BufferGeometry,topIndices:number,snowCut:number){
 const pos=source.getAttribute('position'),norm=source.getAttribute('normal'),color=source.getAttribute('color'),indices=source.index!.array,p:number[]=[],n:number[]=[],c:number[]=[];
 type A={p:Vector3;n:Vector3;c:Vector3};
 for(let i=0;i<indices.length;i+=3){let poly:A[]=[indices[i],indices[i+1],indices[i+2]].map(j=>({p:new Vector3().fromBufferAttribute(pos,j),n:new Vector3().fromBufferAttribute(norm,j),c:new Vector3().fromBufferAttribute(color,j)}));if(i<topIndices){const out:A[]=[];for(let j=0;j<3;j++){const a=poly[j],b=poly[(j+1)%3],da=a.p.y-snowCut,db=b.p.y-snowCut,ia=da>=0,ib=db>=0;if(ia)out.push(a);if(ia!==ib){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),c:a.c.clone().lerp(b.c,t)});}}poly=out;}for(let k=1;k<poly.length-1;k++)for(const v of[poly[0],poly[k],poly[k+1]]){p.push(...v.p.toArray());n.push(...v.n.toArray());c.push(...v.c.toArray());}}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('normal',new Float32BufferAttribute(n,3));g.setAttribute('color',new Float32BufferAttribute(c,3));g.computeBoundingSphere();return g;
}

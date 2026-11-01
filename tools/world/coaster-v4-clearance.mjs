/** Bounded numerical integration audit. Run with the existing alpha-mine loader.
 * Full ride at 0.125 s, all three cars; merged actual near structure, physical
 * panel OBBs/corners and seated head, all default cameras. No renderer is needed.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Vector3, Quaternion, Euler, Matrix3, Ray, Triangle } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { CoasterBatch, createCoasterStructure } from '../../src/components/world/attractions/coaster-geometry.ts';
import { coasterFrame, coasterDistanceAt, coasterRidePose, coasterPhase, COASTER_DURATION, COASTER_LENGTH } from '../../src/components/world/attractions/coaster-track.ts';
import { COASTER_CAR_PANELS } from '../../src/components/world/attractions/coaster-access.ts';
import { thrillSectionAt } from '../../src/components/world/attractions/coaster-thrill-frame.ts';

const root=new URL('../../',import.meta.url),files=['coaster-track.ts','coaster-geometry.ts','coaster-thrill-tower.ts','coaster-thrill-supports.ts','coaster-landscape.ts','attraction-layout.ts'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(new URL(`src/components/world/attractions/${f}`,root))).digest('hex')]));
const before=hashes(),labels=new WeakMap(), original=CoasterBatch.prototype.add;
CoasterBatch.prototype.add=function(...args){
  const stack=new Error().stack.split('\n').slice(2),special=stack.find(s=>/addThrillTower|addEquipment|addCoasterLandscape|addCoasterCliffs|addCoasterTerrainRelief|addLandscapeRocks|addTunnel|addCoasterBuildingArt|addCoasterStationRoof|addArchitecture/.test(s));
  const direct=stack.find(s=>/coaster-geometry\.ts:/.test(s)&&!/CoasterBatch\./.test(s));
  const label=(special??direct??'unknown').trim();original.apply(this,args);labels.set(this.parts[this.parts.length-1],label);
};
const originalFinish=CoasterBatch.prototype.finish, ranges=new WeakMap();
CoasterBatch.prototype.finish=function(){let at=0;const r=this.parts.map(p=>{const start=at;at+=p.getAttribute('position').count/3;return {start,end:at,label:labels.get(p)};});const out=originalFinish.call(this);ranges.set(out,r);return out;};
let geometry;
try{geometry=createCoasterStructure(true);}catch(error){console.error(JSON.stringify({stage:'createCoasterStructure(true)',error:error.stack}));process.exit(1);}
CoasterBatch.prototype.add=original;CoasterBatch.prototype.finish=originalFinish;
const cell=8,key=(x,y,z)=>`${x},${y},${z}`,grid=new Map(),triangles=[];
function cells(min,max,fn){for(let x=Math.floor(min.x/cell);x<=Math.floor(max.x/cell);x++)for(let y=Math.floor(min.y/cell);y<=Math.floor(max.y/cell);y++)for(let z=Math.floor(min.z/cell);z<=Math.floor(max.z/cell);z++)fn(key(x,y,z));}
function insert(min,max,value,target=grid){cells(min,max,k=>{let bucket=target.get(k);if(!bucket)target.set(k,bucket=[]);bucket.push(value);});}
for(const name of ['steel','glow']){
  const g=geometry[name],p=g.getAttribute('position'),r=ranges.get(g);let range=0;
  for(let i=0;i<p.count;i+=3){while(r[range].end<=i/3)range++;const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2),min=a.clone().min(b).min(c),max=a.clone().max(b).max(c);
    const t={triangle:new Triangle(a,b,c),min,max,mesh:name,index:i/3,source:r[range].label};insert(min,max,triangles.length);triangles.push(t);}
}
const colliderGrid=new Map(),colliders=geometry.colliders.map((c,index)=>{
  const q=new Quaternion().setFromEuler(new Euler(...(c.rotation??[0,0,0]))),rotation=new Matrix3();
  // Matrix3 is obtained directly from the quaternion, avoiding an Euler order assumption.
  const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(v=>v.applyQuaternion(q));rotation.set(axes[0].x,axes[1].x,axes[2].x,axes[0].y,axes[1].y,axes[2].y,axes[0].z,axes[1].z,axes[2].z);
  const obb=new OBB(new Vector3(...c.position),new Vector3(...c.half),rotation),extent=new Vector3(...[0,1,2].map(axis=>axes.reduce((s,v,j)=>s+Math.abs(v.getComponent(axis))*c.half[j],0)));
  const item={...c,index,obb,qInverse:q.clone().invert()};insert(obb.center.clone().sub(extent),obb.center.clone().add(extent),index,colliderGrid);return item;
});
const candidates=(min,max,target=grid)=>{const found=new Set();cells(min,max,k=>{for(const n of target.get(k)??[])found.add(n);});return found;};
const ray=new Ray(),hit=new Vector3(),closest=new Vector3();
const round=v=>v.toArray().map(x=>+x.toFixed(4));
const counts={},examples=[],firstByKind={},unique=new Set();
function record(kind,context,details){counts[kind]=(counts[kind]??0)+1;const item={kind,...context,...details};firstByKind[kind]??=item;const signature=`${kind}|${details.mode??''}|${details.collider?.index??details.source}|${context.phase}`;if(!unique.has(signature)){unique.add(signature);if(examples.length<8)examples.push(item);}}
function segment(start,end,context,mode,targetName){const d=end.clone().sub(start),length=d.length();ray.set(start,d.normalize());let nearest=null;
  for(const id of candidates(start.clone().min(end),start.clone().max(end))){const t=triangles[id];if(ray.intersectTriangle(t.triangle.a,t.triangle.b,t.triangle.c,false,hit)){const distance=hit.distanceTo(start);if(distance>.05&&distance<length&&(!nearest||distance<nearest.distance))nearest={distance,point:round(hit),source:t.source,mesh:t.mesh,triangle:t.index};}}
  if(nearest)record('camera-obstruction',context,{mode,target:targetName,...nearest});
}
const panelCorners=COASTER_CAR_PANELS.flatMap(p=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>new Vector3(p.at[0]+x*p.size[0]/2,p.at[1]+y*p.size[1]/2,p.at[2]+z*p.size[2]/2)))));
const dt=Number(process.env.COASTER_AUDIT_STEP??.125),samples=Math.ceil(COASTER_DURATION/dt)+1;
for(let sample=0;sample<samples;sample++){
  const time=Math.min(sample*dt,COASTER_DURATION),u=coasterDistanceAt(time),base=coasterFrame(u),context={time:+time.toFixed(4),u:+u.toFixed(7),phase:coasterPhase(time),section:thrillSectionAt(u),inverted:base.up.y<0};
  for(const mode of ['chase','comfort','first-person']){const pose=coasterRidePose(u,mode),camera=new Vector3(...pose.cameraPosition),target=new Vector3(...pose.cameraTarget);
    if(mode==='first-person')segment(camera,camera.clone().addScaledVector(target.sub(camera).normalize(),2),context,mode,'forward-2m');
    else{segment(camera,target,context,mode,'target');segment(camera,base.point.clone().addScaledVector(base.up,2.2),context,mode,'head');}}
  for(let car=0;car<3;car++){
    const f=coasterFrame(u-car*3.55/COASTER_LENGTH),head=f.point.clone().addScaledVector(f.up,2.2),points=panelCorners.map(p=>p.clone().applyQuaternion(f.rotation).add(f.point));
    points.push(head);const min=f.point.clone().addScalar(-4),max=f.point.clone().addScalar(4),ids=candidates(min,max,colliderGrid);
    for(const id of ids){const c=colliders[id],delta=head.clone().sub(c.obb.center).applyQuaternion(c.qInverse),nearest=new Vector3(...c.half.map((h,j)=>Math.max(-h,Math.min(h,delta.getComponent(j)))));
      if(delta.distanceTo(nearest)<.3)record('head-collider',context,{car,head:round(head),collider:{index:id,position:c.position,half:c.half,surface:!!c.surface,hull:!!c.hull}});
      const rot=new Matrix3(),axes=[f.forward,f.up,f.side];rot.set(axes[0].x,axes[1].x,axes[2].x,axes[0].y,axes[1].y,axes[2].y,axes[0].z,axes[1].z,axes[2].z);
      for(let panel=0;panel<COASTER_CAR_PANELS.length;panel++){const p=COASTER_CAR_PANELS[panel],obb=new OBB(new Vector3(...p.at).applyQuaternion(f.rotation).add(f.point),new Vector3(...p.size).multiplyScalar(.5),rot);if(obb.intersectsOBB(c.obb,1e-8)){record('car-panel-collider',context,{car,panel,collider:{index:id,position:c.position,half:c.half,surface:!!c.surface,hull:!!c.hull}});break;}}
    }
    // Exact mesh proximity at the physical panel corners and the passenger head.
    const contacts=new Set();
    for(let point=0;point<points.length;point++){const p=points[point],radius=point===points.length-1?.3:.045;
      for(const id of candidates(p.clone().addScalar(-radius),p.clone().addScalar(radius))){const t=triangles[id];t.triangle.closestPointToPoint(p,closest);if(p.distanceTo(closest)<radius){const kind=point===points.length-1?'head-mesh':'car-corner-mesh',signature=`${kind}|${t.source}`;if(contacts.has(signature))continue;contacts.add(signature);record(kind,context,{car,point:round(p),source:t.source,mesh:t.mesh,triangle:t.index,contact:round(closest),distance:+p.distanceTo(closest).toFixed(4)});}}
    }
  }
}
const after=hashes(),result={duration:COASTER_DURATION,length:COASTER_LENGTH,step:dt,samples,triangles:triangles.length,colliders:colliders.length,counts,uniqueGroups:unique.size,examples,firstByKind,hashes:before,changedDuringRun:Object.keys(before).filter(f=>before[f]!==after[f]),limits:['Numerical 0.125 s samples are not continuous collision proof.','Merged coaster structure includes architecture, main tower, supports, landscape rocks/cliffs/relief; excludes separately instanced vegetation, other island districts and live avatar/access transitions.','Hull collider OBBs are conservative; actual mesh hits identify confirmed surface contact.','All three default cameras checked; arbitrary user orbit angles excluded.','Panel corner proximity does not prove every mesh edge or face is clear.']};
writeFileSync('/tmp/bobby-coaster-v4-clearance.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({duration:result.duration,step:dt,samples,triangles:result.triangles,colliders:result.colliders,counts,uniqueGroups:unique.size,examples,changedDuringRun:result.changedDuringRun}));geometry.steel.dispose();geometry.glow.dispose();

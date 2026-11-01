/** Run after build_doors.py exports its temporary uncompressed companion.
 * node tools/world/guide/check-vehicle-head.mjs /tmp/vehicle-door-G26-uncompressed.glb */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AnimationMixer, Box3, DoubleSide, LoopOnce, Raycaster, Vector3 } from 'three';
import { loadGuide } from './boot-analysis.mjs';
import { GuideSeatContact, GuideSeatedIdle } from '../../../src/components/world/WorldGuideSeat.ts';
import { GuideDrivingPose } from '../../../src/components/world/WorldGuideVehicle.ts';
import { skinnedWorldPoint } from '../../../src/components/world/WorldGuideStop.ts';
import contract from '../vehicles/door-contract.json' with {type:'json'};

const file=process.argv[2];if(!file)throw new Error('Supply the uncompressed G26 companion');
const {gltf:car}=await loadGuide(pathToFileURL(file));
car.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=DoubleSide;});
car.scene.updateMatrixWorld(true);
const {gltf:{scene,animations}}=await loadGuide(new URL('./out/G24_uncompressed.glb',import.meta.url));
const contact=new GuideSeatContact(scene,animations),idle=new GuideSeatedIdle(scene),pose=new GuideDrivingPose(scene);
const mixer=new AnimationMixer(scene),clip=animations.find(c=>c.name==='SitDown'),action=mixer.clipAction(clip).setLoop(LoopOnce,1);
action.clampWhenFinished=true;action.play();mixer.update(clip.duration);
const refs=[];scene.traverse(m=>{if(!m.isSkinnedMesh)return;
  const ids=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;
  for(let i=0;i<ids.count;i++){let k=0;for(let j=0;j<4;j++)if(m.skeleton.bones[ids.getComponent(i,j)].name==='head')k+=w.getComponent(i,j);
    if(k>.9)refs.push({mesh:m,index:i});}
});
const results=[];
for(const time of [0,3,9,10.1,12,19,28,29.1]){
  pose.restore();idle.restore();mixer.update(0);idle.elapsed=time;idle.apply(0,true);pose.apply('coupe',1);
  scene.updateMatrixWorld(true);const posterior=contact.sample(new Vector3());
  for(const side of [-1,1]){
    const seat=new Vector3(...contract.coupe.seat);seat.z*=side;
    const points=refs.map(r=>skinnedWorldPoint(r.mesh,r.index,new Vector3()).sub(posterior).add(seat));
    const box=new Box3().setFromPoints(points),center=box.getCenter(new Vector3()),ray=new Raycaster();
    let intersections=0;
    for(const p of points){const d=p.clone().sub(center);ray.set(center,d.clone().normalize());ray.far=d.length();if(ray.intersectObject(car.scene,true).length)intersections++;}
    results.push({time,side,intersections,headTop:box.max.y});
  }
}
const passed=results.every(r=>r.intersections===0);
console.log(JSON.stringify({passed,method:'Helmet-centre to actual skinned helmet vertices against closed car triangles; sampled breathing and gaze. Not a continuous full-body collision proof.',
  companionSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),helmetVertices:refs.length,seat:contract.coupe.seat,results},null,2));
process.exitCode=passed?0:1;

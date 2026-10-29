import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, PointLight, RGBADepthPacking, ShaderMaterial, Vector3, Vector4 } from 'three';
import { buildDjcClubGeometry, buildDjcMirrorGeometry, buildDjcSpotsGeometry, DJC_MIRROR_POSITION,DJC_MIRROR_RADIUS, type ClubBatch } from './WorldDjcClubGeometry';
import { CLUB } from './djc-club-layout';
import { night } from './WorldNight';
import { isWorldRunning, windUniforms } from './WorldWind';
import { actorState } from './WorldGrass';
import WorldClubWater from './WorldClubWater';
import { CLUB_LIGHTS, createClubBeamMaterial, createClubLightSpill, createClubMirrorMaterial } from './WorldClubLighting';

const RUNNING_RADIUS_SQ=180*180;
const keys:ClubBatch[]=['wood','stone','metal','fabric','foliage','glass','amber','cyan'];
function materials() {
  const base=(roughness:number,metalness=0)=>new MeshStandardMaterial({vertexColors:true,roughness,metalness});
  const result={wood:base(.85),stone:base(.95),metal:base(.49,.35),fabric:base(.94),foliage:base(.94),glass:base(.35,.1),amber:base(.65),cyan:base(.55)};
  result.fabric.side=DoubleSide;result.foliage.side=DoubleSide;
  result.amber.emissive.set('#ffcf8d');result.cyan.emissive.set('#66beb8');
  const push={uClubPushers:{value:Array.from({length:4},()=>new Vector4(0,-1000,0,0))},uClubPushCount:{value:0}};
  result.foliage.userData.clubPushUniforms=push;
  result.foliage.onBeforeCompile=shader=>{
    shader.uniforms.uWindTime=windUniforms.uWindTime;shader.uniforms.uWindStrength=windUniforms.uWindStrength;
    Object.assign(shader.uniforms,push);
    shader.vertexShader='uniform float uWindTime; uniform float uWindStrength; attribute float aClubWind; uniform vec4 uClubPushers[4];uniform int uClubPushCount;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float gust=sin(uWindTime*1.35+position.x*.43+position.z*.29);
      transformed.x += .10*aClubWind*uWindStrength*gust;
      transformed.z += .07*aClubWind*uWindStrength*sin(uWindTime*1.1+position.z*.36);
      vec3 shove=vec3(0.0);
      for(int i=0;i<4;i++) {
        if(i>=uClubPushCount)break;
        vec4 actor=uClubPushers[i];vec2 d=position.xz-actor.xz;float dist=length(d);
        float fall=(1.-smoothstep(.08,actor.w+.9,dist))*step(abs(position.y-actor.y),2.2);
        vec2 dir=dist>.001?d/dist:vec2(1.,0.);
        shove+=vec3(dir.x,-.22,dir.y)*(.62*fall*clamp(aClubWind*2.8,0.,1.));
      }
      transformed+=clamp(shove,vec3(-.62,-.15,-.62),vec3(.62,0.,.62));
    `);
  };
  result.foliage.customProgramCacheKey=()=> 'djc-frond-contact-wind-v2';
  const foliageDepth=new MeshDepthMaterial({depthPacking:RGBADepthPacking,side:DoubleSide});
  foliageDepth.onBeforeCompile=result.foliage.onBeforeCompile;
  foliageDepth.customProgramCacheKey=()=> 'djc-frond-contact-depth-v2';
  return {...result,foliageDepth};
}
function spotMaterial() {
  return new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,vertexColors:true,uniforms:{uAmount:{value:0}},
    vertexShader:'varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float uAmount;varying vec2 vUv;varying vec3 vColor;void main(){float d=length(vUv);float a=pow(max(0.,1.-d),1.6)*uAmount;gl_FragColor=vec4(vColor,a);\n#include <colorspace_fragment>\n}',
  });
}

/** beat is the actual playback clock in beats; energy is a bounded 0..1 audio activity value.
 * Neither callback enters React state. Ambient motion uses the island's pause-aware wind clock. */
export default function WorldDjcClubVisual({beat,energy}:{beat?:()=>number;energy?:()=>number}) {
  const group=useRef<Group>(null),mirror=useRef<Mesh>(null),spots=useRef<Mesh>(null);
  const lights=useRef<(PointLight|null)[]>([]),beams=useRef<(Mesh|null)[]>([]);
  const resources=useMemo(()=>({geometry:buildDjcClubGeometry(),mirror:buildDjcMirrorGeometry(),spots:buildDjcSpotsGeometry(),materials:materials(),
    mirrorMaterial:createClubMirrorMaterial(),spot:spotMaterial(),spill:createClubLightSpill(),
    beamGeometry:new CylinderGeometry(.035,1,1,18,1,true),beamMaterial:createClubBeamMaterial(),up:new Vector3(0,1,0),start:new Vector3(),target:new Vector3(),direction:new Vector3()}),[]);
  useEffect(()=>()=>{
    Object.values(resources.geometry.batches).forEach(g=>g.dispose());resources.geometry.pool.dispose();resources.mirror.dispose();resources.spots.dispose();
    Object.values(resources.materials).forEach(m=>m.dispose());resources.mirrorMaterial.dispose();resources.spot.dispose();
    resources.spill.geometry.dispose();resources.spill.material.dispose();resources.beamGeometry.dispose();resources.beamMaterial.dispose();
  },[resources]);
  useFrame(({camera})=>{
    const n=night.value,m=resources.materials;
    m.amber.emissiveIntensity=.08+n*3.4;m.cyan.emissiveIntensity=.08+n*2.2;
    resources.mirrorMaterial.userData.clubLightUniforms.uMirrorNight.value=n;
    resources.spill.material.uniforms.uAmount.value=n*.8;resources.beamMaterial.uniforms.uAmount.value=n*.065;
    const near=(camera.position.x-CLUB.center[0])**2+(camera.position.z-CLUB.center[2])**2<RUNNING_RADIUS_SQ;
    if(group.current)group.current.visible=near;
    lights.current.forEach((light,i)=>{if(light){light.visible=near&&n>.01;light.intensity=n*CLUB_LIGHTS[i].intensity;}});
    resources.spot.uniforms.uAmount.value=n*1.55;
    if(!isWorldRunning()||!near)return;
    // Reuse the world's one actor tracker. Contact fades spatially as bodies leave the leaves;
    // roots stay fixed, palm crowns ignore ground-level actors, and no timer or second tracker runs.
    const push=m.foliage.userData.clubPushUniforms;let count=0;
    for(const actor of actorState.actors) {
      if(count>=4)break;
      if((actor.x-CLUB.center[0])**2+(actor.z-CLUB.center[2])**2>70*70)continue;
      push.uClubPushers.value[count++].set(actor.x,actor.y,actor.z,actor.radius);
    }
    push.uClubPushCount.value=count;
    const audioBeat=beat?.()??0,audioEnergy=Math.max(0,Math.min(1,energy?.()??0));
    const b=Number.isFinite(audioBeat)?audioBeat:0,e=Number.isFinite(audioEnergy)?audioEnergy:0,t=windUniforms.uWindTime.value;
    const pulse=e*(.5+.5*Math.cos(b*Math.PI*2));
    if(mirror.current) { mirror.current.rotation.y=t*.17;mirror.current.rotation.z=.018*Math.sin(t*.3)*windUniforms.uWindStrength.value; }
    if(spots.current) {spots.current.rotation.y=t*.14;spots.current.visible=n>.04;}
    resources.spot.uniforms.uAmount.value=n*(1.55+pulse*.45);
    for(let i=0;i<2;i++){const light=lights.current[i];if(light)light.intensity=n*CLUB_LIGHTS[i].intensity*(1+pulse*.16);}
    beams.current.forEach((mesh,i)=>{if(!mesh)return;const z=i?62:48;
      resources.start.set(43.5,7.88,z);resources.target.set(40+Math.sin(t*.32+i*2)*4,1.65,55+Math.cos(t*.23+i*2)*6);
      resources.direction.subVectors(resources.start,resources.target);const length=resources.direction.length();
      mesh.position.copy(resources.start).add(resources.target).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(resources.up,resources.direction.normalize());mesh.scale.set(1.2,length,1.2);mesh.visible=n>.04;
    });
  });
  return <>
    <group ref={group} name="djc-beach-club-visual" dispose={null}>
      {keys.map(key=><mesh key={key} name={`djc-${key}`} geometry={resources.geometry.batches[key]} material={resources.materials[key]} receiveShadow castShadow={key==='wood'||key==='fabric'||key==='foliage'} customDepthMaterial={key==='foliage'?resources.materials.foliageDepth:undefined} />)}
      <WorldClubWater geometry={resources.geometry.pool} basinMaterial={resources.materials.stone}/>
      <mesh ref={mirror} name="djc-mirror-ball" position={DJC_MIRROR_POSITION} geometry={resources.mirror} material={resources.mirrorMaterial}/>
      <mesh ref={spots} name="djc-mirror-floor-fragments" position={[CLUB.dance[0],CLUB.dance[1]+.022,CLUB.dance[2]]} geometry={resources.spots} material={resources.spot} renderOrder={3}/>
      <mesh name="djc-lantern-spill" geometry={resources.spill.geometry} material={resources.spill.material} renderOrder={3}/>
      {[0,1].map(i=><mesh key={i} ref={m=>{beams.current[i]=m;}} name={`djc-moving-beam-${i}`} geometry={resources.beamGeometry} material={resources.beamMaterial} renderOrder={4}/>)}
    </group>
    {CLUB_LIGHTS.map((light,i)=><pointLight key={i} ref={l=>{lights.current[i]=l;}} name={`djc-venue-light-${i}`} position={light.position} color={light.color} intensity={0} distance={light.range} decay={2} castShadow={false}/>)}
    <RigidBody name="djc-mirror-ball-solid" position={DJC_MIRROR_POSITION} type="fixed" colliders={false} userData={{solid:true,assetId:'djc-mirror-ball',cameraBlocker:true}}>
      <BallCollider name="djc-mirror-ball-camera-collider" args={[DJC_MIRROR_RADIUS]} friction={.5} restitution={0}/>
    </RigidBody>
    {(['surface','solid'] as const).map(kind=><RigidBody key={kind} name={`djc-${kind}`} type="fixed" colliders={false} userData={{[kind]:true,assetId:'djc-club'}}>
      <TrimeshCollider name={`djc-${kind}-same-mesh`} args={[resources.geometry.colliders[kind].vertices,resources.geometry.colliders[kind].indices]} friction={kind==='surface'?.9:.65} restitution={0}/>
    </RigidBody>)}
  </>;
}

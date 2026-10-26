import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshStandardMaterial, PointLight, ShaderMaterial } from 'three';
import { buildDjcClubGeometry, buildDjcMirrorGeometry, buildDjcSpotsGeometry, DJC_MIRROR_POSITION, type ClubBatch } from './WorldDjcClubGeometry';
import { CLUB } from './djc-club-layout';
import { night } from './WorldNight';
import { isWorldRunning, windUniforms } from './WorldWind';

const RUNNING_RADIUS_SQ=180*180;
const keys:ClubBatch[]=['wood','stone','metal','fabric','foliage','glass','amber','cyan'];
function materials() {
  const base=(roughness:number,metalness=0)=>new MeshStandardMaterial({vertexColors:true,roughness,metalness});
  const result={wood:base(.85),stone:base(.95),metal:base(.49,.35),fabric:base(.94),foliage:base(.94),glass:base(.35,.1),amber:base(.65),cyan:base(.55)};
  result.fabric.side=DoubleSide;result.foliage.side=DoubleSide;
  result.amber.emissive.set('#ffcf8d');result.cyan.emissive.set('#66beb8');
  result.foliage.onBeforeCompile=shader=>{
    shader.uniforms.uWindTime=windUniforms.uWindTime;shader.uniforms.uWindStrength=windUniforms.uWindStrength;
    shader.vertexShader='uniform float uWindTime; uniform float uWindStrength; attribute float aClubWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float gust=sin(uWindTime*1.35+position.x*.43+position.z*.29);
      transformed.x += .10*aClubWind*uWindStrength*gust;
      transformed.z += .07*aClubWind*uWindStrength*sin(uWindTime*1.1+position.z*.36);
    `);
  };
  result.foliage.customProgramCacheKey=()=> 'djc-frond-wind-v1';
  return result;
}
function poolMaterial() {
  return new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,uniforms:{uTime:windUniforms.uWindTime,uWind:windUniforms.uWindStrength,uNight:{value:0}},
    vertexShader:`uniform float uTime;uniform float uWind;varying vec3 vWorld;
      void main(){vec3 p=position;p.y+=.009*uWind*sin(p.x*1.4+p.z*.8+uTime*.9);vWorld=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;uniform float uNight;varying vec3 vWorld;
      void main(){vec2 p=vWorld.xz;float wave=sin(p.x*2.7+p.y*1.3+uTime*.7)*sin(p.y*2.4-p.x*.8-uTime*.53);
      float caustic=pow(max(0.,1.-abs(wave)*5.),3.);float rim=length((p-vec2(57.,55.))/vec2(7.,10.));
      vec3 col=mix(vec3(.12,.54,.55),vec3(.065,.31,.35),uNight*.75)+caustic*vec3(.12,.17,.12)*(1.-uNight*.5);
      col+=smoothstep(.96,1.,rim)*.13;gl_FragColor=vec4(col,.69);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,
  });
}
function spotMaterial() {
  return new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,vertexColors:true,uniforms:{uAmount:{value:0}},
    vertexShader:'varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float uAmount;varying vec2 vUv;varying vec3 vColor;void main(){float d=length(vUv);float a=pow(max(0.,1.-d),1.6)*uAmount;gl_FragColor=vec4(vColor,a);}',
  });
}

/** beat is the actual playback clock in beats; energy is a bounded 0..1 audio activity value.
 * Neither callback enters React state. Ambient motion uses the island's pause-aware wind clock. */
export default function WorldDjcClubVisual({beat,energy}:{beat?:()=>number;energy?:()=>number}) {
  const group=useRef<Group>(null),mirror=useRef<Mesh>(null),spots=useRef<Mesh>(null);
  const warm=useRef<PointLight>(null),cool=useRef<PointLight>(null);
  const resources=useMemo(()=>({geometry:buildDjcClubGeometry(),mirror:buildDjcMirrorGeometry(),spots:buildDjcSpotsGeometry(),materials:materials(),
    mirrorMaterial:new MeshStandardMaterial({vertexColors:true,roughness:.28,metalness:.55}),water:poolMaterial(),spot:spotMaterial()}),[]);
  useEffect(()=>()=>{
    Object.values(resources.geometry.batches).forEach(g=>g.dispose());resources.geometry.pool.dispose();resources.mirror.dispose();resources.spots.dispose();
    Object.values(resources.materials).forEach(m=>m.dispose());resources.mirrorMaterial.dispose();resources.water.dispose();resources.spot.dispose();
  },[resources]);
  useFrame(({camera})=>{
    const n=night.value,m=resources.materials;
    m.amber.emissiveIntensity=.08+n*1.65;m.cyan.emissiveIntensity=.08+n*.85;resources.water.uniforms.uNight.value=n;
    const near=(camera.position.x-CLUB.center[0])**2+(camera.position.z-CLUB.center[2])**2<RUNNING_RADIUS_SQ;
    if(group.current)group.current.visible=near;
    if(warm.current)warm.current.visible=near&&n>.01;if(cool.current)cool.current.visible=near&&n>.01;
    if(warm.current)warm.current.intensity=n*34;if(cool.current)cool.current.intensity=n*16;
    resources.spot.uniforms.uAmount.value=n*.34;
    if(!isWorldRunning()||!near)return;
    const audioBeat=beat?.()??0,audioEnergy=Math.max(0,Math.min(1,energy?.()??0));
    const b=Number.isFinite(audioBeat)?audioBeat:0,e=Number.isFinite(audioEnergy)?audioEnergy:0,t=windUniforms.uWindTime.value;
    const pulse=e*(.5+.5*Math.cos(b*Math.PI*2));
    if(mirror.current) { mirror.current.rotation.y=t*.075+Math.sin(b*.025)*.14*e;mirror.current.rotation.z=.018*Math.sin(t*.3)*windUniforms.uWindStrength.value; }
    if(spots.current) {spots.current.rotation.y=t*.043+Math.sin(b*.05)*.045*e;spots.current.visible=n>.04;}
    resources.spot.uniforms.uAmount.value=n*(.34+pulse*.14);
    if(warm.current)warm.current.intensity=n*(34+8*pulse);if(cool.current)cool.current.intensity=n*(16+4*pulse);
  });
  return <>
    <group ref={group} name="djc-beach-club-visual" dispose={null}>
      {keys.map(key=><mesh key={key} name={`djc-${key}`} geometry={resources.geometry.batches[key]} material={resources.materials[key]} receiveShadow castShadow={key==='wood'||key==='fabric'} />)}
      <mesh name="djc-pool-water-no-collider" geometry={resources.geometry.pool} material={resources.water} renderOrder={2}/>
      <mesh ref={mirror} name="djc-mirror-ball" position={DJC_MIRROR_POSITION} geometry={resources.mirror} material={resources.mirrorMaterial}/>
      <mesh ref={spots} name="djc-mirror-floor-fragments" position={[CLUB.dance[0],CLUB.dance[1]+.022,CLUB.dance[2]]} geometry={resources.spots} material={resources.spot} renderOrder={3}/>
    </group>
    <pointLight ref={warm} name="djc-amber-wash" position={[38,5.8,50]} color="#ffd399" intensity={0} distance={14} decay={2} castShadow={false}/>
    <pointLight ref={cool} name="djc-teal-wash" position={[43,5.5,60]} color="#8ac8c0" intensity={0} distance={12} decay={2} castShadow={false}/>
    {(['surface','solid'] as const).map(kind=><RigidBody key={kind} name={`djc-${kind}`} type="fixed" colliders={false} userData={{[kind]:true,assetId:'djc-club'}}>
      <TrimeshCollider name={`djc-${kind}-same-mesh`} args={[resources.geometry.colliders[kind].vertices,resources.geometry.colliders[kind].indices]} friction={kind==='surface'?.9:.65} restitution={0}/>
    </RigidBody>)}
  </>;
}

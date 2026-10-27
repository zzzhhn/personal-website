import { useEffect, useMemo } from 'react';
import { BufferGeometry, CanvasTexture, CatmullRomCurve3, Float32BufferAttribute, MeshStandardMaterial, SRGBColorSpace, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { ATTRACTION_ROADS } from './attraction-layout';
import { terrainHeight } from '../WorldLandform';
import { useWorldStore } from '../store';

/** A continuous ribbon follows the same terrain query used by the ground collider. */
function ribbon(points:Vector3[],half:number,offset:number,lift:number) {
  const p:number[]=[],indices:number[]=[];
  points.forEach((v,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
    for(const side of [-1,1]){
      const x=v.x-dz/l*(offset+half*side),z=v.z+dx/l*(offset+half*side);
      p.push(x,terrainHeight(x,z)+lift,z);
    }
    if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}
  });
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export default function WorldAttractionApproach() {
  const lang=useWorldStore(s=>s.lang);
  const sign=useMemo(()=>{
    const c=document.createElement('canvas');c.width=768;c.height=320;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#253e3a';ctx.fillRect(0,0,768,320);ctx.strokeStyle='#b7b791';ctx.lineWidth=6;ctx.strokeRect(14,14,740,292);
    ctx.textAlign='center';ctx.fillStyle='#f3e7cb';ctx.font='600 50px "Songti SC",serif';ctx.fillText(lang==='zh'?'北岸游乐区':'NORTH CAPE',384,90);
    ctx.font='32px system-ui';ctx.fillText(lang==='zh'?'物资清点场  ←  西侧':'←  INVENTORY YARD',384,170);
    ctx.fillText(lang==='zh'?'意图过山车  →  东侧':'INTENT COASTER  →',384,230);
    const texture=new CanvasTexture(c);texture.colorSpace=SRGBColorSpace;return texture;
  },[lang]);
  useEffect(()=>()=>sign.dispose(),[sign]);
  const built=useMemo(()=>{
    const asphalt:BufferGeometry[]=[],edge:BufferGeometry[]=[],paint:BufferGeometry[]=[];
    for(const path of ATTRACTION_ROADS){
      const curve=new CatmullRomCurve3(path.map(([x,z])=>new Vector3(x,0,z)),false,'centripetal');
      const points=curve.getPoints(Math.ceil(curve.getLength()));
      asphalt.push(ribbon(points,3.2,0,.045));
      for(const side of [-1,1])edge.push(ribbon(points,.55,side*3.7,.022));
      for(let i=3;i<points.length-3;i+=8)paint.push(ribbon(points.slice(i,i+4),.075,0,.055));
    }
    const groups=[asphalt,edge,paint],colors=['#65665e','#b9ae8c','#e1d4ad'];
    const meshes=groups.map((parts,i)=>{
      const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());
      return {geometry,indices:new Uint32Array(geometry.index!.array),material:new MeshStandardMaterial({color:colors[i],roughness:.96,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})};
    });
    return meshes;
  },[]);
  useEffect(()=>()=>built.forEach(m=>{m.geometry.dispose();m.material.dispose();}),[built]);
  return <group name="north-attractions-approach" userData={{noOcclusionFade:true}}>
    {built.map((m,i)=><mesh key={i} geometry={m.geometry} material={m.material} receiveShadow dispose={null}/>)}
    <RigidBody type='fixed' colliders={false} userData={{surface:true,assetId:'north-road'}}>
      <TrimeshCollider args={[built[0].geometry.getAttribute('position').array as Float32Array,built[0].indices]} friction={.9}/>
    </RigidBody>
    {[[.8,-59],[-19,-117]].map(([x,z],i)=><group key={i} position={[x,terrainHeight(x,z),z]}>
      <mesh position={[0,1.2,0]} castShadow><boxGeometry args={[.14,2.4,.14]}/><meshStandardMaterial color='#63543e' roughness={.9}/></mesh>
      <mesh position={[0,2.4,0]}><planeGeometry args={[4.2,1.75]}/><meshBasicMaterial map={sign} toneMapped={false}/></mesh>
    </group>)}
  </group>;
}

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial } from 'three';
import { useWorldStore } from '../store';
import { factoryActor, useFactoryStore } from './factory-store';
import { FACTORY, factoryWorld } from './factory-layout';

/** One draw for the requested walking route. No frame-by-frame UI publication;
 * the map marker advances only after physically reaching the next clear corner. */
export default function WorldFactoryGuide(){
  const {world:physics,rapier}=useRapier();
  const clearance=useMemo(()=>({shape:new rapier.Capsule(.48,.34),rotation:{x:0,y:0,z:0,w:1},
    from:{x:0,y:0,z:0},direction:{x:0,y:0,z:0}}),[rapier]);
  const route=useFactoryStore(s=>s.route),cursor=useRef(1);
  const data=useMemo(()=>{
    if(!route)return null;
    const vertices:number[]=[],starts:number[]=[0];
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
      starts[i]=vertices.length/3;
      for(let d=1;d<length-.5;d+=2.5){
        const x=a[0]+ux*d,z=a[2]+uz*d,y=a[1]+.035;
        vertices.push(x+ux*.38,y,z+uz*.38,x+uz*.22-ux*.24,y,z-ux*.22-uz*.24,x-uz*.22-ux*.24,y,z+ux*.22-uz*.24);
      }
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const material=new MeshBasicMaterial({color:'#e8c67b',polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    return {geometry,material,starts};
  },[route]);
  useEffect(()=>{cursor.current=1;return()=>{data?.geometry.dispose();data?.material.dispose();};},[data]);
  useFrame(()=>{
    if(!route||!data)return;
    const world=useWorldStore.getState(),point=route[cursor.current];if(!point||world.paused||document.hidden)return;
    const target=factoryWorld(point),waypoint=world.waypoint;
    if(!waypoint||Math.hypot(waypoint[0]-target[0],waypoint[1]-target[2])>.1){useFactoryStore.setState({route:null});return;}
    const p=factoryActor.position;
    if(!factoryActor.grounded||Math.abs(p[1]-target[1])>1.4||Math.hypot(p[0]-target[0],p[2]-target[2])>1.8)return;
    const following=route[cursor.current+1];
    if(following){
      const q=clearance;Object.assign(q.from,{x:p[0],y:p[1]+.02,z:p[2]});
      Object.assign(q.direction,{x:following[0]+FACTORY.origin[0]-p[0],y:0,z:following[2]+FACTORY.origin[2]-p[2]});
      if(physics.castShape(q.from,q.rotation,q.direction,q.shape,0,1,true,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS|rapier.QueryFilterFlags.EXCLUDE_DYNAMIC))return;
    }
    cursor.current++;
    if(cursor.current>=route.length){useFactoryStore.setState({route:null});useWorldStore.setState({waypoint:null});return;}
    data.geometry.setDrawRange(data.starts[cursor.current],Infinity);
    const next=route[cursor.current];useWorldStore.setState({waypoint:[next[0]+FACTORY.origin[0],next[2]+FACTORY.origin[2]]});
  });
  return data?<mesh name="factory-walking-guide" geometry={data.geometry} material={data.material} dispose={null}/>:null;
}

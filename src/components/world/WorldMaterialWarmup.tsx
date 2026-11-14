import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Sphere, type Mesh, type Material, type InstancedMesh } from 'three';
import { useWorldStore } from './store';

/** Warm nearby material programs through the supported parallel-compile path.
 * This never draws, hides geometry or delays ready. One mesh is submitted per
 * task: compiling the entire island here would compete with the first turn. */
export default function WorldMaterialWarmup() {
  const {gl,scene,camera}=useThree();
  useEffect(()=>{
    if(!gl.extensions.has('KHR_parallel_shader_compile'))return;
    const seen=new WeakMap<Mesh,{materials:Material[];versions:number[]}>(),bounds=new Sphere();
    let timer:ReturnType<typeof setTimeout>|null=null,scanTimer:ReturnType<typeof setTimeout>|null=null;
    let queue:Mesh[]=[],disposed=false,busy=false;
    const submit=()=>{
      timer=null;if(disposed||document.hidden||busy)return;
      const mesh=queue.shift();if(!mesh)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const old=seen.get(mesh);
      if(old&&old.materials.length===materials.length&&materials.every((m,i)=>m===old.materials[i]&&m.version===old.versions[i])){schedule();return;}
      busy=true;
      seen.set(mesh,{materials:[...materials],versions:materials.map(m=>m.version)});
      gl.compileAsync(mesh,camera,scene).catch(()=>{seen.delete(mesh);}).finally(()=>{busy=false;schedule();});
    };
    const schedule=()=>{if(!disposed&&!document.hidden&&queue.length&&timer===null)timer=setTimeout(submit,24);};
    const scan=()=>{
      scanTimer=null;if(disposed||document.hidden)return;
      const nearby:{mesh:Mesh;distance:number}[]=[];
      scene.traverseVisible(o=>{
        const m=o as Mesh;if(!m.isMesh||o.userData.shadowProxy)return;
        const instance=m as InstancedMesh,g=m.geometry;
        if(instance.isInstancedMesh){if(!instance.boundingSphere)instance.computeBoundingSphere();}
        else if(!g.boundingSphere)g.computeBoundingSphere();
        const local=instance.isInstancedMesh?instance.boundingSphere:g.boundingSphere;if(!local)return;
        bounds.copy(local).applyMatrix4(m.matrixWorld);
        const distance=Math.max(0,bounds.center.distanceTo(camera.position)-bounds.radius);
        if(distance<60)nearby.push({mesh:m,distance});
      });
      queue=nearby.sort((a,b)=>a.distance-b.distance).map(p=>p.mesh);schedule();
    };
    const requestScan=()=>{if(scanTimer!==null)clearTimeout(scanTimer);scanTimer=setTimeout(scan,120);};
    let lastX=0,lastZ=0;
    const off=useWorldStore.subscribe((s,p)=>{
      const moved=Math.hypot(s.position[0]-lastX,s.position[2]-lastZ)>24;
      if(moved){lastX=s.position[0];lastZ=s.position[2];}
      if(moved||s.loading.loaded!==p.loading.loaded||s.loading.total!==p.loading.total||s.loading.active!==p.loading.active)requestScan();
    });
    const visible=()=>{if(!document.hidden)requestScan();};
    document.addEventListener('visibilitychange',visible);requestScan();
    return()=>{disposed=true;off();queue=[];document.removeEventListener('visibilitychange',visible);if(timer!==null)clearTimeout(timer);if(scanTimer!==null)clearTimeout(scanTimer);};
  },[gl,scene,camera]);
  return null;
}

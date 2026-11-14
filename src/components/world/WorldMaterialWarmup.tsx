import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useWorldStore } from './store';

/** Submit material programs before an unseen surface reaches the camera. The
 * renderer's supported parallel-compile path does not draw, hide meshes, change
 * quality or delay the ready signal. No synchronous fallback on unsupported GPUs.
 * Coalesce streamed asset updates; avoid repeatedly compiling on 10Hz movement. */
export default function WorldMaterialWarmup() {
  const {gl,scene,camera}=useThree();
  const epoch=useRef(0);
  useEffect(()=>{
    if(!gl.extensions.has('KHR_parallel_shader_compile'))return;
    const run=++epoch.current;
    let timer:ReturnType<typeof setTimeout>|null=null,busy=false,again=false,disposed=false;
    const submit=()=>{
      timer=null;if(disposed||document.hidden)return;
      if(busy){again=true;return;}
      busy=true;again=false;
      gl.compileAsync(scene,camera).catch(()=>{/* Rendering retains its normal error reporting. */}).finally(()=>{
        busy=false;if(!disposed&&run===epoch.current&&again)schedule();
      });
    };
    const schedule=()=>{if(disposed)return;if(timer!==null)clearTimeout(timer);timer=setTimeout(submit,80);};
    const off=useWorldStore.subscribe((s,p)=>{
      if(s.loading.loaded!==p.loading.loaded||s.loading.total!==p.loading.total||s.loading.active!==p.loading.active)schedule();
    });
    const visible=()=>{if(!document.hidden)schedule();};
    document.addEventListener('visibilitychange',visible);schedule();
    return()=>{disposed=true;epoch.current++;off();document.removeEventListener('visibilitychange',visible);if(timer!==null)clearTimeout(timer);};
  },[gl,scene,camera]);
  return null;
}

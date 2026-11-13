import { useEffect,useMemo } from 'react';
import { ShaderMaterial,DoubleSide,Color } from 'three';
import { useFrame } from '@react-three/fiber';
import { alphaMotion } from './alpha-state';
import { night } from '../WorldNight';
export default function AlphaCloudSea(){const material=useMemo(()=>new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,uniforms:{uTime:{value:0},uNight:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uNight;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float n=noise(p*9.+vec2(uTime*.012,0.))*.6+noise(p*23.+uTime*.005)*.28+noise(p*51.)*.12;
 float ring=smoothstep(.24,.42,r)*(1.-smoothstep(.8,1.,r));float gap=smoothstep(-.45,-.1,p.x)+smoothstep(.05,.3,p.y);float a=ring*smoothstep(.2,.65,n)*.72*min(1.,gap);vec3 color=mix(vec3(.8,.87,.89),vec3(.1,.16,.24),uNight);gl_FragColor=vec4(color*(.87+n*.18),a);}`}),[]);
 useFrame(()=>{material.uniforms.uTime.value=alphaMotion.time;material.uniforms.uNight.value=night.value;});useEffect(()=>()=>material.dispose(),[material]);return <mesh name="alpha-local-cloud-sea" position={[0,64,20]} rotation={[-Math.PI/2,0,0]} material={material}><planeGeometry args={[365,340]}/></mesh>;}

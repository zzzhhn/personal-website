import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, NearestFilter, RedFormat, ShaderMaterial, Vector2, Vector3, type Points } from 'three';
import { climate, night } from './WorldNight';
import { windUniforms } from './WorldWind';
import { useWorldStore } from './store';
import { WEATHER_BUDGET, coverOrigin, fillWeatherCover, weatherSeeds, weatherSurfaceHeight } from './world-weather';

const vertex = /* glsl */`
uniform float uTime,uSnow,uPixel,uTop;
uniform vec2 uCenter,uCoverOrigin;
uniform sampler2D uCover;
varying float vVisible,vDepth;
void main(){
  vec3 p=vec3(uCenter.x+(position.x-.5)*48.0,uTop,uCenter.y+(position.y-.5)*48.0);
  float fall=mix(17.0,1.55,uSnow), phase=fract(position.z+uTime*fall/40.0);
  p.y-=phase*40.0;
  p.x+=sin(uTime*.65+position.z*21.0)*uSnow*.8+(1.0-uSnow)*(1.0-phase)*.8;
  p.z+=cos(uTime*.5+position.x*17.0)*uSnow*.5;
  vec2 cell=(p.xz-uCoverOrigin)/2.0, uv=(floor(cell)+.5)/33.0;
  float roof=max(max(texture2D(uCover,uv).r,texture2D(uCover,uv+vec2(1.0/33.0,0)).r),
    max(texture2D(uCover,uv+vec2(0,1.0/33.0)).r,texture2D(uCover,uv+vec2(1.0/33.0)).r));
  vVisible=step(roof+.12,p.y)*step(0.0,cell.x)*step(0.0,cell.y)*step(cell.x,31.9)*step(cell.y,31.9);
  vVisible*=1.0-smoothstep(19.0,24.0,length(p.xz-uCenter));
  vec4 eye=viewMatrix*vec4(p,1.0);vDepth=-eye.z;
  gl_Position=projectionMatrix*eye;
  gl_PointSize=clamp(mix(110.0,38.0,uSnow)*uPixel/max(vDepth,2.0),mix(4.0,1.8,uSnow),mix(20.0,6.0,uSnow));
}`;
const fragment = /* glsl */`
uniform float uSnow,uOpacity,uNight; varying float vVisible,vDepth;
void main(){vec2 p=gl_PointCoord-.5;
  float streak=(1.0-smoothstep(.035,.12,abs(p.x+p.y*.15)))*(1.0-smoothstep(.28,.5,abs(p.y)));
  float flake=1.0-smoothstep(.16,.48,length(p));
  float alpha=mix(streak*.55,flake*.88,uSnow)*uOpacity*vVisible*smoothstep(1.0,2.8,vDepth);
  if(alpha<.015)discard;
  vec3 color=mix(vec3(.63,.77,.84),vec3(.92,.96,1.0),uSnow)*(1.0-uNight*.22);
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Rain/snow each use one draw, zero physics bodies, and no per-frame vertex uploads. */
export default function WorldWeather() {
  const { world, rapier } = useRapier();
  const { camera, gl, invalidate } = useThree();
  const rain = useRef<Points>(null), snow = useRef<Points>(null);
  const resources = useMemo(() => {
    const count = WEATHER_BUDGET.coverSize ** 2, heights = new Float32Array(count).fill(200);
    const texture = new DataTexture(heights, WEATHER_BUDGET.coverSize, WEATHER_BUDGET.coverSize, RedFormat, FloatType);
    texture.minFilter = texture.magFilter = NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
    const origin = new Vector2(), center = new Vector2();
    const make = (isSnow: boolean) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(weatherSeeds(isSnow ? 720 : 1200), 3));
      const material = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false,
        uniforms: { uCover:{value:texture}, uCoverOrigin:{value:origin}, uCenter:{value:center}, uTime:windUniforms.uWindTime,
          uSnow:{value:isSnow?1:0}, uPixel:{value:1}, uTop:{value:30}, uOpacity:{value:0}, uNight:{value:0} } });
      return {geometry,material};
    };
    return { rain:make(false), snow:make(true), texture, origin, center, pending:new Float32Array(count), heights };
  }, []);
  const scan = useRef({ index: Infinity, origin:[0,0] as [number,number], ready:false, colliders:-1 });
  const ray = useMemo(() => new rapier.Ray(new Vector3(0,120,0),new Vector3(0,-1,0)),[rapier]);
  useEffect(() => () => {
    for(const entry of [resources.rain,resources.snow]){entry.geometry.dispose();entry.material.dispose();}
    resources.texture.dispose();
  },[resources]);
  useFrame(() => {
    const r = scan.current, s = useWorldStore.getState(), active = climate.rain + climate.snow > .001;
    if(rain.current)rain.current.visible=active&&climate.rain>.001;
    if(snow.current)snow.current.visible=active&&climate.snow>.001;
    if(!active||document.hidden)return;
    const count=world.colliders.len(), next=coverOrigin(camera.position.x,camera.position.z);
    if(r.index>=resources.pending.length&&(!r.ready||next[0]!==r.origin[0]||next[1]!==r.origin[1]||count!==r.colliders)){
      r.index=0;r.origin=next;r.colliders=count;
    }
    if(r.index<resources.pending.length){
      r.index=fillWeatherCover(resources.pending,r.index,r.origin,(x,z)=>weatherSurfaceHeight(world,ray,x,z));
      if(r.index===resources.pending.length){resources.heights.set(resources.pending);resources.texture.needsUpdate=true;resources.origin.set(...r.origin);r.ready=true;}
      else invalidate();
    }
    resources.center.set(Math.round(camera.position.x/8)*8,Math.round(camera.position.z/8)*8);
    for(const [kind,entry] of [['rain',resources.rain],['snow',resources.snow]] as const){
      entry.geometry.setDrawRange(0,WEATHER_BUDGET[s.quality][kind]);
      entry.material.uniforms.uOpacity.value=r.ready?climate[kind]:0;
      entry.material.uniforms.uPixel.value=gl.getPixelRatio();
      entry.material.uniforms.uTop.value=Math.max(camera.position.y+12,s.position[1]+20);
      entry.material.uniforms.uNight.value=night.value;
    }
  });
  return <group name="world-weather"><points ref={rain} name="weather-rain" {...resources.rain} frustumCulled={false}/>
    <points ref={snow} name="weather-snow" {...resources.snow} frustumCulled={false}/></group>;
}

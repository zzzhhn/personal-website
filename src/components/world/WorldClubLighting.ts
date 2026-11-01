import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, ShaderMaterial } from 'three';
import { CLUB_LANTERNS } from './djc-club-layout';
import { windUniforms } from './WorldWind';

/** Six shadowless lights illuminate bodies and architecture; the remaining lanterns
 * use a single bounded spill batch. No per-lamp shadow maps or reflection cameras. */
export const CLUB_LIGHTS = [
  { position:[38,5.5,52] as [number,number,number], color:'#ffc989', intensity:140, range:28 },
  { position:[44,5.7,59] as [number,number,number], color:'#a2e4ed', intensity:100, range:27 },
  ...[0,3,5,8].map(index=>({position:CLUB_LANTERNS[6+index].map((v,i)=>i===1?v+.6:v) as [number,number,number],
    color:'#ffcf92',intensity:18,range:17})),
];

export function createClubMirrorMaterial() {
  const material=new MeshStandardMaterial({vertexColors:true,roughness:.12,metalness:.85});
  const uniforms={uMirrorNight:{value:0}};
  material.userData.clubLightUniforms=uniforms;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vMirrorNormal;varying vec3 vMirrorWorld;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMirrorNormal=normalize(mat3(modelMatrix)*normal);vMirrorWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader='uniform float uMirrorNight;varying vec3 vMirrorNormal;varying vec3 vMirrorWorld;\n'+shader.fragmentShader
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        vec3 mirrorN=normalize(vMirrorNormal),mirrorV=normalize(cameraPosition-vMirrorWorld);
        float silver=pow(max(0.,dot(mirrorN,normalize(mirrorV+normalize(vec3(-.6,.4,.8))))),48.);
        float blue=pow(max(0.,dot(mirrorN,normalize(mirrorV+normalize(vec3(.5,.3,-.8))))),36.);
        float rim=pow(1.-max(0.,dot(mirrorN,mirrorV)),3.);
        totalEmissiveRadiance+=uMirrorNight*(diffuseColor.rgb*.65+vec3(1.,.88,.65)*silver*7.+vec3(.4,.8,1.)*blue*5.+rim*.3);
      `);
  };
  material.customProgramCacheKey=()=> 'club-mirror-keylights-v1';
  return material;
}

export function createClubLightSpill() {
  const positions:number[]=[],uv:number[]=[],colors:number[]=[];
  CLUB_LANTERNS.slice(6).forEach(([x,,z])=>{
    const c=new Color('#ffd09b'),r=2.2;
    for(const [u,v] of [[-1,-1],[-1,1],[1,1],[-1,-1],[1,1],[1,-1]]) {
      positions.push(x+u*r,1.446,z+v*r);uv.push(u,v);colors.push(c.r,c.g,c.b);
    }
  });
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeBoundingSphere();
  const material=new ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:AdditiveBlending,
    uniforms:{uAmount:{value:0}},
    vertexShader:'varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;varying vec3 vColor;uniform float uAmount;void main(){float a=pow(max(0.,1.-length(vUv)),2.);gl_FragColor=vec4(vColor,a*uAmount);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  return {geometry,material};
}

/** A pair of softly faded stage beams, animated from the existing pause-aware clock. */
export function createClubBeamMaterial() {
  return new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,side:2,
    uniforms:{uAmount:{value:0},uTime:windUniforms.uWindTime},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float uAmount;uniform float uTime;void main(){float edge=pow(sin(vUv.x*3.14159265),2.);float lengthFade=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.82,1.,vUv.y));vec3 c=mix(vec3(.35,.8,1.),vec3(1.,.7,.35),.5+.5*sin(uTime*.21));gl_FragColor=vec4(c,edge*lengthFade*uAmount);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
}

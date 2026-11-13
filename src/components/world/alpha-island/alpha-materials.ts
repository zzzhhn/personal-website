import { DoubleSide, MeshStandardMaterial } from 'three';
import { ALPHA_COLORS, type AlphaFinish } from './alpha-art';
export const alphaMaterialUniforms={night:{value:0},time:{value:0}};
/** Native authored coordinates remain on the actual merged runtime geometry. This adapter
 * supplies wood fibres / stone bedding / paper fibres and bounded night bounce, no new lights. */
export function alphaMaterial(finish:AlphaFinish|'ground'|'bark'|'needles'){
 const colors={...ALPHA_COLORS,ground:'#ffffff',bark:'#68503a',needles:'#526c36'};
 const m=new MeshStandardMaterial({color:colors[finish],roughness:finish==='metal'?.36:finish==='glass'?.2:finish==='paper'?.8:.92,metalness:finish==='metal'?.65:0,vertexColors:finish!=='bark'&&finish!=='needles',side:finish==='paper'||finish==='needles'?DoubleSide:undefined});
 m.name=`alpha-${finish}-v1`;
 if(finish==='glass'){m.emissive.set('#ffc976');m.emissiveIntensity=.16;}
 if(finish==='paper'){m.emissive.set('#ffa949');m.emissiveIntensity=.5;}
 m.onBeforeCompile=s=>{s.uniforms.uAlphaNight=alphaMaterialUniforms.night;s.vertexShader='varying vec3 vAlphaP;\nvarying vec3 vAlphaW;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAlphaP=position; vAlphaW=(modelMatrix*vec4(position,1.0)).xyz;');
 s.fragmentShader=`varying vec3 vAlphaP; varying vec3 vAlphaW; uniform float uAlphaNight;
 float aHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float aNoise(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(mix(aHash(i),aHash(i+vec3(1,0,0)),f.x),mix(aHash(i+vec3(0,1,0)),aHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(aHash(i+vec3(0,0,1)),aHash(i+vec3(1,0,1)),f.x),mix(aHash(i+vec3(0,1,1)),aHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec3 ap=vAlphaP;float alphaPatch=aNoise(ap*1.9);float detail=1.-smoothstep(.008,.06,length(fwidth(ap)));
 float grain=${finish==='wood'||finish==='darkwood'||finish==='bark'?'sin(ap.x*115.+aNoise(vec3(ap.x*5.,ap.y*.7,ap.z*5.))*9.)':finish==='stone'?'sin(ap.y*23.+aNoise(ap*.7)*3.)':'aNoise(ap*55.)'};
 diffuseColor.rgb*=.92+alphaPatch*.15+grain*.045*detail;
 ${finish==='ground'?`float seam=pow(.5+.5*sin(ap.y*19.+sin(ap.x*.2)*1.6),12.);float slope=1.-smoothstep(.64,.87,normal.y);diffuseColor.rgb*=1.-seam*slope*.16;`:''}
 `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(alphaPatch-.5)*.1,.16,1.);').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
 // Bounded diffuse bounce around physical lamp anchors; no global exposure changes.
 float spill=exp(-distance(vAlphaW,vec3(173.7,6.2,153.65))*.3)+exp(-distance(vAlphaW,vec3(227.,85.,232.))*.36);
 totalEmissiveRadiance+=diffuseColor.rgb*uAlphaNight*(vec3(.025,.038,.065)+vec3(.22,.12,.035)*spill);
 `);};
 m.customProgramCacheKey=()=>`alpha-craft-${finish}-v1`;return m;
}

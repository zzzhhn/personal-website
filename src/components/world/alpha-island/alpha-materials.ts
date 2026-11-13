import { DoubleSide, MeshStandardMaterial,Vector2,type Texture } from 'three';
import { facilitySurfaceUniforms,registerFacilityMaterial } from '../WorldFacilitySurface';
import { alphaBoardUniforms,alphaBoardMaskHead,alphaBoardMaskFragment } from './alpha-boarding-mask';
import { ALPHA_COLORS, isAlphaWood, type AlphaFinish } from './alpha-art';
export const alphaMaterialUniforms={night:{value:0},time:{value:0}};
/** Native authored coordinates remain on the actual merged runtime geometry. This adapter
 * supplies wood fibres / stone bedding / paper fibres and bounded night bounce, no new lights. */
export function alphaMaterial(finish:AlphaFinish|'ground'|'bark'|'needles',groundTextures?:Texture[],clipBoarding=false){
 const wood=isAlphaWood(finish),colors={...ALPHA_COLORS,ground:'#ffffff',needles:'#526c36'};
 const m=new MeshStandardMaterial({color:colors[finish],roughness:finish==='metal'?.36:finish==='glass'?.2:finish==='paper'?.8:finish==='lodgeFrame'?.78:finish==='lodgeWall'?.98:finish==='lodgeFloor'?.87:finish==='grammarBark'?.98:.92,metalness:finish==='metal'?.65:0,vertexColors:finish!=='bark'&&finish!=='grammarBark'&&finish!=='needles',side:finish==='paper'||finish==='needles'?DoubleSide:undefined});
 m.name=`alpha-${finish}-v1`;
 registerFacilityMaterial(m);
 if(wood){const shared=facilitySurfaceUniforms();m.map=shared.uFacilityWood.value;m.normalMap=shared.uFacilityNormal.value;m.normalScale=new Vector2(finish==='lodgeFrame'?.18:.3,finish==='lodgeFrame'?.18:.3);m.roughnessMap=shared.uFacilityRough.value;m.color.set(finish==='wood'?'#d2b688':finish==='darkwood'?'#9d8060':colors[finish]);}
 if(finish==='glass'){m.emissive.set('#ffc976');m.emissiveIntensity=.16;}
 if(finish==='paper'){m.emissive.set('#ffa949');m.emissiveIntensity=.5;}
 m.onBeforeCompile=s=>{if(groundTextures||clipBoarding)Object.assign(s.uniforms,alphaBoardUniforms);if(groundTextures){for(const [i,k] of ['uAlphaGrass','uAlphaDirt','uAlphaGrassNr','uAlphaDirtNr'].entries())s.uniforms[k]={value:groundTextures[i]};}s.uniforms.uAlphaNight=alphaMaterialUniforms.night;s.vertexShader=(finish==='ground'?'attribute vec3 alphaGround;varying vec3 vAlphaGround;\n':'')+(wood?'attribute float alphaEnd;varying float vAlphaEnd;\n':'')+'varying vec2 vAlphaUv;\nvarying vec3 vAlphaP;\nvarying vec3 vAlphaW;\nvarying vec3 vAlphaN;\n'+s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${finish==='ground'?'vAlphaGround=alphaGround;':''}vAlphaUv=uv;${wood?'vAlphaEnd=alphaEnd;':''}vAlphaP=position;vAlphaN=normalize(mat3(modelMatrix)*normal); vAlphaW=(modelMatrix*vec4(position,1.0)).xyz;`);
 s.fragmentShader=((groundTextures||clipBoarding)?alphaBoardMaskHead:'')+(groundTextures?'uniform sampler2D uAlphaGrass;uniform sampler2D uAlphaDirt;uniform sampler2D uAlphaGrassNr;uniform sampler2D uAlphaDirtNr;varying vec3 vAlphaGround;\n':'')+(wood?'varying float vAlphaEnd;\n':'')+`varying vec2 vAlphaUv; varying vec3 vAlphaP; varying vec3 vAlphaW; varying vec3 vAlphaN; uniform float uAlphaNight;
 float aHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float aNoise(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(mix(aHash(i),aHash(i+vec3(1,0,0)),f.x),mix(aHash(i+vec3(0,1,0)),aHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(aHash(i+vec3(0,0,1)),aHash(i+vec3(1,0,1)),f.x),mix(aHash(i+vec3(0,1,1)),aHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 ${groundTextures||clipBoarding?alphaBoardMaskFragment:''}
 vec3 ap=vAlphaP;float alphaPatch=aNoise(ap*1.9);float detail=1.-smoothstep(.008,.06,length(fwidth(ap)));
 float grain=${wood?'sin(vAlphaUv.y*43.+aNoise(vec3(vAlphaUv.y*3.,vAlphaUv.x*.7,0.))*3.)':finish==='grammarBark'?'0.':finish==='bark'?'sin(ap.x*115.+aNoise(vec3(ap.x*5.,ap.y*.7,ap.z*5.))*9.)':finish==='stone'?'sin(ap.y*2.3+aNoise(ap*.16)*2.)*.4+aNoise(ap*.8)*.6':'aNoise(ap*55.)'};
 diffuseColor.rgb*=.92+alphaPatch*.15+grain*.025*detail;
 ${wood?`float endRings=.5+.5*sin(length(vAlphaUv*vec2(1.,1.15))*31.+aNoise(vec3(vAlphaUv*3.,0.))*1.3);diffuseColor.rgb*=mix(1.,.82+endRings*.16,vAlphaEnd);`:''}
 ${finish==='grammarBark'?`vec2 barkUv=vAlphaUv;float barkFlake=aNoise(vec3(barkUv.x*5.5,barkUv.y*2.7,0.));float barkBreak=aNoise(vec3(barkUv.x*3.2+8.,barkUv.y*1.8,0.));float barkEdge=smoothstep(.46,.55,barkFlake)*(1.-smoothstep(.56,.66,barkFlake))*smoothstep(.33,.58,barkBreak);diffuseColor.rgb*=.89+barkFlake*.2-barkEdge*.075;float alphaBarkHeight=(barkFlake*.008-barkEdge*.006)*detail;`:''}
 ${groundTextures?`vec2 guv=ap.xz/2.1;vec3 scan=mix(texture2D(uAlphaGrass,guv).rgb/vec3(.118,.152,.03),texture2D(uAlphaDirt,guv*1.2).rgb/vec3(.315,.291,.096),vAlphaGround.x);diffuseColor.rgb*=mix(vec3(1.),clamp(scan,vec3(.5),vec3(1.5)),.48*(1.-vAlphaGround.y)*smoothstep(.62,.87,vAlphaN.y));vec3 aGroundNr=mix(texture2D(uAlphaGrassNr,guv).rgb,texture2D(uAlphaDirtNr,guv*1.2).rgb,vAlphaGround.x);`:''}
 ${finish==='ground'?`float rockWeight=1.-smoothstep(.62,.87,vAlphaN.y);float bedPhase=ap.y*2.3+aNoise(ap*.075)*2.;float bedFilter=1.-smoothstep(.1,.7,fwidth(bedPhase));float seam=smoothstep(.86,.98,.5+.5*sin(bedPhase))*bedFilter;float rockMass=aNoise(ap*vec3(.13,.09,.13));diffuseColor.rgb*=1.+rockWeight*((rockMass-.5)*.18-seam*.07);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.06,1.01,.94),rockWeight*smoothstep(.62,.8,rockMass)*.45);float aRockRelief=rockWeight*(aNoise(ap*.55)*.018-seam*.009);`:''}
 `).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(alphaPatch-.5)*.1,.16,1.);').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${groundTextures?'vec3 bW=vec3(aGroundNr.r*2.-1.,0.,-(aGroundNr.g*2.-1.))*.35*(1.-vAlphaGround.y)*smoothstep(.62,.87,vAlphaN.y)*detail;normal=normalize(normal+mat3(viewMatrix)*bW);':''}`).replace('#include <lights_physical_fragment>',` ${finish==='grammarBark'?'vec3 abd=-vViewPosition,absx=dFdx(abd),absy=dFdy(abd),abrx=cross(absy,normal),abry=cross(normal,absx);float abdet=dot(absx,abrx);normal=normalize(abs(abdet)*normal-sign(abdet)*(dFdx(alphaBarkHeight)*abrx+dFdy(alphaBarkHeight)*abry));':''} ${groundTextures?'vec3 adp=-vViewPosition,asx=dFdx(adp),asy=dFdy(adp),arx=cross(asy,normal),ary=cross(normal,asx);float adet=dot(asx,arx);normal=normalize(abs(adet)*normal-sign(adet)*(dFdx(aRockRelief)*arx+dFdy(aRockRelief)*ary));':''}\n#include <lights_physical_fragment>`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
 // Bounded diffuse bounce around physical lamp anchors; no global exposure changes.
 float spill=exp(-distance(vAlphaW,vec3(173.7,6.2,153.65))*.3)+exp(-distance(vAlphaW,vec3(227.,85.,232.))*.36);
 totalEmissiveRadiance+=diffuseColor.rgb*uAlphaNight*(vec3(.025,.038,.065)+vec3(.22,.12,.035)*spill);
 `);};
 m.customProgramCacheKey=()=>`alpha-craft-${finish}-v5-${clipBoarding}`;return m;
}

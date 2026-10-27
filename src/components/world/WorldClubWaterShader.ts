import { AdditiveBlending, DoubleSide, ShaderMaterial, Vector2, Vector3, Matrix4 } from 'three';
import { CLUB_POOL } from './djc-club-layout';
import { windUniforms } from './WorldWind';
import { seaGlintUniforms } from './WorldWater';
import { WATER_IMPACT_GLSL, waterImpactUniforms } from './WorldWaterInteraction';

// Shared optical surface: the floor light and the refraction use identical wind waves.
// The contact rings remain on the existing bounded, pause-aware interaction clock.
export const CLUB_WATER_GLSL = /* glsl */`
uniform float uTime, uWind, uSurfaceY, uNight;
uniform vec2 uPoolCenter, uPoolRadii;
${WATER_IMPACT_GLSL}
float poolDistance(vec2 p){
  vec2 d=p-uPoolCenter,q=d/uPoolRadii;float r=length(q);
  if(r<.00001)return -min(uPoolRadii.x,uPoolRadii.y);
  float a=atan(q.y,q.x),s=1.+.07*sin(3.*a+.4)+.045*cos(5.*a-.5);
  return length(d)*(1.-s/r);
}
float poolFloor(vec2 p){float edge=smoothstep(0.,3.4,-poolDistance(p));
  float shelf=.55+.28*clamp((uPoolCenter.x-p.x-1.)/7.,0.,1.);return 1.-(1.-shelf)*edge;}
vec3 poolNormal(vec2 p){
  vec2 a=vec2(2.2,1.1),b=vec2(-1.5,3.4),c=vec2(4.1,-2.7),d=vec2(-5.2,-3.3);
  vec2 slope=(a*.018*cos(dot(p,a)-uTime*.95)+b*.014*cos(dot(p,b)+uTime*.72)
    +c*.013*cos(dot(p,c)-uTime*1.24)+d*.009*cos(dot(p,d)+uTime*1.47))*uWind;
  slope+=waterDisturbance(p,uSurfaceY,uTime).xy;
  return normalize(vec3(-slope.x,1.,-slope.y));
}
`;

export function clubWaterUniforms() {
  return { uTime:windUniforms.uWindTime,uWind:windUniforms.uWindStrength,...waterImpactUniforms,...seaGlintUniforms,
    uNight:{value:0},uSurfaceY:{value:CLUB_POOL.waterY},uPoolCenter:{value:new Vector2(CLUB_POOL.center[0],CLUB_POOL.center[2])},
    uPoolRadii:{value:new Vector2(...CLUB_POOL.radii)},uCaustics:{value:null},uCausticExtent:{value:29},uOptics:{value:0},
    uRefraction:{value:null},uDepth:{value:null},uReflection:{value:null},uCaptureVP:{value:new Matrix4()},
    uCaptureInverse:{value:new Matrix4()},uReflectionMatrix:{value:new Matrix4()},uCaptureEye:{value:new Vector3()} };
}
export type ClubWaterUniforms=ReturnType<typeof clubWaterUniforms>;

export function createClubOpticalWater(uniforms:ClubWaterUniforms) {
  return new ShaderMaterial({name:'Club water: depth, transmission and local reflection',uniforms,side:DoubleSide,
    vertexShader:`varying vec3 vPoolWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vPoolWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:/* glsl */`
      ${CLUB_WATER_GLSL}
      uniform sampler2D uRefraction,uDepth,uReflection;
      uniform mat4 uCaptureVP,uCaptureInverse,uReflectionMatrix;
      uniform vec3 uCaptureEye,uWaterSkyTop,uWaterSkyHorizon,uSunDir,uGlint;
      uniform float uOptics;
      varying vec3 vPoolWorld;
      vec2 screenUV(vec3 p){vec4 q=uCaptureVP*vec4(p,1.);return q.xy/q.w*.5+.5;}
      vec3 hitAt(vec2 uv){float d=texture2D(uDepth,uv).r;vec4 p=uCaptureInverse*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      void main(){
        vec3 p=vPoolWorld,n=poolNormal(p.xz),eye=normalize(cameraPosition-p);
        float fresnel=.0204+.9796*pow(1.-max(0.,dot(eye,n)),5.);
        vec3 reflected=reflect(-eye,n);
        vec3 sky=mix(uWaterSkyHorizon,uWaterSkyTop,pow(clamp(reflected.y,0.,1.),.45));
        vec3 transmitted=vec3(.32,.43,.38)*mix(1.,.16,uNight);
        float thickness=max(.05,uSurfaceY-poolFloor(p.xz))/max(.25,eye.y);
        if(uOptics>.5){
          vec2 base=screenUV(p);vec3 baseHit=hitAt(base);
          vec3 ray=refract(normalize(p-uCaptureEye),n,1./1.333);
          float depth=clamp(uSurfaceY-baseHit.y,.03,uSurfaceY-poolFloor(p.xz)+.06);
          vec2 uv=screenUV(p+ray*depth/max(.25,-ray.y));uv=clamp(uv,vec2(.002),vec2(.998));
          vec3 hit=hitAt(uv);
          // Foreground geometry must never bleed into the underwater image at silhouettes.
          if(hit.y>uSurfaceY+.015){uv=base;hit=baseHit;}
          vec4 sampleColor=texture2D(uRefraction,uv);
          float valid=step(.001,sampleColor.a)*step(hit.y,uSurfaceY+.025);
          transmitted=mix(transmitted,sampleColor.rgb,valid);
          thickness=mix(thickness,clamp(length(hit-p),.02,4.),valid);
          vec4 projected=uReflectionMatrix*vec4(p,1.);
          vec2 mirrorUV=projected.xy/projected.w+n.xz*.008;
          vec4 mirror=texture2D(uReflection,clamp(mirrorUV,vec2(.002),vec2(.998)));
          float inFrame=step(0.,mirrorUV.x)*step(mirrorUV.x,1.)*step(0.,mirrorUV.y)*step(mirrorUV.y,1.);
          sky=mix(sky,mirror.rgb,mirror.a*inFrame);
        }
        vec3 transmission=exp(-vec3(1.35,.34,.20)*thickness);
        vec3 body=transmitted*transmission+vec3(.025,.19,.17)*(1.-transmission)*mix(.45,.07,uNight);
        vec3 col=mix(body,sky,clamp(fresnel,0.,.92));
        float sun=max(0.,dot(reflected,uSunDir));col+=uGlint*(pow(sun,320.)*.15+pow(sun,45.)*.006);
        float contact=waterDisturbance(p.xz,uSurfaceY,uTime).w;
        col=mix(col,vec3(.55,.77,.73)*mix(1.,.2,uNight),min(.24,contact*.6));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Refracted sunlight grid deposits energy on the basin, not on the water surface. */
export function createClubCausticMaterial(uniforms:ClubWaterUniforms) {
  return new ShaderMaterial({uniforms,side:DoubleSide,transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,
    vertexShader:/* glsl */`
      ${CLUB_WATER_GLSL}
      uniform vec3 uSunDir;uniform float uCausticExtent;
      varying vec3 vSource,vHit;varying float vInside;
      void main(){vec2 p=position.xy*uCausticExtent+uPoolCenter;
        vSource=vec3(p.x,uSurfaceY,p.y);vec3 n=poolNormal(p);
        // Night uses the local pool lamps; grazing sunlight is bounded to the basin.
        vec3 light=normalize(mix(vec3(uSunDir.x,max(.25,uSunDir.y),uSunDir.z),vec3(.18,1.,.1),uNight));
        vec3 ray=refract(-light,n,1./1.333);
        vHit=vSource+ray*(uSurfaceY-poolFloor(p))/max(.2,-ray.y);
        vInside=1.-smoothstep(-.15,.05,poolDistance(p));
        gl_Position=vec4((vHit.xz-uPoolCenter)/uCausticExtent,0.,1.);
      }`,
    fragmentShader:/* glsl */`varying vec3 vSource,vHit;varying float vInside;
      void main(){float oldArea=length(cross(dFdx(vSource),dFdy(vSource)));
        float newArea=length(cross(dFdx(vHit),dFdy(vHit)));
        float focus=clamp(oldArea/max(newArea,.000001),0.,5.);
        gl_FragColor=vec4(vec3(focus*.2*vInside),1.);}`,
  });
}

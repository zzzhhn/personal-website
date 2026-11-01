import { DoubleSide, ShaderMaterial } from 'three';
import { windUniforms } from './WorldWind';
import { seaGlintUniforms } from './WorldWater';
import { WATER_IMPACT_GLSL, waterImpactUniforms } from './WorldWaterInteraction';
import { CLUB_POOL } from './djc-club-layout';
import { poolWaveGlsl } from './WorldWaterWaves';

/** Pool has an actual mineral-lined basin underneath. Angle-dependent alpha lets that
 * geometry supply depth, while analytical normals and the island sun supply the sheen. */
export function createClubPoolWaterMaterial() { return createPoolWaterMaterial(CLUB_POOL.waterY, true); }

export function createPoolWaterMaterial(surfaceY: number, illuminated = false) {
  return new ShaderMaterial({ transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { uTime: windUniforms.uWindTime, uWind: windUniforms.uWindStrength, uNight: { value: 0 }, ...waterImpactUniforms,
      ...seaGlintUniforms, uSurfaceY: { value: surfaceY },uVenueLight:{value:illuminated?1:0} },
    vertexShader: `uniform float uTime;uniform float uWind;uniform float uSurfaceY;varying vec3 vWorld;
      ${WATER_IMPACT_GLSL}
      ${poolWaveGlsl(true)}
      void main(){vec4 p=modelMatrix*vec4(position,1.);p.y+=poolWindField(p.xz,uTime,uWind).z;
        vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform float uTime;uniform float uWind;uniform float uNight;uniform float uVenueLight;uniform float uSurfaceY;uniform vec3 uSunDir;uniform vec3 uGlint;uniform vec3 uWaterSkyTop;uniform vec3 uWaterSkyHorizon;varying vec3 vWorld;
      ${WATER_IMPACT_GLSL}
      ${poolWaveGlsl()}
      void main(){vec2 p=vWorld.xz;vec4 wake=waterDisturbance(p,uSurfaceY,uTime);
        vec2 slope=poolWindField(p,uTime,uWind).xy+wake.xy*uWind;
        vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));vec3 eye=normalize(cameraPosition-vWorld);
        float fresnel=.025+.975*pow(1.-max(0.,dot(eye,normal)),5.);
        vec3 reflected=reflect(-eye,normal);
        float sunAngle=max(0.,dot(reflected,uSunDir));
        float glint=pow(sunAngle,110.)+pow(sunAngle,28.)*.09;
        vec2 cells=p+vec2(sin(p.y*1.13+p.x*.31+uTime*.23),sin(p.x*.89-p.y*.27-uTime*.19))*.48;
        float network=abs(sin(cells.x*2.7+cells.y*1.1+uTime*.32)*sin(cells.y*2.2-cells.x*.7-uTime*.28));
        float caustic=pow(max(0.,1.-network*8.),3.);
        vec3 col=mix(vec3(.025,.29,.28),vec3(.018,.09,.13),uNight*.85);
        // Reflect the same changing sky used above the island, without a second render pass.
        vec3 sky=mix(uWaterSkyHorizon,uWaterSkyTop,pow(clamp(reflected.y,0.,1.),.45));
        col=mix(col,sky,clamp(fresnel*.9,0.,.85));
        col+=uGlint*glint*1.6+caustic*vec3(.065,.085,.06)*(1.-uNight*.85);
        col+=uVenueLight*uNight*(vec3(.015,.24,.22)+caustic*vec3(.09,.23,.21));
        col=mix(col,mix(vec3(.66,.84,.78),vec3(.2,.35,.4),uNight),min(.18,wake.w*.45));
        gl_FragColor=vec4(col,.36+fresnel*.43+min(.2,wake.w*.4));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

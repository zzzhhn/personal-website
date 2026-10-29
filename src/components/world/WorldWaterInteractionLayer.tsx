import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three';
import { actorState } from './WorldGrass';
import { useMineManifest } from './alpha-mine-assets';
import { waterSurfaceAt } from './WorldWaterSurfaces';
import { isWorldRunning, windUniforms } from './WorldWind';
import { night } from './WorldNight';
import { publishWaterImpacts, waterContacts, waterImpactUniforms, WATER_IMPACT_CAPACITY } from './WorldWaterInteraction';

const actorWaterSurface = (x: number, z: number) => waterSurfaceAt(x, z, useMineManifest.getState().manifest?.basin);

/** A single shared, bounded impact pass for every water surface. The 96 droplets are
 * permanent GPU vertices, not new meshes or particle systems spawned per footstep. */
export default function WorldWaterInteractionLayer() {
  const points = useRef<Points>(null);
  const resources = useMemo(() => {
    const geometry = new BufferGeometry();
    const ids = [], seeds = [];
    for (let i = 0; i < WATER_IMPACT_CAPACITY; i++) for (let j = 0; j < 12; j++) { ids.push(i); seeds.push((j + .5) / 12); }
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(ids.length * 3), 3));
    geometry.setAttribute('aImpact', new Float32BufferAttribute(ids, 1));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
    const material = new ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { ...waterImpactUniforms, uTime: windUniforms.uWindTime, uMotion: windUniforms.uWindStrength, uNight: { value: 0 } },
      vertexShader: `uniform vec4 uWaterImpact[${WATER_IMPACT_CAPACITY}];uniform vec4 uWaterImpactMeta[${WATER_IMPACT_CAPACITY}];
        uniform float uTime;uniform float uMotion;attribute float aImpact;attribute float aSeed;varying float vAlpha;
        void main(){int i=int(aImpact);vec4 a=uWaterImpact[i];vec4 m=uWaterImpactMeta[i];float age=uTime-a.z;
          float angle=aSeed*6.2831853+float(i)*.47;float velocity=(1.2+m.z*2.2)*(.65+.35*sin(aSeed*39.));
          float height=velocity*age-4.9*age*age;
          vec3 p=vec3(a.x+cos(angle)*(m.y+age*(.5+m.z)),m.x+.035+height,a.y+sin(angle)*(m.y+age*(.5+m.z)));
          vAlpha=a.w*uMotion*step(0.,age)*step(age,.75)*step(0.,height)*min(1.,m.z*3.);
          vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(75./max(1.,-mv.z),1.5,4.5);
        }`,
      fragmentShader: `uniform float uNight;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5);if(r>.5||vAlpha<.01)discard;
        gl_FragColor=vec4(mix(vec3(.62,.9,.94),vec3(.12,.25,.32),uNight),vAlpha*(1.-smoothstep(.25,.5,r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    return { geometry, material };
  }, []);
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); waterContacts.reset(); publishWaterImpacts(0); }, [resources]);
  useFrame(() => {
    if (!isWorldRunning()) return;
    const t = windUniforms.uWindTime.value;
    waterContacts.step(actorState.actors, t, actorWaterSurface); publishWaterImpacts(t);
    resources.material.uniforms.uNight.value = night.value;
    if (points.current) points.current.visible = waterContacts.impacts.some(p => p.strength > 0 && t - p.at < .75);
  });
  return <points ref={points} name="water-contact-splashes" geometry={resources.geometry} material={resources.material} frustumCulled={false} renderOrder={3} />;
}

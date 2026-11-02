import { createContext, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, ShaderMaterial, type Object3D } from 'three';
import { createSuitcaseContactModel, suitcaseContactSupport, suitcaseContactWheels, type SuitcaseContactSlot } from './camp-suitcase-contact';

export const CampSuitcaseContactContext = createContext<SuitcaseContactSlot['register'] | null>(null);

/** One draw / eight triangles, no texture, light, shadow pass or scene-wide AO. These tiny radial
 * patches express tire contact only where the actual finite flagstones support the current pose. */
export default function WorldCampSuitcaseContact({ slot }: { slot: SuitcaseContactSlot }) {
  const scene = useThree(state => state.scene);
  const resource = useMemo(() => {
    const geometry = new BufferGeometry(), uv: number[] = [], indices: number[] = [];
    for (let wheel = 0; wheel < 4; wheel++) {
      const base = wheel * 4; uv.push(0, 0, 1, 0, 1, 1, 0, 1); indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(48), 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('strength', new BufferAttribute(new Float32Array(16), 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2)); geometry.setIndex(indices);
    const material = new ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: 'attribute float strength; varying vec2 contactUv; varying float contactStrength; void main() { contactUv = uv; contactStrength = strength; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 contactUv; varying float contactStrength; void main() { vec2 q = contactUv * 2.0 - 1.0; float radial = max(0.0, 1.0 - dot(q, q)); gl_FragColor = vec4(0.0, 0.0, 0.0, .32 * contactStrength * pow(radial, 1.5)); }',
    });
    const mesh = new Mesh(geometry, material); mesh.name = 'camp-content-C15-wheel-contact'; mesh.visible = false;
    mesh.raycast = () => {}; // Optional shading must never intercept exploration/interaction rays.
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
    mesh.userData = { noOcclusionFade: true, assetId: 'C15', contactOnly: true };
    return { mesh, geometry, material, users: 0 };
  }, []);
  useLayoutEffect(() => {
    resource.users++;
    let revision = -1, current: Object3D | null = null, model: ReturnType<typeof createSuitcaseContactModel> | null = null;
    let support: ReturnType<typeof suitcaseContactSupport> | null = null;
    const update = () => {
      if (revision !== slot.revision) {
        model?.dispose(); model = null; current = slot.root; revision = slot.revision;
        if (current) try {
          // The synchronous flagstone slice is present by the first normal scene frame. Missing
          // support fails closed; no polling or exploration-blocking dependency is introduced.
          const paving = support ? null : scene.getObjectByName('camp-C02-flagstones');
          if (paving) support = suitcaseContactSupport(paving);
          const wheels = suitcaseContactWheels(current);
          if (support && wheels.length === 4) model = createSuitcaseContactModel(wheels, support, (change, positions, strengths, visible) => {
            resource.mesh.visible = visible;
            if (!visible) return;
            if (change === 'pose') { (resource.geometry.getAttribute('position').array as Float32Array).set(positions); resource.geometry.getAttribute('position').needsUpdate = true; }
            (resource.geometry.getAttribute('strength').array as Float32Array).set(strengths); resource.geometry.getAttribute('strength').needsUpdate = true;
          });
        } catch (error) { console.warn('[camp-C15-contact] hiding optional contact patches', error); }
      }
      if (!model || !current) return;
      current.updateWorldMatrix(true, false);
      let visible = true;
      for (let parent: Object3D | null = current; parent; parent = parent.parent) if (!parent.visible) { visible = false; break; }
      model.update(current.matrixWorld, slot.fade, visible);
    };
    slot.update = update;
    return () => {
      if (slot.update === update) slot.update = null;
      model?.dispose(); resource.mesh.visible = false;
      resource.users--; queueMicrotask(() => { if (!resource.users) { resource.geometry.dispose(); resource.material.dispose(); } });
    };
  }, [resource, scene, slot]);
  return <primitive object={resource.mesh} dispose={null} />;
}

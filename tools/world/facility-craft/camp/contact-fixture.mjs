import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as React from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { compileWorldComponent } from '../../alpha-mine-tests/component-host.mjs';
import '../../alpha-mine-tests/register.mjs';

const root = new URL('../../../../',import.meta.url);
export const contact = await import('../../../../src/components/world/camp-suitcase-contact.ts');
const balance = await import('../../../../src/components/world/camp-surface-balance.ts');
const patchComponent = compileWorldComponent(new URL('src/components/world/WorldCampSuitcaseContact.tsx', root));
const familyComponent = compileWorldComponent(new URL('src/components/world/WorldCampFacilityCraft.tsx', root));
const path = 'public/assets/world/facility-craft/camp/camp-facilities-v1.glb';
const bytes = existsSync(new URL(path,root)) ? readFileSync(new URL(path,root))
  : execFileSync('git',['show','HEAD:'+path],{cwd:root,maxBuffer:4*1024*1024});
export const pack = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
export function contactPatch(scene, slot) {
  const effects = [];
  const {default: Component} = patchComponent({
    react: {...React,useMemo: create=>create(),useLayoutEffect: effect=>effects.push(effect)},
    '@react-three/fiber': {useThree: select=>select({scene})},
    './camp-suitcase-contact': contact,
  });
  return {mesh:Component({slot}).props.object,effects};
}
export function streamedFamily(family, slot) {
  const effects = [], cleanups = [];
  const {default: Component} = familyComponent({
    react: {...React,useMemo:create=>create(),useLayoutEffect:effect=>effects.push(effect),useEffect:effect=>cleanups.push(effect),useContext:()=>slot.register},
    '@react-three/fiber': {useLoader:()=>pack,useFrame:()=>{}},
    './WorldDjcFurnitureEnvironment': {useDjcFurnitureEnvironment:()=>null},
    './WorldNight': {night:{value:0}}, './camp-surface-balance':balance, './WorldCampSuitcaseContact':{CampSuitcaseContactContext:React.createContext(null)},
  });
  // Resolve the successful Suspense branch through the actual public component.
  let element = Component({family,fallback:null});
  while (element && typeof element.type !== 'string') {
    element = typeof element.type === 'function' && !element.type.prototype?.isReactComponent
      ? element.type(element.props) : element.props.children;
  }
  if (!element?.props.object) throw new Error('Facility export did not produce a mounted visual');
  function mountMaterials() {
    const releases = cleanups.map(effect => effect());
    return () => releases.forEach(release => release?.());
  }
  return {root:element.props.object,effects,mountMaterials,dispose:mountMaterials()};
}

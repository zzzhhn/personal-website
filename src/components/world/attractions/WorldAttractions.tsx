import { lazy, Suspense } from 'react';
import { useWorldStore } from '../store';
import { IBD_YARD, INTENT_COASTER } from './attraction-layout';
import WorldAttractionApproach from './WorldAttractionApproach';

const Ibd=lazy(()=>import('./WorldIbdYard'));
const Coaster=lazy(()=>import('./WorldIntentCoaster'));
/** Select booleans, not the 10 Hz position tuple: proximity changes alone rerender this gate. */
export default function WorldAttractions(){
  const ibdActive=useWorldStore(s=>Math.hypot(s.position[0]-IBD_YARD.center[0],s.position[2]-IBD_YARD.center[2])<Math.hypot(...IBD_YARD.size)/2+24);
  const coasterActive=useWorldStore(s=>{
    const [x,,z]=s.position,b=INTENT_COASTER.bounds;
    return Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ))<24;
  });
  return <group name="northern-attractions">
    <WorldAttractionApproach/>
    <Suspense fallback={null}><Ibd active={ibdActive}/></Suspense>
    <Suspense fallback={null}><Coaster active={coasterActive}/></Suspense>
  </group>;
}

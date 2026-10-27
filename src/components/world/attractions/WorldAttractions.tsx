import { lazy, Suspense } from 'react';
import { useWorldStore } from '../store';
import { IBD_YARD, INTENT_COASTER } from './attraction-layout';
import WorldAttractionApproach from './WorldAttractionApproach';

const Ibd=lazy(()=>import('./WorldIbdYard'));
const Coaster=lazy(()=>import('./WorldIntentCoaster'));
/** Select booleans, not the 10 Hz position tuple: proximity changes alone rerender this gate. */
export default function WorldAttractions(){
  const ibdActive=useWorldStore(s=>Math.hypot(s.position[0]-IBD_YARD.center[0],s.position[2]-IBD_YARD.center[2])<76);
  const coasterActive=useWorldStore(s=>Math.hypot(s.position[0]-INTENT_COASTER.center[0],s.position[2]-INTENT_COASTER.center[2])<88);
  return <group name="northern-attractions">
    <WorldAttractionApproach/>
    <Suspense fallback={null}><Ibd active={ibdActive}/></Suspense>
    <Suspense fallback={null}><Coaster active={coasterActive}/></Suspense>
  </group>;
}

import WorldSurfaceColliders from './WorldSurfaceColliders';
import type {Vec3} from './types';

/** Explicit QA fixtures, outside the island. Match the current pad/road slab
 * heights; include a coplanar bridge seam and two 15 cm test stair risers.
 * These are profile isolation evidence, never actual map traversal evidence. */
export const VEHICLE_TEST_PROFILES:{id:string;position:Vec3;size:Vec3}[]=[
  {id:'curb-18cm',position:[108,5.09,120],size:[.5,.18,8]},
  {id:'pad-10cm',position:[119,5.05,120],size:[3.1,.1,8]},
  {id:'bridge-seam-a',position:[129,4.91,120],size:[4,.18,8]},
  {id:'bridge-seam-b',position:[133,4.91,120],size:[4,.18,8]},
  {id:'step-15cm',position:[143,5.075,120],size:[2,.15,8]},
  {id:'step-30cm',position:[146,5.15,120],size:[4,.3,8]},
];
export default function WorldVehicleTestProfiles(){return <>
  <WorldSurfaceColliders items={VEHICLE_TEST_PROFILES} name="QA-transition"/>
  {VEHICLE_TEST_PROFILES.map(p=><mesh key={p.id} position={p.position} receiveShadow castShadow>
    <boxGeometry args={p.size}/><meshStandardMaterial color="#bd9b6f" roughness={1}/>
  </mesh>)}
</>;}

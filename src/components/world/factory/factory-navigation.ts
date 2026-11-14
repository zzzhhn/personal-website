import { factoryStation, type FactoryStationId, type FactoryPoint } from './factory-layout.ts';

/** Surveyed pedestrian graph. Materials cross on conveyors; visitors use the
 * west service aisle, east ends and the clear side of the raised dispatch dock. */
export const FACTORY_WALK_NODES: Record<string, FactoryPoint> = {
  entrance:[48.5,.12,-29.5], frontEast:[32,.12,-29.5], frontWest:[-32,.12,-29.5],
  frontBatch:[-23,.12,-29.5], frontRouting:[-8,.12,-29.5], frontOuter:[-45.3,.12,-29.5],
  westTop:[-45.3,.12,-25], westPress:[-45.3,.12,-11],
  westBottom:[-32,.12,19], eastTop:[32,.12,-8], eastMiddle:[32,.12,0],
  eastBottom:[32,.12,12], bypass:[30.5,.12,19], dispatchWest:[30.5,.12,27.8],
  dispatchEast:[43,.12,27.8], reworkEntry:[38,.12,9], underRamp:[36,.12,-5],
  courtyard:[50,.12,-5], courseEntry:[51,.12,-9],
  ...Object.fromEntries((['raw','batch','routing','frame','wheels','shell','assembly','test','compare','rework','finish','release'] as const)
    .map(id=>[id,[...factoryStation(id).at]])),
};
export const FACTORY_WALK_EDGES: readonly (readonly [string,string])[] = [
  ['entrance','frontEast'],['frontEast','frontRouting'],['frontRouting','frontBatch'],['frontBatch','frontWest'],
  ['frontWest','raw'],['frontBatch','batch'],['frontRouting','routing'],['frontWest','frontOuter'],['frontOuter','westTop'],
  ['westTop','westPress'],['westPress','frame'],['frame','wheels'],['wheels','shell'],['shell','westBottom'],
  ['westBottom','bypass'],['frontEast','eastTop'],['eastTop','assembly'],['eastTop','eastMiddle'],
  ['eastMiddle','finish'],['eastMiddle','eastBottom'],['eastBottom','reworkEntry'],['reworkEntry','rework'],
  ['eastBottom','bypass'],['bypass','dispatchWest'],['dispatchWest','dispatchEast'],['dispatchEast','release'],
  ['eastTop','underRamp'],['underRamp','courtyard'],['courtyard','courseEntry'],['courseEntry','test'],['test','compare'],
];

/** Dijkstra runs only when the visitor asks for the next station, never per frame. */
export function factoryWalkingRoute(from: FactoryStationId|'entrance', to: FactoryStationId): FactoryPoint[] {
  if(from===to)return [];
  const pending=new Set(Object.keys(FACTORY_WALK_NODES)),cost=new Map<string,number>([[from,0]]),parent=new Map<string,string>();
  while(pending.size){
    let next:string|null=null,best=Infinity;
    for(const key of pending){const c=cost.get(key)??Infinity;if(c<best){next=key;best=c;}}
    if(next===null)break;
    pending.delete(next);if(next===to)break;
    for(const [a,b] of FACTORY_WALK_EDGES){
      const neighbor=a===next?b:b===next?a:null;if(!neighbor||!pending.has(neighbor))continue;
      const p=FACTORY_WALK_NODES[next],q=FACTORY_WALK_NODES[neighbor],candidate=best+Math.hypot(p[0]-q[0],p[2]-q[2]);
      if(candidate<(cost.get(neighbor)??Infinity)){cost.set(neighbor,candidate);parent.set(neighbor,next);}
    }
  }
  if(!parent.has(to))return [];
  const route:FactoryPoint[]=[];let key:string=to;
  while(key!==from){route.push([...FACTORY_WALK_NODES[key]]);key=parent.get(key)!;}
  route.push([...FACTORY_WALK_NODES[from]]);return route.reverse();
}

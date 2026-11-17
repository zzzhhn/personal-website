import { PLAYER_CENTER_HEIGHT, CAMERA_DEFAULT_YAW, CAMERA_DEFAULT_PITCH } from './actor-physics';
import type { ActorArrival, ActorSites, ActorZone } from './actor-sites';
import { CAMP_SPAWN, ROAD_POINTS, VEHICLES } from './layout';
import { ALPHA_SAFE_GROUND, alphaContainsWorld, alphaWorld } from './alpha-island/alpha-layout';
import { ALPHA_MINE_ORIGIN, ALPHA_MINE_FOOTPRINT_POINTS } from './alpha-mine-layout';
import { ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_FOOTPRINT } from './alpha-exchange-layout';
import { FACTORY, FACTORY_STATIONS, factoryWorld, inFactory, FACTORY_FOOTPRINT } from './factory/factory-layout';
import { CLUB, CLUB_POOL, CLUB_CAPE } from './djc-club-layout';
import { IBD_YARD, INTENT_COASTER, ATTRACTION_ROAD_SAMPLES, IBD_FOOTPRINT } from './attractions/attraction-layout';
import { namedAlphaArrival, alphaTerrainColliderMounted } from './world-arrival-readiness';
import { LAYOUT_V4, zoneAtV4 } from './layout-v4-flag';
import { nearestDryPoint, terrainHeight } from './WorldLandform';
import { roadLandingCandidates } from './world-travel';
import { WORLD_PORTALS } from './world-portals';
import type { Vec3 } from './types';
import { mountedCollidersReady, createColliderReadinessProbe, FIXED_TRIMESH, type ColliderRequirement } from './collider-readiness';
import { createRegionPassage, polygonPassageFootprint, type PassageRegion } from './region-passage';

/** Named collider groups belong to the independently mounted district, not its visual asset load. */
export function arrivalColliderRequirements(start: string | null, layoutV4=LAYOUT_V4): ColliderRequirement[] {
  const mesh=(name:string):ColliderRequirement=>({name,shape:FIXED_TRIMESH});
  const requirements=[mesh('island-terrain-surface-top'),mesh('island-terrain-solid-faces')];
  if(layoutV4 && (start==='factory'||start?.startsWith('factory-')))requirements.push(mesh('factory-collision'));
  if(layoutV4 && start==='ibd')requirements.push(mesh('ibd-yard-architecture'));
  if(layoutV4 && start==='coaster')requirements.push({name:'coaster-station-surfaces'},mesh('coaster-relief-surface'));
  if(start==='alpha'||start==='brain')requirements.push(mesh('alpha-mine-surface'),mesh('alpha-mine-solid'));
  if(start==='exchange')requirements.push(mesh('alpha-exchange-surface'),mesh('alpha-exchange-solid'));
  if(start?.startsWith('club'))requirements.push(mesh('djc-surface-same-mesh'),mesh('djc-solid-same-mesh'));
  return requirements;
}

export function worldPassageRegions(layoutV4=LAYOUT_V4):PassageRegion[] {
  const box=(b:{minX:number;maxX:number;minZ:number;maxZ:number})=>(p:Vec3,r:number)=>
    p[0]>=b.minX-r&&p[0]<=b.maxX+r&&p[2]>=b.minZ-r&&p[2]<=b.maxZ+r;
  const district=(id:string,contains:PassageRegion['contains']):PassageRegion=>
    ({id,contains,requirements:arrivalColliderRequirements(id,layoutV4).slice(2)});
  return [
    {id:'alpha-island',contains:alphaContainsWorld,requirements:[{name:'alpha-terrain-patch',shape:FIXED_TRIMESH,count:2}]},
    district('brain',polygonPassageFootprint(ALPHA_MINE_FOOTPRINT_POINTS)),
    district('exchange',box(ALPHA_EXCHANGE_FOOTPRINT)),
    district('club',(p,r)=>(Math.hypot((p[0]-CLUB_CAPE.center[0])/CLUB_CAPE.radii[0],(p[2]-CLUB_CAPE.center[1])/CLUB_CAPE.radii[1])-1)*Math.min(...CLUB_CAPE.radii)<=r),
    ...(layoutV4?[
      district('factory',polygonPassageFootprint(FACTORY_FOOTPRINT)),
      district('ibd',polygonPassageFootprint(IBD_FOOTPRINT)),
      district('coaster',box(INTENT_COASTER.bounds)),
    ]:[]),
  ];
}
const passageRegions=worldPassageRegions(),mainlandRequirements=arrivalColliderRequirements(null);

const bodyPoint = (ground: Vec3): Vec3 => [ground[0],ground[1]+PLAYER_CENTER_HEIGHT,ground[2]];
const attractionRoads=ATTRACTION_ROAD_SAMPLES.map(path=>path.map(([x,z])=>[x,1.045,z] as Vec3));
export function worldRoadLandingCandidates(p:Vec3) {
  return [roadLandingCandidates(p,ROAD_POINTS),...attractionRoads.map(path=>roadLandingCandidates(p,path))].flat()
    .sort((a,b)=>Math.hypot(a.position[0]-p[0],a.position[2]-p[2])-Math.hypot(b.position[0]-p[0],b.position[2]-p[2]));
}

export function worldActorArrival(search: string, development: boolean, layoutV4=LAYOUT_V4): ActorArrival {
  const params=new URLSearchParams(search),start=params.get('start');
  const qaStart=development&&params.get('qa')==='1'?start:null;
  const portal=WORLD_PORTALS.find(p=>qaStart===`portal-${p.id}`);
  const ground=namedAlphaArrival(start);
  let resolvedStart=start;
  const yaw=portal?Math.PI/2+portal.yaw:qaStart==='brain-rail'||start==='ibd'||start==='coaster'?Math.PI/2:start?.startsWith('club')?-Math.PI/2:0;
  const position=():Vec3=>{
    if(ground)return bodyPoint(ground);
    if(layoutV4&&start==='factory')return bodyPoint(FACTORY.entrance);
    if(layoutV4&&development&&start?.startsWith('factory-')) {
      const station=FACTORY_STATIONS.find(s=>s.id===start.slice(8));
      if(station)return bodyPoint(factoryWorld(station.at));
    }
    if(start==='town')return bodyPoint([14,1.2,-2.5]);
    if(start==='tent')return bodyPoint([-42,4.8,20]);
    if(start==='ibd'||start==='coaster')return bodyPoint((start==='ibd'?IBD_YARD:INTENT_COASTER).entrance);
    if(start==='club')return bodyPoint([CLUB.spawn[0],1,CLUB.spawn[2]]);
    if(start==='exchange')return bodyPoint([ALPHA_EXCHANGE_ORIGIN[0],ALPHA_EXCHANGE_ORIGIN[1],ALPHA_EXCHANGE_ORIGIN[2]+2.4]);
    if(development&&start==='club-dance')return bodyPoint(CLUB.dance);
    if(development&&start==='club-decks')return bodyPoint([31,2,55]);
    if(development&&start==='club-view')return bodyPoint([CLUB.terrace[0],terrainHeight(CLUB.terrace[0],55),55]);
    if(development&&start==='club-water')return bodyPoint([CLUB.pool[0],CLUB_POOL.floorHeight(CLUB.pool[0],55),55]);
    if(portal)return bodyPoint(portal.entryApproachCandidates[0]);
    if(qaStart==='wade')return [-26,-.3,106];
    if(qaStart==='exchange-gallery')return bodyPoint([48.3,1.14+5.2,-92.6]);
    if(qaStart==='brain-exit')return [-81.23,1.82,-90.28];
    if(qaStart==='brain-rail')return bodyPoint([ALPHA_MINE_ORIGIN[0]+8,ALPHA_MINE_ORIGIN[1],ALPHA_MINE_ORIGIN[2]+.16]);
    if(qaStart==='camp-bench')return [-37.05,6.5,33.535];
    if(start==='alpha'||start==='brain')return bodyPoint([ALPHA_MINE_ORIGIN[0],ALPHA_MINE_ORIGIN[1],ALPHA_MINE_ORIGIN[2]+.5]);
    if(development) {
      const vehicle=VEHICLES.find(v=>v.id===start);
      if(vehicle)return bodyPoint([vehicle.position[0],vehicle.position[1],vehicle.position[2]+2]);
    }
    resolvedStart=null;
    return [...CAMP_SPAWN];
  };
  const club=start?.startsWith('club'),attraction=start==='ibd'||start==='coaster';
  const cameraYaw=portal?Math.PI/2-portal.yaw:qaStart==='exchange-gallery'?4.7113:qaStart==='brain-rail'||attraction?Math.PI/2:qaStart==='club-view'?0:club?-Math.PI/2:CAMERA_DEFAULT_YAW;
  const cameraPitch=qaStart==='exchange-gallery'?.4554:club?.4:CAMERA_DEFAULT_PITCH;
  const initialPosition=position(),requirements=arrivalColliderRequirements(resolvedStart,layoutV4);
  return {position:initialPosition,yaw,cameraYaw,cameraPitch,ground,
    waitForColliders:!!ground||!qaStart,
    collidersReady:ground?alphaTerrainColliderMounted:(world,states)=>mountedCollidersReady(world,states,requirements)};
}

export function worldActorZone(position:Vec3,fallback?:ActorZone,layoutV4=LAYOUT_V4):ActorZone {
  const [x,,z]=position;
  return alphaContainsWorld(position)?'alpha':inFactory(x,z)?'factory':layoutV4?zoneAtV4(x,z):fallback??(x>35?'park':x< -15?'camp':'town');
}

export const worldActorSites: ActorSites = {
  passage:(world,states)=>createRegionPassage(passageRegions,createColliderReadinessProbe(world,states),mainlandRequirements),
  arrival:worldActorArrival,
  zone:worldActorZone,
  roadCandidates:worldRoadLandingCandidates,
  rideZone:(p,hasDriver)=>alphaContainsWorld(p)?'alpha':hasDriver?'shore':'coaster',
  recoveryCandidates(p) {
    const dry=nearestDryPoint(p[0],p[2]);
    return [...(alphaContainsWorld(p,25)?ALPHA_SAFE_GROUND.map(alphaWorld)
      .sort((a,b)=>Math.hypot(a[0]-p[0],a[2]-p[2])-Math.hypot(b[0]-p[0],b[2]-p[2])):[]),
      ...(dry?[dry]:[]),...worldRoadLandingCandidates(p).map(c=>c.position),[CAMP_SPAWN[0],4.8,CAMP_SPAWN[2]]];
  },
};

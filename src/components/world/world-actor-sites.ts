import { ShapeType } from '@dimforge/rapier3d-compat';
import { PLAYER_CENTER_HEIGHT, CAMERA_DEFAULT_YAW, CAMERA_DEFAULT_PITCH } from './actor-physics';
import type { ActorArrival, ActorSites, ActorZone, ActorHome } from './actor-sites';
import { CAMP_SPAWN, ROAD_POINTS, VEHICLES, WATER_Y } from './layout';
import { ALPHA_MAINLAND_PIER_POLYGON, ALPHA_ORIGIN, ALPHA_SAFE_GROUND, alphaContainsWorld, alphaWorld } from './alpha-island/alpha-layout';
import { ALPHA_MINE_ORIGIN, ALPHA_MINE_FOOTPRINT_POINTS } from './alpha-mine-layout';
import { ALPHA_EXCHANGE_ORIGIN, ALPHA_EXCHANGE_FOOTPRINT } from './alpha-exchange-layout';
import { FACTORY, FACTORY_STATIONS, factoryWorld, inFactory, FACTORY_FOOTPRINT } from './factory/factory-layout';
import { CLUB, CLUB_POOL, CLUB_CAPE } from './djc-club-layout';
import { IBD_YARD, INTENT_COASTER, ATTRACTION_ROAD_SAMPLES, IBD_FOOTPRINT } from './attractions/attraction-layout';
import { namedAlphaArrival } from './alpha-island/alpha-arrival';
import { ALPHA_CAVE_PATH, ALPHA_CAVE_DEAD_END, ALPHA_WATERWHEEL, ALPHA_WATER_PASSAGE, batch2Segment } from './alpha-island/alpha-batch2-layout';
import { WATERWHEEL_FRAME_BODY, WATERWHEEL_FLOOR_BODY } from './alpha-island/batch2/waterwheel-layout';
import { LAYOUT_V4, zoneAtV4 } from './layout-v4-flag';
import { nearestDryPoint, requireMeshHeight } from './WorldLandform';
import { roadLandingCandidates } from './world-travel';
import { PORTAL_THRESHOLD, WORLD_PORTALS, portalLocalPoint } from './world-portals';
import type { Vec3 } from './types';
import { mountedCollidersReady, createColliderReadinessProbe, FIXED_TRIMESH, type ColliderRequirement } from './collider-readiness';
import { createRegionPassage, polygonPassageFootprint, type PassageRegion } from './region-passage';
import { regionLoadFailed } from './region-load-failure';

const mesh = (name: string): ColliderRequirement => ({ name, shape: FIXED_TRIMESH });
const mainlandRequirements = [mesh('island-terrain-surface-top'), mesh('island-terrain-solid-faces')];
const alphaTerrainRequirements = [{ ...mesh('alpha-terrain-patch'), count: 2 }];
const quarryRequirements = [mesh('alpha-mine-surface'), mesh('alpha-mine-solid')];
const exchangeRequirements = [mesh('alpha-exchange-surface'), mesh('alpha-exchange-solid')];
const clubRequirements = [mesh('djc-surface-same-mesh'), mesh('djc-solid-same-mesh')];
const factoryRequirements = [mesh('factory-collision')];
const yardRequirements = [mesh('ibd-yard-architecture')];
const coasterRequirements = [{ name: 'coaster-station-surfaces' }, mesh('coaster-relief-surface')];
const waterwheelRequirements = [{ ...mesh(WATERWHEEL_FRAME_BODY), count: 4 }, mesh(WATERWHEEL_FLOOR_BODY)];
const caveRequirements = [mesh('alpha-cave-floor-support'), mesh('alpha-cave-solid-rock')];
// The pier is mounted as one structure. The contact regression ties this count
// to all of its production pieces, including the approach and the ferry platform.
const pierRequirements = [{ name: 'alpha-mainland-pier-r4-candidate', shape: ShapeType.RoundCuboid, count: 184 }];

export function worldPassageRegions(layoutV4=LAYOUT_V4): PassageRegion[] {
  const box = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => (p: Vec3, r: number) =>
    p[0] >= b.minX - r && p[0] <= b.maxX + r && p[2] >= b.minZ - r && p[2] <= b.maxZ + r;
  const pier = polygonPassageFootprint(ALPHA_MAINLAND_PIER_POLYGON.map(([x,,z]) => [x,z]));
  return [
    { id: 'alpha-island', contains: alphaContainsWorld, requirements: alphaTerrainRequirements },
    { id: 'alpha-waterwheel', requirements: waterwheelRequirements, contains: (p,r) => {
      const { center, size } = ALPHA_WATERWHEEL;
      const x = p[0] - ALPHA_ORIGIN[0], z = p[2] - ALPHA_ORIGIN[2];
      return (Math.abs(x - center[0]) <= size[0]/2 + r && Math.abs(z - center[2]) <= size[1]/2 + r)
        || batch2Segment(x,z,ALPHA_WATER_PASSAGE).distance <= 2.5 + r;
    } },
    { id: 'alpha-cave', requirements: caveRequirements, contains: (p,r) => {
      // The mountain trail and transit lines may pass above the cave footprint.
      if (p[1] < 20 || p[1] > 36) return false;
      const x = p[0] - ALPHA_ORIGIN[0], z = p[2] - ALPHA_ORIGIN[2];
      return Math.min(batch2Segment(x,z,ALPHA_CAVE_PATH).distance,batch2Segment(x,z,ALPHA_CAVE_DEAD_END).distance) <= 4.5 + r;
    } },
    ...WORLD_PORTALS.map(site => ({
      id: 'walking-portal-' + site.id, loadSource: 'walking-portals',
      requirements: [mesh('G28-' + site.id + '-threshold'), { ...mesh('G28-' + site.id + '-stone-frame'), count: 3 }],
      contains: (position: Vec3, radius: number) => {
        if (Math.abs(position[0]-site.position[0]) > 3+radius || Math.abs(position[2]-site.position[2]) > 3+radius) return false;
        const [x,y,z] = portalLocalPoint(site,position);
        return y >= -1-radius && y <= 3.5+radius && Math.abs(x)<=1.65+radius && Math.abs(z)<=PORTAL_THRESHOLD.halfLength+radius;
      },
    })),
    { id: 'mainland-pier', loadSource: 'alpha-island', contains: pier, requirements: pierRequirements },
    { id: 'brain', contains: polygonPassageFootprint(ALPHA_MINE_FOOTPRINT_POINTS), requirements: quarryRequirements },
    { id: 'exchange', contains: box(ALPHA_EXCHANGE_FOOTPRINT), requirements: exchangeRequirements },
    { id: 'club', requirements: clubRequirements,
      contains: (p,r) => (Math.hypot((p[0]-CLUB_CAPE.center[0])/CLUB_CAPE.radii[0],(p[2]-CLUB_CAPE.center[1])/CLUB_CAPE.radii[1])-1)*Math.min(...CLUB_CAPE.radii)<=r },
    ...(layoutV4 ? [
      { id: 'factory', contains: polygonPassageFootprint(FACTORY_FOOTPRINT), requirements: factoryRequirements },
      { id: 'ibd', contains: polygonPassageFootprint(IBD_FOOTPRINT), requirements: yardRequirements },
      { id: 'coaster', contains: box(INTENT_COASTER.bounds), requirements: coasterRequirements },
    ] : []),
  ];
}
const v3PassageRegions = worldPassageRegions(false);
const v4PassageRegions = worldPassageRegions(true);
const passageRegions = LAYOUT_V4 ? v4PassageRegions : v3PassageRegions;
const installedPassages = new Map<string,PassageRegion>();
let activePassageRegions = passageRegions;

/** A district can publish a precise footprint once its survey has loaded.
 * Its lease can outlive an independently loading contact surface. */
export function registerWorldActorPassage(region:PassageRegion) {
  installedPassages.set(region.id,region);
  activePassageRegions=[...passageRegions,...installedPassages.values()];
  return ()=>{
    if(installedPassages.get(region.id)!==region)return;
    installedPassages.delete(region.id);
    activePassageRegions=[...passageRegions,...installedPassages.values()];
  };
}

function arrivalRegions(start: string | null, layoutV4: boolean) {
  const regions = layoutV4 ? v4PassageRegions : v3PassageRegions;
  if (namedAlphaArrival(start)) return regions.filter(region => region.id === 'alpha-island' || region.id === start);
  const id = start === 'alpha' ? 'brain' : start?.startsWith('club-') ? 'club' : start?.startsWith('factory-') ? 'factory' : start;
  return regions.filter(region => region.id === id);
}

export function arrivalColliderRequirements(start: string | null, layoutV4=LAYOUT_V4): ColliderRequirement[] {
  return [...mainlandRequirements, ...arrivalRegions(start,layoutV4).flatMap(region => region.requirements)];
}

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
    if(layoutV4&&(start==='ibd'||start==='coaster'))return bodyPoint((start==='ibd'?IBD_YARD:INTENT_COASTER).entrance);
    if(start==='club')return bodyPoint([CLUB.spawn[0],1,CLUB.spawn[2]]);
    if(start==='exchange')return bodyPoint([ALPHA_EXCHANGE_ORIGIN[0],ALPHA_EXCHANGE_ORIGIN[1],ALPHA_EXCHANGE_ORIGIN[2]+2.4]);
    if(development&&start==='club-dance')return bodyPoint(CLUB.dance);
    if(development&&start==='club-decks')return bodyPoint([31,2,55]);
    if(development&&start==='club-view')return bodyPoint([CLUB.terrace[0],requireMeshHeight(CLUB.terrace[0],55),55]);
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
  const initialPosition = position();
  const requirements = arrivalColliderRequirements(resolvedStart,layoutV4);
  const regions = arrivalRegions(resolvedStart,layoutV4);
  return { position: initialPosition, yaw, cameraYaw, cameraPitch, ground,
    waitForColliders: !!ground || !qaStart,
    loadFailed: () => regions.some(region => regionLoadFailed(region.loadSource ?? region.id)),
    collidersReady: (world,states) => mountedCollidersReady(world,states,requirements) };
}

export function worldActorZone(position:Vec3,fallback?:ActorZone,layoutV4=LAYOUT_V4):ActorZone {
  const [x,,z]=position;
  return alphaContainsWorld(position)?'alpha':inFactory(x,z)?'factory':layoutV4?zoneAtV4(x,z):fallback??(x>35?'park':x< -15?'camp':'town');
}

export const worldActorHome: ActorHome = {position:CAMP_SPAWN,zone:'camp',
  notice:{en:'Back at camp. Your ore and research are kept.',zh:'已回到营地，矿石与研究进度已保留。'}};
const portalNames = {
  camp:{zh:'营地',en:'camp'},mine:{zh:'WorldQuant 矿场',en:'WorldQuant quarry'},
  park:{zh:'项目广场',en:'project plaza'},yard:{zh:'物资清点场',en:'Inventory yard'},
  coaster:{zh:'意图过山车',en:'Intent coaster'},
};
export const worldActorSites: ActorSites = {
  home:worldActorHome,waterY:WATER_Y,vehicles:VEHICLES,
  portals:WORLD_PORTALS.map(portal=>({...portal,fallbackZone:portal.id==='camp'?'camp':'park',
    notice:{zh:`已抵达${portalNames[portal.id].zh}。离开门口后可再次穿行。`,
      en:`Arrived at ${portalNames[portal.id].en}. Walk away to rearm the gate.`}})),
  passage:(world,states)=>createRegionPassage(()=>activePassageRegions,createColliderReadinessProbe(world,states),mainlandRequirements,regionLoadFailed),
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

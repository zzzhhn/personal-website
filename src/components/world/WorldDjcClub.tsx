import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import type { World, RigidBody } from '@dimforge/rapier3d-compat';
import { CLUB } from './djc-club-layout';
import { useInteractable, type Interactable } from './WorldInteract';
import { useWorldStore } from './store';
import { clubAudio } from './WorldClubAudio';
import WorldDjcClubVisual from './WorldDjcClubVisual';
import WorldClubDancer from './WorldClubDancer';
import { useAlphaMineStore } from './alpha-mine-state';
import { isWorldRunning } from './WorldWind';
import { DJC_CLUB_SEATS, DJC_DAYBED_TOP,DJC_DAYBED_ACCESS, type DjcClubSeat } from './WorldDjcClubGeometry';
import { PLAYER_CENTER_HEIGHT } from './actor-physics';
import { playerRouteClear } from './player-motion';
import { playerSupport } from './player-ground';
import type { Vec3 } from './types';

const available = () => { const s = useWorldStore.getState(); return !s.activeVehicle && !s.seat && !s.card && !s.clubMode && !useAlphaMineStore.getState().carried; };
/** A daybed is approached on its front ramp, already near cushion height, never from the pool below. */
export function djcSeatApproach(position:Vec3,seat:DjcClubSeat) {
  const foot=position[1]-PLAYER_CENTER_HEIGHT,dz=position[2]-seat.position[2];
  return dz>=-1.65&&dz<=-.2&&Math.abs(position[0]-seat.center[0])<=DJC_DAYBED_ACCESS.width/2-.05&&foot>=DJC_DAYBED_TOP-.28&&foot<=DJC_DAYBED_TOP+.2;
}
/** Recheck the full standing-body route at activation, so a newly blocked approach cannot teleport. */
export function djcSeatReachable(world:World,rapier:Pick<typeof import('@dimforge/rapier3d-compat'),'Ball'|'Capsule'|'ShapeType'>,position:Vec3,seat:DjcClubSeat) {
  if(!djcSeatApproach(position,seat))return false;
  let player:RigidBody|undefined;
  world.intersectionsWithPoint({x:position[0],y:position[1],z:position[2]},c=>{
    const body=c.parent();if(body?.isDynamic()&&c.shapeType()===rapier.ShapeType.Capsule){player=body;return false;}return true;
  });
  if(!player)return false;
  if(!playerSupport(world,rapier,player)?.grounded)return false;
  // A settled dynamic capsule rests 1–2 mm inside contact skin. Use the production
  // lifted route query, which separates from that floor while preserving wall/head checks.
  return playerRouteClear(world,rapier,player,player.translation(),{x:seat.position[0],y:seat.position[1]+PLAYER_CENTER_HEIGHT,z:seat.position[2]});
}
export function djcSeatInteraction(seat:DjcClubSeat,reachable:()=>boolean):Interactable {
  const enabled=()=>available()&&djcSeatApproach(useWorldStore.getState().position,seat)&&reachable();
  return {id:seat.id,kind:'seat',position:seat.anchor,radius:1.2,label:{zh:'坐下听音乐',en:'Sit and listen'},enabled,
    onInteract:()=>{if(enabled())useWorldStore.setState({seat:{id:seat.id,position:seat.position,yaw:seat.yaw},nearbyInteract:null});}};
}
function DaybedSeat({seat}:{seat:DjcClubSeat}) {
  const {world,rapier}=useRapier();
  useInteractable(djcSeatInteraction(seat,()=>djcSeatReachable(world,rapier,useWorldStore.getState().position,seat)));
  return null;
}
export default function WorldDjcClub() {
  useFrame(() => { if (isWorldRunning()) clubAudio.tick(); });
  useEffect(() => {
    const release = clubAudio.retain();
    const update = () => {
      const s = useWorldStore.getState(), d = Math.hypot(s.position[0] - CLUB.center[0], s.position[2] - CLUB.center[2]);
      clubAudio.proximity(d);
      if (s.clubMode && (d > 34 || s.activeVehicle || s.seat || s.card)) useWorldStore.setState({ clubMode: null });
    };
    update(); const stop = useWorldStore.subscribe((s, p) => { if (s.position !== p.position || s.activeVehicle !== p.activeVehicle || s.card !== p.card || s.seat !== p.seat) update(); });
    return () => { stop(); release(); const seat=useWorldStore.getState().seat;useWorldStore.setState({clubMode:null,...(seat?.id.startsWith('djc-daybed-')?{seat:null}:{})}); };
  }, []);
  useInteractable({ id: 'djc-club-dance', kind: 'exhibit', position: CLUB.dance, radius: 7.5,
    label: { zh: '加入舞池', en: 'Join the dance floor' }, enabled: available,
    onInteract: () => { useWorldStore.setState({ clubMode: 'dance', nearbyInteract: null }); void clubAudio.enable(); } });
  useInteractable({ id: 'djc-club-decks', kind: 'exhibit', position: [31.1, 2.0, 55], radius: 2.2,
    label: { zh: '接管 DJ 台', en: 'Take the decks' }, enabled: available,
    onInteract: () => { useWorldStore.setState({ clubMode: 'dj', nearbyInteract: null }); void clubAudio.enable(); } });
  useInteractable({ id: 'djc-club-project', kind: 'sign', position: [25, 1.4, 40], radius: 2.3,
    label: { zh: '关于 DJC', en: 'About DJC' }, enabled: available,
    onInteract: () => useWorldStore.setState({ card: { kind: 'project', id: 'djc' } }) });
  return <group name="djc-beach-club" userData={{noOcclusionFade:true,assetId:'djc-club'}}>
    <WorldDjcClubVisual beat={clubAudio.beat} energy={clubAudio.energy} />
    {DJC_CLUB_SEATS.map(seat=><DaybedSeat key={seat.id} seat={seat}/>)}
    {[[40, 1.6, 51.5], [43, 1.6, 59]].map((p, i) => <WorldClubDancer key={i} position={p as [number,number,number]}
      facing={Math.PI+i*.3} step={i as 0|1} beat={clubAudio.beat} playing={()=>clubAudio.energy()>0} />)}
  </group>;
}

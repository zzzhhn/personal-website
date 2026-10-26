import { useEffect } from 'react';
import { CLUB } from './djc-club-layout';
import { useInteractable } from './WorldInteract';
import { useWorldStore } from './store';
import { clubAudio } from './WorldClubAudio';
import WorldDjcClubVisual from './WorldDjcClubVisual';
import WorldClubDancer from './WorldClubDancer';
import { useAlphaMineStore } from './alpha-mine-state';

const available = () => { const s = useWorldStore.getState(); return !s.activeVehicle && !s.seat && !s.card && !s.clubMode && !useAlphaMineStore.getState().carried; };
export default function WorldDjcClub() {
  useEffect(() => {
    const release = clubAudio.retain();
    const update = () => {
      const s = useWorldStore.getState(), d = Math.hypot(s.position[0] - CLUB.center[0], s.position[2] - CLUB.center[2]);
      clubAudio.proximity(d);
      if (s.clubMode && (d > 34 || s.activeVehicle || s.seat || s.card)) useWorldStore.setState({ clubMode: null });
    };
    update(); const stop = useWorldStore.subscribe((s, p) => { if (s.position !== p.position || s.activeVehicle !== p.activeVehicle || s.card !== p.card || s.seat !== p.seat) update(); });
    return () => { stop(); release(); useWorldStore.setState({ clubMode: null }); };
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
    {[[40, 1.6, 51.5], [43, 1.6, 59]].map((p, i) => <WorldClubDancer key={i} position={p as [number,number,number]}
      facing={Math.PI+i*.3} step={i as 0|1} beat={clubAudio.beat} playing={()=>clubAudio.energy()>0} />)}
  </group>;
}

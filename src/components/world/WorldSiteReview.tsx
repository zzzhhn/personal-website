/** Explicit local review controls. Reuse one scene instead of reloading the world for every witness. */
import { useEffect, useState } from 'react';
import { WORLD_SHOTS } from './layout';
import { selectWorldTime, useWorldStore } from './store';

export default function WorldSiteReview() {
  const [enabled, setEnabled] = useState(false);
  const shot = useWorldStore(s => s.shot);
  const ready = useWorldStore(s => s.ready);
  useEffect(() => { setEnabled(new URLSearchParams(location.search).get('siteReview') === '1'); }, []);
  if (!enabled) return null;
  return <aside style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 9999, padding: 8, background: '#10252aee', color: '#fff' }}>
    <label>现场接缝复核 <select aria-label="现场接缝复核机位" value={shot ?? ''} disabled={!ready} onChange={e => {
      const id = e.target.value;
      if (!WORLD_SHOTS.some(v => v.id === id && v.id.startsWith('site-'))) return;
      useWorldStore.setState({ shot: id, paused: false, timeRunning: false });
      selectWorldTime(id.endsWith('-night') ? 'night' : 'noon');
    }}>
      <option value="" disabled>选择机位</option>
      {WORLD_SHOTS.filter(v => v.id.startsWith('site-')).map(v => <option key={v.id} value={v.id}>{v.id}</option>)}
    </select></label>
  </aside>;
}

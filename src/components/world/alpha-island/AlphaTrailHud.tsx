import { useState } from 'react';
import { useWorldStore } from '../store';
import { useAlphaStore } from './alpha-state';
import { alphaContainsWorld } from './alpha-layout';
import { ALPHA_TRAIL_STOPS, nearestAlphaTrailStop } from './alpha-trail';

export default function AlphaTrailHud() {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(1);
  const card = useAlphaStore(s => s.card), visits = useAlphaStore(s => s.visits), carried = useAlphaStore(s => s.carried);
  // Subscribe to a visibility boolean, not every published player position.
  const hidden = useWorldStore(s => s.paused || !!s.shot || !!s.card || !alphaContainsWorld(s.position, 25));
  const lang = useWorldStore(s => s.lang), zh = lang === 'zh';
  if (!card || hidden) return null;
  const chosen = ALPHA_TRAIL_STOPS.find(s => s.n === selected) ?? ALPHA_TRAIL_STOPS[0];
  const toggle = () => {
    if (!open) setSelected(nearestAlphaTrailStop(useWorldStore.getState().position));
    setOpen(v => !v);
  };
  return <aside aria-label={zh ? '登山卡' : 'Trail card'} style={{ position: 'absolute', right: 22, bottom: 174,
    width: 230, maxWidth: 'calc(100vw - 44px)', maxHeight: 'calc(100dvh - 260px)', overflowY: 'auto',
    padding: '12px 15px', border: '1px solid #cdb58b55', borderRadius: 12,
    background: '#2c3932e8', color: '#f2e5c8', pointerEvents: 'auto', fontSize: 12, zIndex: 8 }}>
    <button onClick={toggle} aria-expanded={open} aria-controls="alpha-trail-details" style={{ background: 'none', border: 0,
      color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
      {zh ? '山岛登山卡' : 'Mountain trail card'} <span style={{ float: 'right' }}>{open ? '−' : '+'}</span>
    </button>
    {open && <div id="alpha-trail-details">
      <ul style={{ listStyle: 'none', margin: '10px 0', padding: 0 }}>{ALPHA_TRAIL_STOPS.map(stop => <li key={stop.n}>
        <button onClick={() => setSelected(stop.n)} aria-pressed={selected === stop.n} style={{ width: '100%',
          textAlign: 'left', padding: '5px 3px', border: 0, borderRadius: 4, font: 'inherit', cursor: 'pointer',
          color: 'inherit', background: selected === stop.n ? '#cdb58b24' : 'transparent' }}>
          <span aria-label={visits.includes(stop.n) ? (zh ? '到访' : 'Visited') : (zh ? '未到访' : 'Unvisited')}
            style={{ marginRight: 10, color: visits.includes(stop.n) ? '#e2bd78' : '#afbaad' }}>{visits.includes(stop.n) ? '●' : '○'}</span>
          {stop.name[lang]}
        </button>
      </li>)}</ul>
      <p aria-live="polite" style={{ borderTop: '1px solid #cdb58b33', paddingTop: 10, margin: 0, lineHeight: 1.65 }}>{chosen.hint[lang]}</p>
    </div>}
    {carried && <p style={{ margin: '10px 0 0', color: '#ffcf82' }}>{zh ? 'E 放飞纸灯 · Esc 放回灯架' : 'E release · Esc return to rack'}</p>}
  </aside>;
}

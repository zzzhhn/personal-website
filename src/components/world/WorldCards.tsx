import { useEffect, useRef, useState } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import { cycleInteractPick, reachableInteractables, type Interactable } from './WorldInteract';
import { resolveCard } from './WorldCardContent';
import { trackPortfolioEvent } from '../../lib/analytics';
import type { WorldContent } from './types';
import { watchUiGamepads } from './WorldUiGamepad';

type Device = 'kb' | 'pad';
/** Last input device, so the key cap reads E on keyboard and Y on a gamepad (Bruno's setKeyIcon idea). */
function useDevice(showPrompt: boolean) {
  const [device, setDevice] = useState<Device>('kb');
  useEffect(() => {
    const kb = () => setDevice('kb');
    window.addEventListener('keydown', kb); window.addEventListener('pointerdown', kb);
    return () => { window.removeEventListener('keydown', kb); window.removeEventListener('pointerdown', kb); };
  }, []);
  useEffect(() => {
    if (!showPrompt) return;
    return watchUiGamepads(pads => { if (pads.some(g => g && (g.buttons.some(b => b.pressed) || g.axes.some(a => Math.abs(a) > .4)))) setDevice('pad'); });
  }, [showPrompt]);
  return device;
}

/** Other interactables in reach besides the one WorldActors selected (same radius / 2.5 m height gate). Only
 * offered while WorldActors reports a reachable target, so the list never appears beside a wall on its own. */
function nearbyCandidates(position: [number, number, number], primary: string | undefined): Interactable[] {
  if (!primary) return [];
  const out: { item: Interactable; d: number }[] = [];
  for (const item of reachableInteractables()) {
    if (item.enabled && !item.enabled()) continue;
    const [x, y, z] = item.position;
    if (Math.abs(y - position[1]) > 2.5) continue;
    const d = Math.hypot(x - position[0], z - position[2]);
    if (d <= (item.radius ?? 2.2)) out.push({ item, d });
  }
  return out.sort((a, b) => a.d - b.d).map(c => c.item).slice(0, 4);
}

function KeyCap({ device, k }: { device: Device; k: 'E' | 'Q' }) {
  return device === 'pad' ? <kbd className={`world-key world-key-pad${k === 'E' ? ' is-y' : ''}`}>{k === 'E' ? 'Y' : '↕'}</kbd> : <kbd className='world-key'>{k}</kbd>;
}

/** Interaction prompt (nearby object or vehicle) and the content card. Districts register interactables and set
 * store.card; this layer only displays. E closes via WorldActors (spec 15.3); Esc, a click outside or the close
 * button close it here. */
export default function WorldCards({ content }: { content: WorldContent }) {
  const nearby = useWorldStore(s => s.nearbyInteract);
  const nearbyVehicle = useWorldStore(s => s.nearbyVehicle);
  const lang = useWorldStore(s => s.lang);
  const driving = useWorldStore(s => s.activeVehicle);
  const card = useWorldStore(s => s.card);
  const seat = useWorldStore(s => s.seat);
  const paused = useWorldStore(s => s.paused);
  const shot = useWorldStore(s => s.shot);
  const pick = useWorldStore(s => s.interactPick);
  const position = useWorldStore(s => s.position);
  const device = useDevice(!paused && !shot && !card && !driving && !seat && !!(nearby || nearbyVehicle));
  const t = worldText[lang];
  const candidates = card || driving || seat ? [] : nearbyCandidates(position, nearby?.id);
  const ids = candidates.map(c => c.id).join('|');
  const chosen = candidates.find(c => c.id === pick) ?? null;
  // A pick only lives while its object stays in the list.
  useEffect(() => { if (pick && !ids.split('|').includes(pick)) useWorldStore.setState({ interactPick: null }); }, [ids, pick]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = useWorldStore.getState();
      if (e.code !== 'KeyQ' || s.paused || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      e.preventDefault(); cycleInteractPick(1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  if (paused) return null;
  if (card) return <WorldCardPanel content={content} />;
  if (driving || seat) return null;
  if (nearby) {
    const active = chosen?.id ?? nearby.id;
    const rows = candidates.length > 1 ? candidates.map(c => ({ id: c.id, label: c.label[lang] })) : [{ id: nearby.id, label: nearby.label[lang] }];
    return <div className='world-prompt' aria-live='polite'>
      <ul>{rows.map(r => <li key={r.id} className={r.id === active ? 'is-active' : ''}>{r.id === active ? <KeyCap device={device} k='E' /> : <span className='world-key-gap' />}<span className='world-prompt-label'>{r.id === 'G28-menu' && <small>{t.entryLandmark}</small>}<span>{r.label}</span></span></li>)}</ul>
      {rows.length > 1 && <p><KeyCap device={device} k='Q' />{t.switchTarget}</p>}
    </div>;
  }
  if (nearbyVehicle) return <div className='world-prompt' aria-live='polite'><ul><li className='is-active'><KeyCap device={device} k='E' /><span>{t.enter.replace(/^E · /, '')} · {t[nearbyVehicle]}</span></li></ul></div>;
  return null;
}

function WorldCardPanel({ content }: { content: WorldContent }) {
  const card = useWorldStore(s => s.card)!;
  const lang = useWorldStore(s => s.lang);
  const t = worldText[lang];
  const view = resolveCard(card, content, lang);
  const openedAt = useRef(useWorldStore.getState().position);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => useWorldStore.setState({ card: null });
  const turn = (step: number) => { const c = useWorldStore.getState().card; if (c) useWorldStore.setState({ card: { ...c, page: (c.page ?? 0) + step } }); };
  const hasPager = !!view?.pager;
  useEffect(() => {
    openedAt.current = useWorldStore.getState().position;
    panel.current?.focus({ preventScroll: true });
    if (card.kind === 'project' && !new URLSearchParams(location.search).has('qa')) trackPortfolioEvent('world_booth_open', card.id);
  }, [card.kind, card.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (hasPager && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) { e.preventDefault(); turn(e.code === 'ArrowRight' ? 1 : -1); } };
    // Walking away closes the card (store contract); a little slack covers idle drift.
    const unsub = useWorldStore.subscribe(s => { const p = s.position, o = openedAt.current; if (s.card && Math.hypot(p[0] - o[0], p[2] - o[2]) > 3.2) useWorldStore.setState({ card: null }); });
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); unsub(); };
  }, [hasPager]);
  // Unknown ids never leave an empty modal on screen.
  useEffect(() => { if (!view) close(); }, [view]);
  if (!view) return null;
  const count = view.pager?.count ?? 0;
  return <div className='world-card-layer' onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div ref={panel} className={`world-card world-card-${card.kind}`} role='dialog' aria-modal='false' aria-labelledby='world-card-title' tabIndex={-1} style={{ ['--card-accent' as string]: view.accent }}>
      <header>
        <span className='world-card-eyebrow'>{view.eyebrow}</span>
        <button className='world-card-close' onClick={close} aria-label={t.close}><kbd>E</kbd><kbd>Esc</kbd><span aria-hidden='true'>×</span></button>
        <h3 id='world-card-title'>{view.title}</h3>
        {view.subtitle && <p className='world-card-subtitle'>{view.subtitle}</p>}
        {view.meta && <dl className='world-card-meta'>{view.meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      </header>
      <div className='world-card-body'>{view.body}</div>
      <footer>
        {view.pager && count > 1 && <div className='world-card-pager'>
          <button onClick={() => turn(-1)} aria-label={t.prev}>←</button>
          <span>{Array.from({ length: count }, (_, i) => <i key={i} className={i === view.pager!.page ? 'is-on' : ''} />)}<em>{t.page} {view.pager.page + 1} / {count}</em></span>
          <button onClick={() => turn(1)} aria-label={t.next}>→</button>
        </div>}
        {view.links && <nav>{view.links.map(l => <a key={l.href} href={l.href} target={l.external ? '_blank' : undefined} rel={l.external ? 'noreferrer' : undefined}>{l.label}{l.external ? ' ↗' : ' →'}</a>)}</nav>}
      </footer>
    </div>
  </div>;
}

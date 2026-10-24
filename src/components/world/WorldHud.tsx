import { useEffect, useRef, useState } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import type { WorldContent } from './types';

type Zone = ReturnType<typeof useWorldStore.getState>['zone'];
const ZONE_HOLD_MS = 3400, ZONE_REPEAT_MS = 20000;

/** Place name on entering a zone (GTA: area + street, Genshin: top-centre banner). The subtitle is the
 * portfolio section that zone stands for, read from the same UI.sections labels as the homepage. */
export function WorldZoneTitle({ about }: { about?: WorldContent['about'] }) {
  const zone = useWorldStore(s => s.zone), ready = useWorldStore(s => s.ready), lang = useWorldStore(s => s.lang);
  const card = useWorldStore(s => s.card), paused = useWorldStore(s => s.paused);
  const [shown, setShown] = useState<{ zone: Zone; key: number } | null>(null);
  const seen = useRef(new Map<Zone, number>());
  useEffect(() => {
    if (!ready) return;
    const now = performance.now(), last = seen.current.get(zone);
    if (last !== undefined && now - last < ZONE_REPEAT_MS) return;
    seen.current.set(zone, now);
    // A short settle avoids flashing a name while the player is skimming along a zone border.
    const enter = setTimeout(() => { if (useWorldStore.getState().zone === zone) setShown({ zone, key: now }); }, 450);
    return () => clearTimeout(enter);
  }, [zone, ready]);
  useEffect(() => { if (!shown) return; const out = setTimeout(() => setShown(null), ZONE_HOLD_MS); return () => clearTimeout(out); }, [shown]);
  if (!shown || card || paused) return null;
  const t = worldText[lang];
  const section = about?.sections;
  const sub = shown.zone === 'camp' ? section?.about[lang] : shown.zone === 'town' ? section?.experience[lang] : shown.zone === 'park' ? section?.projects[lang] : t.zoneSub[shown.zone];
  return <div className='world-zone' role='status' aria-live='polite' key={shown.key}>
    <span className='world-zone-rule' aria-hidden='true' /><div><h2>{t[shown.zone]}</h2>{sub && <p>{sub}</p>}</div><span className='world-zone-rule' aria-hidden='true' />
  </div>;
}

type Hint = 'move' | 'look' | 'interact' | 'drive';
const HINT_KEY = 'world-hints-v1';
const readDone = (): Set<Hint> => { try { return new Set(JSON.parse(localStorage.getItem(HINT_KEY) || '[]')); } catch { return new Set(); } };

/** First-visit key hints: each chip ticks and fades once that control has actually been used; the whole row
 * leaves when all are done (remembered in localStorage). No reward, nothing is blocked; Esc shows all keys. */
export function WorldFirstHints() {
  const lang = useWorldStore(s => s.lang), ready = useWorldStore(s => s.ready), driving = useWorldStore(s => s.activeVehicle);
  const card = useWorldStore(s => s.card), paused = useWorldStore(s => s.paused);
  const [done, setDone] = useState<Set<Hint>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setDone(readDone()); setLoaded(true); }, []);
  useEffect(() => {
    if (!ready) return;
    const mark = (h: Hint) => setDone(prev => { if (prev.has(h)) return prev; const next = new Set(prev).add(h); try { localStorage.setItem(HINT_KEY, JSON.stringify([...next])); } catch { /* optional */ } return next; });
    const key = (e: KeyboardEvent) => {
      if (/^Key[WASD]$/.test(e.code)) mark(useWorldStore.getState().activeVehicle ? 'drive' : 'move');
      if (e.code === 'KeyE' && (useWorldStore.getState().nearbyInteract || useWorldStore.getState().nearbyVehicle)) mark('interact');
    };
    const canvas = document.querySelector('.world-app canvas');
    let downAt: [number, number] | null = null;
    const down = (e: Event) => { const p = e as PointerEvent; downAt = [p.clientX, p.clientY]; };
    const move = (e: Event) => { const p = e as PointerEvent; if (downAt && Math.hypot(p.clientX - downAt[0], p.clientY - downAt[1]) > 24) mark('look'); };
    const up = () => { downAt = null; };
    const wheel = () => mark('look');
    // Gamepad: a deliberate right-stick look or left-stick move counts like the mouse / keys.
    let raf = 0;
    const pad = () => { const g = navigator.getGamepads?.().find(Boolean); if (g) { if (Math.hypot(g.axes[2] ?? 0, g.axes[3] ?? 0) > .5) mark('look'); if (Math.hypot(g.axes[0] ?? 0, g.axes[1] ?? 0) > .5) mark(useWorldStore.getState().activeVehicle ? 'drive' : 'move'); if (g.buttons[3]?.pressed && useWorldStore.getState().nearbyInteract) mark('interact'); } raf = requestAnimationFrame(pad); };
    raf = requestAnimationFrame(pad);
    window.addEventListener('keydown', key);
    canvas?.addEventListener('pointerdown', down); canvas?.addEventListener('pointermove', move); window.addEventListener('pointerup', up); canvas?.addEventListener('wheel', wheel, { passive: true });
    const unsub = useWorldStore.subscribe((s, p) => { if (s.card && !p.card) mark('interact'); if (s.activeVehicle && !p.activeVehicle) mark('interact'); });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); canvas?.removeEventListener('pointerdown', down); canvas?.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); canvas?.removeEventListener('wheel', wheel); unsub(); };
  }, [ready]);
  if (!loaded || !ready || card || paused) return null;
  const t = worldText[lang];
  const chips: { id: Hint; keys: string; label: string }[] = driving
    ? [{ id: 'drive', keys: t.hintKeysDrive, label: t.hintDrive }]
    : [{ id: 'move', keys: t.hintKeysMove, label: t.hintMove }, { id: 'look', keys: t.hintKeysLook, label: t.hintLook }, { id: 'interact', keys: 'E', label: t.hintInteract }];
  if (chips.every(c => done.has(c.id))) return null;
  return <div className='world-hints' aria-label={t.keysTitle}>
    {chips.map((c, i) => <div key={c.id} className={`world-hint${done.has(c.id) ? ' is-done' : ''}`} style={{ animationDelay: `${.25 + i * .12}s` }}>
      <kbd>{c.keys}</kbd><span>{c.label}</span>{done.has(c.id) && <i aria-hidden='true'>✓</i>}
    </div>)}
  </div>;
}

/** Waypoint readout under the minimap; the waypoint clears on arrival (6 m). */
export function WorldWaypointReadout() {
  const waypoint = useWorldStore(s => s.waypoint), position = useWorldStore(s => s.position), lang = useWorldStore(s => s.lang);
  const d = waypoint ? Math.hypot(waypoint[0] - position[0], waypoint[1] - position[2]) : 0;
  useEffect(() => { if (waypoint && d < 6) useWorldStore.setState({ waypoint: null }); }, [waypoint, d]);
  if (!waypoint) return null;
  const t = worldText[lang];
  return <span className='world-waypoint-readout'><i aria-hidden='true' />{t.waypoint} · {Math.round(d)} {t.metres}</span>;
}

import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import { ISLAND_OUTLINE, ROAD_POINTS, BOARDWALK_POINTS, BUILDINGS, BOOTHS, WORLD_SHOTS } from './layout';
import type { WorldContent } from './types';
import './world.css';

const Runtime = lazy(() => import('./WorldRuntime'));

class WorldErrorBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="world-cover" role="alert"><p>{this.props.message}</p><button onClick={() => window.location.reload()}>{this.props.retry}</button><a href="/">← Portfolio</a></div>;
    return this.props.children;
  }
}

function IslandMap({ large = false }: { large?: boolean }) {
  const position = useWorldStore(s => s.position);
  const lang = useWorldStore(s => s.lang);
  const t = worldText[lang];
  const path = (points: number[][]) => points.map(p => `${p[0]},${p.length === 3 ? p[2] : p[1]}`).join(' ');
  return <svg className={large ? 'world-map world-map-large' : 'world-map'} viewBox="-85 -70 180 145" role="img" aria-label={t.map}>
    <polygon points={path(ISLAND_OUTLINE)} fill="#7E8C3E" stroke="#C9A978" strokeWidth="4" />
    <polyline points={path(ROAD_POINTS)} fill="none" stroke="#D9D2C2" strokeWidth="4" strokeLinejoin="round" />
    <polyline points={path(BOARDWALK_POINTS)} fill="none" stroke="#C9A978" strokeWidth="3" />
    <circle cx="-42" cy="30" r="15" fill="#C9A978" stroke="#E8803A" strokeWidth="2" />
    {BUILDINGS.map(b => <rect key={b.id} x={b.position[0] - 4} y={b.position[2] - 4} width="8" height="8" fill="#E6DCCB" />)}
    {BOOTHS.map(b => <rect key={b.id} x={b.position[0] - 3} y={b.position[2] - 3} width="6" height="6" fill="#4E647D" stroke="#4FD1C5" strokeWidth=".5" />)}
    <circle cx={position[0]} cy={position[2]} r="2.6" fill="#fff" stroke="#23343d" strokeWidth="1" />
    {large && <g fill="#fff" fontSize="5" fontFamily="system-ui"><text x="-58" y="55">{t.camp}</text><text x="24" y="20">{t.town}</text><text x="48" y="-58">{t.park}</text><text x="-77" y="-56">N ↑</text></g>}
  </svg>;
}

function Loading() {
  const t = worldText[useWorldStore(s => s.lang)];
  return <div className="world-cover world-loading" role="status"><IslandMap large /><h1>{t.loading}</h1><p>{t.loadingHint}</p><span className="world-progress" /></div>;
}

export default function WorldApp({ content }: { content: WorldContent }) {
  const s = useWorldStore();
  const t = worldText[s.lang];
  const [supported, setSupported] = useState<boolean | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let lang = document.documentElement.dataset.siteLang === 'zh' ? 'zh' : 'en';
    try { if (localStorage.getItem('lang') === 'zh') lang = 'zh'; } catch { /* Storage is optional. */ }
    const shot = new URLSearchParams(window.location.search).get('shot');
    const validShot = WORLD_SHOTS.some(v => v.id === shot) ? shot : null;
    useWorldStore.setState({ lang: lang as 'en' | 'zh', shot: validShot, light: validShot?.endsWith('-night') ? 'night' : 'dusk' });
    setSupported(!window.matchMedia('(pointer: coarse), (max-width: 767px)').matches);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      useWorldStore.setState(state => ({ paused: !state.paused }));
    };
    const onVisibility = () => { if (document.hidden) useWorldStore.setState({ paused: true }); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.siteLang = s.lang;
    document.documentElement.lang = s.lang === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem('lang', s.lang); } catch { /* Privacy mode. */ }
  }, [s.lang]);
  useEffect(() => {
    if (s.paused && !dialog.current?.open) dialog.current?.showModal();
    else if (!s.paused && dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [s.paused]);
  if (supported === null) return <Loading />;
  if (!supported) return <main className="world-cover world-mobile"><IslandMap large /><span className="world-eyebrow">{t.title}</span><h1>{t.mobile}</h1><p>{t.mobileDetail}</p><a href="/">← {t.back}</a></main>;
  return <main className={`world-app ${s.shot ? 'world-shot' : ''}`} aria-label={t.title}>
    <WorldErrorBoundary message={t.error} retry={t.retry}>
      <Suspense fallback={null}><Runtime content={content} /></Suspense>
      {!s.ready && <Loading />}
    </WorldErrorBoundary>
    <header className="world-top"><div><span className="world-eyebrow">{t.stage}</span><h1>{t.title}</h1></div><button ref={trigger} onClick={() => useWorldStore.setState({ paused: true })} aria-haspopup="dialog">{t.menu}<kbd>Esc</kbd></button></header>
    <aside className="world-location"><IslandMap /><span>{t[s.zone]}</span></aside>
    <div className="world-bottom"><div><p>{s.activeVehicle ? t.driving : t.controls}</p><span>{t.zoom}</span></div>{s.activeVehicle && <div className="world-speed"><strong>{Math.round(s.speed)}</strong><span>km/h · {t[s.activeVehicle]}</span></div>}</div>
    <div className="world-interaction" aria-live="polite">{s.canRecover ? <button className="world-recover" onClick={() => useWorldStore.setState(v => ({ recoverRequest: v.recoverRequest + 1 }))}>{t.recover}</button> : s.activeVehicle ? <span>{t.leave}</span> : s.nearbyVehicle ? <span>{t.enter} · {t[s.nearbyVehicle]}</span> : null}</div>
    <dialog className="world-dialog" ref={dialog} aria-label={t.menu} onCancel={e => { e.preventDefault(); useWorldStore.setState({ paused: false }); }}>
      <span className="world-eyebrow">{t.title}</span><h2>{t.menu}</h2><IslandMap large />
      <fieldset><legend>{t.light}</legend>{(['dusk', 'night'] as const).map(light => <button key={light} aria-pressed={s.light === light} onClick={() => useWorldStore.setState({ light })}>{t[light]}</button>)}</fieldset>
      <fieldset><legend>{t.language}</legend><button aria-pressed={s.lang === 'en'} onClick={() => useWorldStore.setState({ lang: 'en' })}>English</button><button aria-pressed={s.lang === 'zh'} onClick={() => useWorldStore.setState({ lang: 'zh' })}>中文</button></fieldset>
      <button className="world-primary" onClick={() => useWorldStore.setState({ paused: false })}>{t.resume}</button><a href={`/#${s.zone === 'camp' ? 'about' : s.zone === 'town' ? 'experience' : 'projects'}`}>← {t.back}</a>
    </dialog>
  </main>;
}

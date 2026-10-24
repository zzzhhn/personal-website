import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import { CAMP_CENTER, WORLD_SHOTS } from './layout';
import type { WorldContent } from './types';
import WorldExperienceSummary from './WorldExperienceSummary';
import WorldCards from './WorldCards';
import WorldMap, { loadMapGeometry } from './WorldMap';
import { WorldFirstHints, WorldWaypointReadout, WorldZoneTitle } from './WorldHud';
import './world.css';

const Runtime = lazy(async () => {
  const { attachLoadProgress } = await import('./WorldLoadProgress');
  attachLoadProgress();
  return import('./WorldRuntime');
});
// QA-only ui fixtures (?qa=1&uitest=1); the normal entry never loads this chunk.
const uiTest = typeof window !== 'undefined' && /[?&]qa=1/.test(window.location.search) && /[?&]uitest=1/.test(window.location.search);
const UiTest = uiTest ? lazy(() => import('./WorldUiTest')) : null;

class WorldErrorBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="world-cover" role="alert"><p>{this.props.message}</p><button onClick={() => window.location.reload()}>{this.props.retry}</button><a href="/">← Portfolio</a></div>;
    return this.props.children;
  }
}

function Loading() {
  const t = worldText[useWorldStore(s => s.lang)];
  const loading = useWorldStore(s => s.loading);
  const [viewBox, setViewBox] = useState<readonly number[]>([-85, -70, 180, 145]);
  useEffect(() => { let live = true; loadMapGeometry().then(g => { if (live) setViewBox(g.viewBox); }).catch(() => {}); return () => { live = false; }; }, []);
  const observed = loading.phase === 'ready' ? 1 : loading.phase === 'scene' ? .94 : loading.total ? .08 + .8 * loading.loaded / loading.total : .04;
  // Keep earned colour when another dependency is discovered. This is a visual frontier, not a byte percentage.
  const frontier = useRef(0);
  const fraction = frontier.current = Math.max(frontier.current, observed);
  const cx = (CAMP_CENTER[0] - viewBox[0]) / viewBox[2], cy = (CAMP_CENTER[2] - viewBox[1]) / viewBox[3];
  const radius = Math.hypot(Math.max(cx, 1 - cx) * viewBox[2], Math.max(cy, 1 - cy) * viewBox[3]) / (Math.hypot(viewBox[2], viewBox[3]) / Math.SQRT2) * 100;
  const stage = loading.phase === 'runtime' ? t.loadingArrival : loading.phase === 'assets' ? t.loadingPlaces : t.loadingStart;
  return <div className="world-cover world-loading" role="status" aria-live="polite" aria-busy="true">
    <span className="world-eyebrow">{t.title}</span>
    <div className="world-loading-map" aria-hidden="true">
      <div className="world-loading-muted"><WorldMap mode="full" showPlayer={false} /></div>
      <div className="world-loading-reveal" style={{ clipPath: `circle(${radius * fraction}% at ${cx * 100}% ${cy * 100}%)` }}><WorldMap mode="full" showPlayer={false} /></div>
    </div>
    <h1>{t.loading}</h1><p className="world-loading-stage">{stage}</p>
    <span className="world-progress" aria-hidden="true"><span style={{ transform: `scaleX(${fraction})` }} /></span>
    <p className="world-loading-hint">{t.loadingHint}</p>
  </div>;
}

export default function WorldApp({ content }: { content: WorldContent }) {
  const s = useWorldStore();
  const t = worldText[s.lang];
  const [supported, setSupported] = useState<boolean | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openedByButton = useRef(false);
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
      if (useWorldStore.getState().card && !useWorldStore.getState().paused) { useWorldStore.setState({ card: null }); return; }
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
    else if (!s.paused && dialog.current?.open) { dialog.current.close(); if (openedByButton.current) trigger.current?.focus(); else (document.activeElement as HTMLElement | null)?.blur(); openedByButton.current = false; }
  }, [s.paused]);
  if (supported === null) return <Loading />;
  if (!supported) return <main className="world-cover world-mobile"><WorldMap mode='full' /><span className="world-eyebrow">{t.title}</span><h1>{t.mobile}</h1><p>{t.mobileDetail}</p><a href="/">← {t.back}</a></main>;
  return <main className={`world-app ${s.shot ? 'world-shot' : ''}`} aria-label={t.title}>
    <WorldErrorBoundary message={t.error} retry={t.retry}>
      <Suspense fallback={null}><Runtime content={content} /></Suspense>
      {!s.ready && <Loading />}
    </WorldErrorBoundary>
    <header className="world-top"><div><span className="world-eyebrow">{t.stage}</span><h1>{t.title}</h1></div><button ref={trigger} onClick={() => { openedByButton.current = true; useWorldStore.setState({ paused: true }); }} aria-haspopup="dialog"><span>{t.menu}</span><kbd>Esc</kbd></button></header>
    <aside className="world-location"><div className="world-radar"><WorldMap /><span className="world-radar-n" aria-hidden="true">N</span></div><div className="world-location-text"><span>{t[s.zone]}</span><WorldWaypointReadout /></div></aside>
    <WorldZoneTitle about={content.about} />
    <WorldExperienceSummary experiences={content.experiences} />
    <WorldCards content={content} />
    {UiTest && <Suspense fallback={null}><UiTest /></Suspense>}
    <WorldFirstHints />
    {s.activeVehicle && <div className="world-speed"><strong>{Math.round(s.speed)}</strong><span><em>km/h</em>{t[s.activeVehicle]}</span></div>}
    <div className="world-interaction" aria-live="polite">{s.canRecover ? <button className="world-recover" onClick={() => useWorldStore.setState(v => ({ recoverRequest: v.recoverRequest + 1 }))}><kbd>R</kbd>{t.recover.replace(/^R \u00b7 /, '')}</button> : s.activeVehicle && !s.card ? <span className="world-chip"><kbd>E</kbd>{t.leave.replace(/^E \u00b7 /, '')}</span> : null}</div>
    <dialog className="world-dialog" ref={dialog} aria-label={t.menu} onCancel={e => { e.preventDefault(); useWorldStore.setState({ paused: false }); }}>
      <div className="world-dialog-map">
        <div className="world-dialog-head"><span className="world-eyebrow">{t.title}</span><h2>{t.menu}</h2></div>
        <WorldMap mode="full" interactive />
        <div className="world-map-legend">
          <span><i className="lg-you" />{t.legendYou}</span><span><i className="lg-bld" />{t.legendBuildings}</span><span><i className="lg-booth" />{t.legendBooths}</span><span><i className="lg-plot" />{t.legendPlots}</span>
          {s.waypoint ? <button className="world-link-button" onClick={() => useWorldStore.setState({ waypoint: null })}><i className="lg-wp" />{t.waypointClear}</button> : <span className="world-map-tip"><i className="lg-wp" />{t.waypointSet}</span>}
        </div>
      </div>
      <div className="world-dialog-side">
        <fieldset><legend>{t.language}</legend><button aria-pressed={s.lang === 'en'} onClick={() => useWorldStore.setState({ lang: 'en' })}>English</button><button aria-pressed={s.lang === 'zh'} onClick={() => useWorldStore.setState({ lang: 'zh' })}>中文</button></fieldset>
        <fieldset><legend>{t.light}</legend>{(['dusk', 'night'] as const).map(light => <button key={light} aria-pressed={s.light === light} onClick={() => useWorldStore.setState({ light })}>{t[light]}</button>)}</fieldset>
        <fieldset aria-describedby="world-quality-hint"><legend>{t.quality}</legend>{(['balanced', 'high'] as const).map(quality => <button key={quality} aria-pressed={s.quality === quality} onClick={() => useWorldStore.setState({ quality })}>{t[quality]}</button>)}</fieldset>
        <p id="world-quality-hint" className="world-setting-hint">{t.qualityHint}</p>
        <details className="world-keys"><summary>{t.keysTitle}</summary>
          <h3>{t.keysWalk}</h3><dl>{t.keyRows.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
          <h3>{t.keysDriveTitle}</h3><dl>{t.driveRows.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
        </details>
        <details className="world-credits"><summary>{t.credits}</summary>
          {/* Credits for the motion data actually used; take hashes and edits are in docs/world/THIRD_PARTY.md. */}
          <p>{t.motionCredit}</p><p><a href="https://mocap.cs.cmu.edu/" target="_blank" rel="noreferrer">CMU Graphics Lab Motion Capture Database</a></p><p>This data was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.</p>
          <p>{t.styleCredit}</p><p><a href="https://ianxmason.github.io/100style/" target="_blank" rel="noreferrer">The 100STYLE Dataset - Ian Mason</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
          <h3>{t.thanksTitle}</h3><p>{t.groundCredit}</p><p>three.js · React Three Fiber · Rapier</p>
        </details>
        <div className="world-dialog-actions"><button className="world-primary" onClick={() => useWorldStore.setState({ paused: false })}>{t.resume}</button><a href={`/#${s.zone === 'town' ? 'experience' : s.zone === 'park' ? 'projects' : 'about'}`}>← {t.back}</a></div>
      </div>
    </dialog>
  </main>;
}

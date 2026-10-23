import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorldStore } from './store';
import { worldText } from './world-i18n';
import { ISLAND_OUTLINE, LAYOUT_V4, ROAD_POINTS, BOARDWALK_POINTS, BUILDINGS, BOOTHS, WORLD_SHOTS } from './layout';
import type { WorldContent } from './types';
import WorldExperienceSummary from './WorldExperienceSummary';
import WorldCards from './WorldCards';
import './world.css';

const Runtime = lazy(() => import('./WorldRuntime'));
type MapRoad = {pts:number[][];width:number;color:string;dash?:string};
type MapGeometry = {shore:number[][];camp:number[][];viewBox:string;roads?:MapRoad[]};
let mapGeometryPromise:Promise<MapGeometry>|null=null;
function loadMapGeometry(){
  // Share the terrain's waterline, loaded with the runtime rather than adding
  // Three/terrain generation to the initial loading UI bundle.
  // Layout v4: road hierarchy from the same layout data (lazy chunk, flag only).
  const v4Roads:Promise<MapRoad[]|undefined>=LAYOUT_V4?import('./layout-v4').then(({ROADS_V4,CONNECTORS_V4,paveHalf})=>[...ROADS_V4,...CONNECTORS_V4]
    .map(r=>({pts:r.pts,width:r.cls==='foot'?2:r.cls==='dirt'?3:paveHalf(r.cls)*.9,color:r.cls==='dirt'?'#B08A5E':r.cls==='foot'?'#C9A978':r.cls==='avenue'?'#F3EBDD':'#D9D2C2',dash:r.cls==='dirt'?'3 2':undefined}))
    .sort((a,b)=>b.width-a.width)):Promise.resolve(undefined);
  return mapGeometryPromise??=Promise.all([import('./WorldLandform'),v4Roads]).then(([{islandShoreline,campRadius},roads])=>{
    const shore=islandShoreline().filter((_,i)=>i%2===0);
    const camp=Array.from({length:72},(_,i)=>{const a=i/72*Math.PI*2,r=campRadius(a)*.7;return[-42+Math.cos(a)*r,30+Math.sin(a)*r];});
    const xs=[-77,85,...shore.map(p=>p[0])],zs=[-62,62,...shore.map(p=>p[1])];
    const x=Math.min(...xs)-7,z=Math.min(...zs)-7;
    return{shore,camp,roads,viewBox:`${x} ${z} ${Math.max(...xs)-x+7} ${Math.max(...zs)-z+7}`};
  });
}

class WorldErrorBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="world-cover" role="alert"><p>{this.props.message}</p><button onClick={() => window.location.reload()}>{this.props.retry}</button><a href="/">← Portfolio</a></div>;
    return this.props.children;
  }
}

function IslandMap({ large = false }: { large?: boolean }) {
  const [geometry,setGeometry]=useState<MapGeometry|null>(null);
  useEffect(()=>{let live=true;loadMapGeometry().then(g=>{if(live)setGeometry(g);}).catch(()=>{});return()=>{live=false;};},[]);
  const position = useWorldStore(s => s.position);
  const lang = useWorldStore(s => s.lang);
  const t = worldText[lang];
  const path = (points: number[][]) => points.map(p => `${p[0]},${p.length === 3 ? p[2] : p[1]}`).join(' ');
  return <svg className={large ? 'world-map world-map-large' : 'world-map'} viewBox={geometry?.viewBox??'-85 -70 180 145'} role="img" aria-label={t.map}>
    <polygon points={path(geometry?.shore??ISLAND_OUTLINE)} fill="#7E8C3E" stroke="#C9A978" strokeWidth="4" />
    {geometry?.roads ? geometry.roads.map((r,i)=><polyline key={i} points={path(r.pts)} fill="none" stroke={r.color} strokeWidth={r.width} strokeDasharray={r.dash} strokeLinejoin="round" strokeLinecap="round" />)
      : !LAYOUT_V4 && <polyline points={path(ROAD_POINTS)} fill="none" stroke="#D9D2C2" strokeWidth="4" strokeLinejoin="round" />}
    <polyline points={path(BOARDWALK_POINTS)} fill="none" stroke="#C9A978" strokeWidth="3" />
    {geometry?<polygon points={path(geometry.camp)} fill="#C9A978" stroke="#E8803A" strokeWidth="2"/>:<circle cx="-42" cy="30" r="15" fill="#C9A978" stroke="#E8803A" strokeWidth="2" />}
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
    <WorldExperienceSummary experiences={content.experiences} />
    <WorldCards content={content} />
    <div className="world-bottom"><div><p>{s.activeVehicle ? t.driving : t.controls}</p><span>{t.zoom}</span></div>{s.activeVehicle && <div className="world-speed"><strong>{Math.round(s.speed)}</strong><span>km/h · {t[s.activeVehicle]}</span></div>}</div>
    <div className="world-interaction" aria-live="polite">{s.canRecover ? <button className="world-recover" onClick={() => useWorldStore.setState(v => ({ recoverRequest: v.recoverRequest + 1 }))}>{t.recover}</button> : s.activeVehicle ? <span>{t.leave}</span> : s.nearbyInteract ? null : s.nearbyVehicle ? <span>{t.enter} · {t[s.nearbyVehicle]}</span> : null}</div>
    <dialog className="world-dialog" ref={dialog} aria-label={t.menu} onCancel={e => { e.preventDefault(); useWorldStore.setState({ paused: false }); }}>
      <span className="world-eyebrow">{t.title}</span><h2>{t.menu}</h2><IslandMap large />
      <fieldset><legend>{t.light}</legend>{(['dusk', 'night'] as const).map(light => <button key={light} aria-pressed={s.light === light} onClick={() => useWorldStore.setState({ light })}>{t[light]}</button>)}</fieldset>
      <fieldset aria-describedby="world-quality-hint"><legend>{t.quality}</legend>{(['balanced', 'high'] as const).map(quality => <button key={quality} aria-pressed={s.quality === quality} onClick={() => useWorldStore.setState({ quality })}>{t[quality]}</button>)}</fieldset>
      <p id="world-quality-hint" className="world-setting-hint">{t.qualityHint}</p>
      <fieldset><legend>{t.language}</legend><button aria-pressed={s.lang === 'en'} onClick={() => useWorldStore.setState({ lang: 'en' })}>English</button><button aria-pressed={s.lang === 'zh'} onClick={() => useWorldStore.setState({ lang: 'zh' })}>中文</button></fieldset>
      <details className="world-credits"><summary>{t.credits}</summary><p>{t.motionCredit}</p><p><a href="https://mocap.cs.cmu.edu/" target="_blank" rel="noreferrer">CMU Graphics Lab Motion Capture Database</a></p><p>This data was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.</p></details>
      <button className="world-primary" onClick={() => useWorldStore.setState({ paused: false })}>{t.resume}</button><a href={`/#${s.zone === 'camp' ? 'about' : s.zone === 'town' ? 'experience' : s.zone === 'park' ? 'projects' : 'about'}`}>← {t.back}</a>
    </dialog>
  </main>;
}

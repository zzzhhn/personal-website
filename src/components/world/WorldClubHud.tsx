import { clubAudio, CLUB_TRACKS, useClubAudio } from './WorldClubAudio';
import { useWorldStore } from './store';
import { CLUB } from './djc-club-layout';
import './world-club.css';

export default function WorldClubHud() {
  const mode = useWorldStore(s => s.clubMode), step = useWorldStore(s => s.danceStep), lang = useWorldStore(s => s.lang);
  const hidden = useWorldStore(s => s.paused || s.poolInspect || !!s.card || !!s.activeVehicle || !!s.shot);
  const nearby = useWorldStore(s => Math.hypot(s.position[0] - CLUB.center[0], s.position[2] - CLUB.center[2]) < 35);
  const a = useClubAudio(), zh = lang === 'zh';
  if (!nearby || hidden) return null;
  return <section className={`world-club-controls${mode === 'dj' ? ' is-mixing' : ''}`} aria-label="DJC beach club">
    <header><span>DJC <small>BEACH CLUB</small></span><button onClick={() => clubAudio.mute()} aria-pressed={a.muted}>{a.muted ? (zh ? '取消静音' : 'Unmute') : (zh ? '静音' : 'Mute')}</button></header>
    {a.phase !== 'ready' ? <button className="club-main" disabled={a.phase === 'loading'} onClick={() => void clubAudio.enable()}>
      {a.phase === 'loading' ? (zh ? '正在准备两张唱片…' : 'Loading the records…') : a.phase === 'error' ? (zh ? '音乐未连接，点此重试' : 'Music unavailable · retry') : (zh ? '打开音乐' : 'Start the music')}</button>
      : !mode && <p className="club-now">{CLUB_TRACKS[a.crossfade > .5 ? 1 : 0].title}<small>{zh ? '舞池 / DJ 台附近按 E' : 'E near the floor / DJ booth'}</small></p>}
    {mode === 'dance' && <><div className="club-dance-steps">{(['Groove', 'Twist'] as const).map((name, i) => <button key={name} aria-pressed={step === i} onClick={() => useWorldStore.setState({ danceStep: i as 0 | 1 })}><kbd>{i + 1}</kbd>{name}</button>)}</div><p>{zh ? 'WASD 走开 · E / Esc 停下' : 'WASD to walk · E / Esc to stop'}</p></>}
    {mode === 'dj' && <>
      <div className="club-decks">{CLUB_TRACKS.map((track, i) => <div key={track.title}><small>DECK {i ? 'B' : 'A'} · {track.bpm} BPM</small><strong>{track.title}</strong>
        <div><button disabled={a.phase !== 'ready'} aria-pressed={a.playing[i]} onClick={() => clubAudio.toggle(i)}>{a.playing[i] ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play')}</button><button disabled={a.phase !== 'ready'} onClick={() => clubAudio.cue(i)}>Cue</button></div></div>)}</div>
      <label>{zh ? '混音' : 'Mix'} <span>A ↔ B</span><input aria-label={zh ? '双 Deck 混音推子' : 'Deck crossfader'} type="range" min="0" max="1" step=".01" value={a.crossfade} onChange={e => clubAudio.crossfade(+e.target.value)} /></label>
      <div className="club-knobs"><label>{zh ? '滤波' : 'Filter'}<input aria-label={zh ? '滤波' : 'Filter'} type="range" min="0" max="1" step=".01" value={a.filter} onChange={e => clubAudio.filter(+e.target.value)} /></label><label>{zh ? '音量' : 'Volume'}<input aria-label={zh ? '音量' : 'Volume'} type="range" min="0" max="1" step=".01" value={a.volume} onChange={e => clubAudio.volume(+e.target.value)} /></label></div>
      <button className="club-leave" onClick={() => useWorldStore.setState({ clubMode: null })}>{zh ? '离开 DJ 台' : 'Leave the decks'} <kbd>Esc</kbd></button>
      <a href="https://djc.bobbyzhong.com" target="_blank" rel="noreferrer">{zh ? '打开完整 DJC' : 'Open full DJC'} ↗</a>
    </>}
  </section>;
}

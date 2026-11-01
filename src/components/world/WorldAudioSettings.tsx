import { useId } from 'react';
import { setWorldAudioMuted, setWorldAudioVolume, useWorldAudioSettings } from './world-audio-settings';

/** Place inside the existing pause menu; inherits its fieldset/button theme. */
export default function WorldAudioSettings({ lang }: { lang: 'zh' | 'en' }) {
  const s = useWorldAudioSettings(), id = useId(), zh = lang === 'zh';
  return <fieldset className="world-audio-settings" aria-describedby={`${id}-status`}>
    <legend>{zh ? '声音' : 'Audio'}</legend>
    <button type="button" aria-pressed={s.muted} onClick={() => setWorldAudioMuted(!s.muted)}>
      {zh ? '主静音' : 'Mute all'}
    </button>
    <span id={`${id}-status`} className="world-setting-hint">
      {s.muted ? (zh ? '已静音，音量调整在取消静音后生效' : 'Muted; volume changes apply when unmuted') : (zh ? '声音已开启' : 'Sound on')}
    </span>
    {(['music', 'sfx'] as const).map(channel => {
      const value = channel === 'music' ? s.musicVolume : s.sfxVolume;
      const label = channel === 'music' ? (zh ? '音乐' : 'Music') : (zh ? '音效' : 'Sound effects');
      const percent = `${Math.round(value * 100)}%`;
      return <label key={channel} htmlFor={`${id}-${channel}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', marginTop: '10px' }}>
        <span>{label}</span><span aria-hidden="true">{percent}</span>
        <input id={`${id}-${channel}`} aria-label={label} aria-valuetext={percent} type="range" min="0" max="1" step="0.01"
          value={value} onChange={e => setWorldAudioVolume(channel, e.currentTarget.valueAsNumber)}
          style={{ gridColumn: '1 / -1', width: '100%', minWidth: 0, margin: 0 }} />
      </label>;
    })}
  </fieldset>;
}

import { create } from 'zustand';

export type WorldAudioChannel = 'music' | 'sfx';
/** Session preferences only. Reading or changing settings never creates audio. */
export const useWorldAudioSettings = create(() => ({ muted: false, musicVolume: 1, sfxVolume: 1 }));
export function setWorldAudioMuted(muted: boolean) { useWorldAudioSettings.setState({ muted }); }
export function setWorldAudioVolume(channel: WorldAudioChannel, volume: number) {
  if (!Number.isFinite(volume)) return;
  const value = Math.max(0, Math.min(1, volume));
  useWorldAudioSettings.setState(channel === 'music' ? { musicVolume: value } : { sfxVolume: value });
}
export function worldAudioLevel(channel: WorldAudioChannel) {
  const s = useWorldAudioSettings.getState();
  return s.muted ? 0 : channel === 'music' ? s.musicVolume : s.sfxVolume;
}

import { useEffect } from 'react';
import { IbdActionAudio } from './ibd-action-audio';

/** The scene owns the audio service; its active store gate also covers a retained inactive yard. */
export default function WorldIbdAudio() {
  useEffect(() => new IbdActionAudio().mount(), []);
  return null;
}

import { ParkAudio } from '../../../src/components/world/WorldParkAudio';
import { useWorldStore } from '../../../src/components/world/store';
import { setClubAudible } from '../../../src/components/world/world-music-focus';

// Audio-only acceptance surface: the production service, no world or renderer.
useWorldStore.setState({ paused: true, poolInspect: false, shot: null });
const audio = new ParkAudio();
const release = audio.retain();
const club = {};
const output = document.querySelector('pre')!;
const history: unknown[] = [];
function record(label: string) {
  history.push({ label, at: new Date().toISOString(), ...audio.snapshot() });
  output.textContent = JSON.stringify(history.slice(-10), null, 2);
}
const actions: Record<string, () => void> = {
  play: () => { useWorldStore.setState({ paused: false }); audio.start(); },
  pause: () => useWorldStore.setState({ paused: true }),
  club: () => setClubAudible(club, true),
  roaming: () => setClubAudible(club, false),
  inspect: () => {},
  release: () => { setClubAudible(club, false); release(); },
};
let receipt: ReturnType<typeof setTimeout> | undefined;
document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action!;
    actions[action]();
    clearTimeout(receipt);
    receipt = setTimeout(() => record(action), 1200);
  });
});
window.addEventListener('pagehide', () => { clearTimeout(receipt); release(); }, { once: true });
record('mount');

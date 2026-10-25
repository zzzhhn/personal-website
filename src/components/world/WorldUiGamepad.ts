/** UI-only sampling. Character/vehicle input keeps its existing physics-owned path. */
type Consumer = (pads: readonly (Gamepad | null)[]) => void;
const consumers = new Map<symbol, Consumer>();
let frame: number | null = null, listening = false, connected = false, pageActive = true, samples = 0;

function readPads(): readonly (Gamepad | null)[] {
  try { return navigator.getGamepads?.() ?? []; } catch { return []; }
}
function stopFrame() { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
function schedule() {
  if (listening && consumers.size && connected && pageActive && !document.hidden && frame === null) frame = requestAnimationFrame(poll);
}
function poll() {
  frame = null;
  if (!consumers.size || !pageActive || document.hidden) return;
  const pads = readPads(); samples++;
  connected = pads.some(p => p?.connected);
  if (!connected) return;
  try { for (const consume of consumers.values()) consume(pads); } finally { schedule(); }
}
function refresh() {
  connected = readPads().some(p => p?.connected);
  if (!connected || !pageActive || document.hidden) stopFrame(); else schedule();
}
function hide() { pageActive = false; stopFrame(); }
function show() { pageActive = true; refresh(); }
function listen() {
  listening = true; pageActive = true;
  window.addEventListener('gamepadconnected', refresh); window.addEventListener('gamepaddisconnected', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
  refresh();
}
function dispose() {
  stopFrame();
  if (listening) {
    window.removeEventListener('gamepadconnected', refresh); window.removeEventListener('gamepaddisconnected', refresh);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
  }
  listening = false; connected = false; consumers.clear();
}

/** Subscribe only while this UI needs input. No controller means no recurring task. */
export function watchUiGamepads(consume: Consumer) {
  const key = Symbol(); consumers.set(key, consume);
  if (!listening) listen(); else schedule();
  return () => { consumers.delete(key); if (!consumers.size) dispose(); };
}
export const uiGamepadTasks = () => ({ consumers: consumers.size, framePending: frame !== null, listening, connected, samples });
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') Object.assign(window, { __worldUiGamepads: uiGamepadTasks });
if (import.meta.hot) import.meta.hot.dispose(dispose);

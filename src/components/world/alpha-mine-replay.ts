import { create } from 'zustand';
import { fetchAlphaReplay, type AlphaReplayPack } from './alpha-mine-data.ts';

export const useMineReplay = create<{ status: 'idle' | 'loading' | 'ready' | 'missing' | 'error'; pack: AlphaReplayPack | null }>(() => ({ status: 'idle', pack: null }));
let pending: AbortController | null = null;
/** One bounded local-file request after entering the attraction; no UI polling or background jobs. */
export async function loadMineReplay(retry = false) {
  if (pending || (!retry && useMineReplay.getState().status !== 'idle')) return;
  const request = new AbortController(); pending = request;
  useMineReplay.setState({ status: 'loading' });
  try {
    const result = await fetchAlphaReplay(request.signal);
    if (pending !== request) return;
    useMineReplay.setState(result.status === 'ready' ? { status: 'ready', pack: result.pack } : { status: result.status, pack: null });
  } catch (error) {
    if (pending === request && !(error instanceof DOMException && error.name === 'AbortError')) useMineReplay.setState({ status: 'error', pack: null });
  } finally { if (pending === request) pending = null; }
}
export function releaseMineReplay() {
  pending?.abort(); pending = null;
  if (useMineReplay.getState().status === 'loading') useMineReplay.setState({ status: 'idle' });
}

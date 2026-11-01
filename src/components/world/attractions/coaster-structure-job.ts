import { unpackCoasterStructure, type CoasterStructure, type CoasterStructurePacket } from './coaster-structure-transfer';
import { sceneWorkProbe } from '../world-scene-work';

type Reply = { packet: CoasterStructurePacket; workerMs: number } | { error: string };
type WorkerPort = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;
const spawn = () => new Worker(new URL('./coaster-structure.worker.ts', import.meta.url), { type: 'module', name: 'coaster-structure' });
/** Primitive QA counters, no scene/resource references and no background polling. */
export const coasterStructureJobs = { active: 0, completed: 0, failed: 0, lastWorkerMs: 0, lastError: '' };

export function buildCoasterInWorker(near: boolean, signal: AbortSignal, makeWorker: () => WorkerPort = spawn): Promise<CoasterStructure> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Coaster generation cancelled')); return; }
    let worker: WorkerPort;
    try { worker = makeWorker(); } catch (error) { reject(error); return; }
    let settled = false;
    coasterStructureJobs.active++;
    const finish = (error?: Error, value?: CoasterStructure) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); signal.removeEventListener('abort', cancel);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate(); coasterStructureJobs.active--;
      if (error) reject(error); else resolve(value!);
    };
    const fail = (message: string) => {
      coasterStructureJobs.failed++; coasterStructureJobs.lastError = message; finish(new Error(message));
    };
    const cancel = () => finish(new Error('Coaster generation cancelled'));
    // A finite deadline also releases a worker whose script never initializes.
    const timeout = setTimeout(() => fail('Coaster generation timed out'), 15000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      if (settled) return;
      const reply = event.data;
      if ('error' in reply) { fail(reply.error); return; }
      try {
        const value = sceneWorkProbe.measure(`coaster-hydrate:${near ? 'near' : 'far'}`, () => unpackCoasterStructure(reply.packet));
        coasterStructureJobs.completed++; coasterStructureJobs.lastWorkerMs = reply.workerMs; coasterStructureJobs.lastError = '';
        finish(undefined, value);
      } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
    };
    worker.onerror = () => fail('Coaster worker failed to load or run');
    worker.onmessageerror = () => fail('Coaster worker reply could not be read');
    try { worker.postMessage(near); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  });
}

import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { ShadowHullInput, ShadowHullOutput } from './shadow-chunk-hull';
import type { ShadowChunkStage } from './shadow-chunk-stages';

type WorkerPort = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;
type Reply = ShadowHullOutput | { error: string };
const spawn = () => new Worker(new URL('./shadow-chunk-hull.worker.ts', import.meta.url), { type: 'module', name: 'shadow-hull' });
export class ShadowHullError extends Error {}

/** One worker, one transferred source at a time, owned by one chunk transaction.
 * dispose terminates in-flight QuickHull and disconnects every callback/timer. */
export class ShadowHullJob {
  private worker: WorkerPort | null = null;
  private reply: Reply | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  readonly stats = { requests: 0, workerMs: 0, maxWorkerMs: 0, maxSource: '', maxInputVertices: 0 };
  constructor(private makeWorker: () => WorkerPort = spawn) {}

  *build(geometry: BufferGeometry, name: string): Generator<ShadowChunkStage, BufferGeometry> {
    if (this.closed) throw new ShadowHullError('Shadow hull job closed');
    const position = geometry.getAttribute('position'), wind = geometry.getAttribute('_wind');
    let input: ShadowHullInput | null = { positions: new Float64Array(position.count * 3), wind: wind ? new Float64Array(position.count * 4) : undefined };
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity), point = new Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i); min.min(point); max.max(point);
      input.positions[i * 3] = point.x; input.positions[i * 3 + 1] = point.y; input.positions[i * 3 + 2] = point.z;
      if (wind) {
        input.wind![i * 4] = wind.getX(i); input.wind![i * 4 + 1] = wind.getY(i);
        input.wind![i * 4 + 2] = wind.getZ(i); input.wind![i * 4 + 3] = wind.getW(i);
      }
      if ((i + 1) % 1024 === 0) yield 'hull-copy';
    }
    if (!geometry.boundingSphere) {
      const center = min.add(max).multiplyScalar(.5); let radiusSq = 0;
      for (let i = 0; i < input.positions.length; i += 3) {
        radiusSq = Math.max(radiusSq, point.fromArray(input.positions, i).distanceToSquared(center));
        if ((i + 3) % 3072 === 0) yield 'hull-copy';
      }
      geometry.boundingSphere = new Sphere(center, Math.sqrt(radiusSq));
    }
    yield 'hull-copy';
    try {
      if (!this.worker) this.worker = this.makeWorker();
      const worker = this.worker;
      this.reply = null;
      const fail = (message: string) => {
        if (this.closed || this.worker !== worker) return;
        this.reply = { error: message }; this.stopWorker();
      };
      this.worker.onmessage = event => {
        if (this.closed || this.worker !== worker) return;
        this.reply = event.data as Reply; this.clearDeadline();
      };
      this.worker.onerror = () => fail('Shadow hull worker failed to load or run');
      this.worker.onmessageerror = () => fail('Shadow hull worker reply could not be read');
      // Finite watchdog only, never a polling/render loop. Also stops a worker if paused.
      this.deadline = setTimeout(() => fail('Shadow hull worker timed out'), 15000);
      const transfers = [input.positions.buffer]; if (input.wind) transfers.push(input.wind.buffer);
      this.worker.postMessage(input, transfers); input = null;
      this.stats.requests++; this.stats.maxInputVertices = Math.max(this.stats.maxInputVertices, position.count);
    } catch {
      this.stopWorker(); throw new ShadowHullError('Shadow hull worker unavailable');
    }
    yield 'hull-submit';
    while (!this.reply) {
      if (this.closed) throw new ShadowHullError('Shadow hull job closed');
      yield 'hull-wait';
    }
    // Message handlers mutate this field between generator resumes.
    const reply = this.reply as Reply; this.reply = null;
    if ('error' in reply) throw new ShadowHullError(reply.error);
    this.stats.workerMs += reply.workerMs;
    if (reply.workerMs >= this.stats.maxWorkerMs) { this.stats.maxWorkerMs = reply.workerMs; this.stats.maxSource = name.slice(0, 120); }
    const hull = new BufferGeometry();
    hull.setAttribute('position', new BufferAttribute(reply.positions, 3));
    hull.setAttribute('normal', new BufferAttribute(reply.normals, 3));
    if (reply.wind) hull.setAttribute('_wind', new BufferAttribute(reply.wind, 4));
    hull.boundingSphere = geometry.boundingSphere;
    // Ownership transfers to the caller on return. No yield may strand a hydrated geometry.
    return hull;
  }

  private clearDeadline() { if (this.deadline !== null) clearTimeout(this.deadline); this.deadline = null; }
  private stopWorker() {
    this.clearDeadline();
    if (this.worker) {
      this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
      this.worker.terminate(); this.worker = null;
    }
  }
  dispose() { this.closed = true; this.stopWorker(); this.reply = null; }
}

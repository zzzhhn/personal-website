import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCoasterStructure } from './coaster-geometry.ts';
import { packCoasterStructure, unpackCoasterStructure } from './coaster-structure-transfer.ts';
import { buildCoasterInWorker, coasterStructureJobs } from './coaster-structure-job.ts';

const hash = array => createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const shape = data => ({
  steel:Object.entries(data.steel.attributes).map(([key,a])=>[key,a.itemSize,a.normalized,hash(a.array)]),
  glow:Object.entries(data.glow.attributes).map(([key,a])=>[key,a.itemSize,a.normalized,hash(a.array)]),
  colliders:data.colliders.map(c=>({...c,hull:c.hull&&hash(c.hull)})),
  relief:{...data.relief,vertices:hash(data.relief.vertices),indices:hash(data.relief.indices)},
  track:{vertices:hash(data.track.vertices),indices:hash(data.track.indices)},
  art:data.art,
  sphere:[data.steel,data.glow].map(g=>[g.boundingSphere.center.toArray(),g.boundingSphere.radius]),
});
test('real far/near batches retain every render, night-light and contact byte after transferable ownership handoff',()=>{
  for(const near of [false,true]){
    const original=createCoasterStructure(near),before=shape(original);
    const {packet,transfer}=packCoasterStructure(original);
    assert.equal(new Set(transfer).size,transfer.length);
    const received=structuredClone(packet,{transfer});
    assert.ok(transfer.every(b=>b.byteLength===0),'sender must release the transferred buffers');
    const restored=unpackCoasterStructure(received);
    assert.deepEqual(shape(restored),before);
    assert.equal(restored.steel.attributes.position.array,received.steel.attributes.position.array,'hydration must not copy vertex arrays');
    assert.equal(restored.track.vertices,received.track.vertices,'track contact must transfer without a second copy');
    restored.steel.dispose();restored.glow.dispose();
  }
});

function port(){return {onmessage:null,onerror:null,onmessageerror:null,sent:[],terminated:0,postMessage(value){this.sent.push(value);},terminate(){this.terminated++;}};}
const smallPacket=()=>({steel:{attributes:{},index:null,sphere:null,box:null},glow:{attributes:{},index:null,sphere:null,box:null},colliders:[],art:{},relief:{}});
test('success terminates the worker, hydrates once and leaves no active job',async()=>{
  const worker=port(),controller=new AbortController(),base=coasterStructureJobs.active;
  const pending=buildCoasterInWorker(true,controller.signal,()=>worker);assert.deepEqual(worker.sent,[true]);assert.equal(coasterStructureJobs.active,base+1);
  worker.onmessage({data:{packet:smallPacket(),workerMs:123}});
  const value=await pending;assert.equal(value.steel.isBufferGeometry,true);
  assert.equal(worker.terminated,1);assert.equal(worker.onmessage,null);assert.equal(coasterStructureJobs.active,base);
  controller.abort();assert.equal(worker.terminated,1);value.steel.dispose();value.glow.dispose();
});
test('cancellation, load failure, bad reply and post failure each release the worker exactly once',async()=>{
  for(const failure of ['abort','error','messageerror','post','reported']){
    const worker=port(),controller=new AbortController(),base=coasterStructureJobs.active;
    if(failure==='post')worker.postMessage=()=>{throw new Error('post failed');};
    const pending=buildCoasterInWorker(false,controller.signal,()=>worker);
    if(failure==='abort')controller.abort();
    if(failure==='error')worker.onerror({});
    if(failure==='messageerror')worker.onmessageerror({});
    if(failure==='reported')worker.onmessage({data:{error:'generation failed'}});
    await assert.rejects(pending);assert.equal(worker.terminated,1);assert.equal(coasterStructureJobs.active,base);
  }
});
test('already cancelled requests do not create a worker',async()=>{
  const controller=new AbortController();controller.abort();let created=0;
  await assert.rejects(buildCoasterInWorker(true,controller.signal,()=>{created++;return port();}));assert.equal(created,0);
});

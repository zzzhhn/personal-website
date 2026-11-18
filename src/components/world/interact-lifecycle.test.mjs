import test from 'node:test';
import assert from 'node:assert/strict';
import { interactableProxy, registerInteractable, nearestInteractable, interactables } from './WorldInteract.ts';
const item=(id,fn=()=>{})=>({id,position:[0,0,0],radius:1,label:{zh:id,en:id},kind:'exhibit',onInteract:fn});
test('a disappearing pickup is immediately inert and can unregister after its source becomes null',()=>{
 let calls=0,current=item('loose-ore',()=>calls++);const proxy=interactableProxy(current,()=>current),release=registerInteractable(proxy);
 assert.equal(nearestInteractable(0,0,0).item.id,'loose-ore');current=null;
 assert.equal(nearestInteractable(0,0,0),null);assert.doesNotThrow(()=>proxy.position);proxy.onInteract();assert.equal(calls,0);
 assert.doesNotThrow(release);assert.equal([...interactables()].some(i=>i.id==='loose-ore'),false);
});
test('an old registration cannot invoke a replacement id or erase its newer instance',()=>{
 let current=item('a');const proxy=interactableProxy(current,()=>current),release=registerInteractable(proxy);current=item('b');
 assert.equal(proxy.enabled(),false);assert.equal(nearestInteractable(0,0,0),null);
 const next=item('a'),releaseNext=registerInteractable(next);release();assert.equal(nearestInteractable(0,0,0).item,next);releaseNext();
});
test('only same-floor objects in reach run venue eligibility and enter the selection list',()=>{
  const checked=[], visible=[];
  const objects=[
    ['remote',[90,0,0],true],['upstairs',[0,5,0],true],['locked',[.1,0,0],false],
    ['near',[.4,0,0],true],['preferred',[.8,0,0],true],
  ];
  const cleanup=objects.map(([id,position,enabled])=>registerInteractable({
    ...item(id),position,enabled:()=>{checked.push(id);return enabled;},
  }));
  try {
    const pick=nearestInteractable(0,0,0,object=>{visible.push(object.id);return true;},'preferred');
    assert.equal(pick.item.id,'preferred');
    assert.deepEqual(visible,['near','preferred']);
    assert.deepEqual(checked,['locked','near','preferred']);
  } finally {cleanup.forEach(remove=>remove());}
});

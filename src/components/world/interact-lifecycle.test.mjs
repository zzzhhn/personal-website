import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileWorldComponent } from '../../../tools/world/alpha-mine-tests/component-host.mjs';
import { interactableProxy, registerInteractable, nearestInteractable, interactables, publishInteractionPrompt, resolvePromptTarget, cycleInteractPick, bindInteractionPanelInput, requestPanelInteraction } from './WorldInteract.ts';
import { useWorldStore } from './store.ts';
import { worldText } from './world-i18n.ts';
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

test('E follows the displayed row until the next publication, including after cycling', () => {
  const calls = [];
  const a = item('left', () => calls.push('left')), b = item('right', () => calls.push('right'));
  b.position = [.8,0,0];
  const removeA = registerInteractable(a), removeB = registerInteractable(b);
  try {
    const prompt = publishInteractionPrompt(nearestInteractable(.1,0,0).item, null);
    useWorldStore.setState({nearbyInteract:prompt, interactPick:null, paused:false});
    assert.equal(nearestInteractable(.7,0,0).item, b);
    resolvePromptTarget(useWorldStore.getState().nearbyInteract).onInteract();
    cycleInteractPick(1);
    const picked = useWorldStore.getState().nearbyInteract;
    assert.equal(picked.id, b.id);
    assert.equal(publishInteractionPrompt(a, prompt, picked.id).id, b.id, 'same-frame publication preserves the gamepad choice');
    resolvePromptTarget(picked).onInteract();
    assert.deepEqual(calls, ['left','right']);
    b.label = {zh:'放下', en:'Set down'};
    assert.equal(resolvePromptTarget(picked), null, 'old take prompt cannot execute a new command');
    b.label = picked.label;
    removeB();
    const removeReplacement = registerInteractable({...b});
    try { assert.equal(resolvePromptTarget(picked), null, 'reused scene id cannot consume an old press'); }
    finally {removeReplacement();}
  } finally {
    removeA(); removeB();
    useWorldStore.setState({nearbyInteract:null, interactPick:null});
  }
});

test('panel input carries the row the player saw, survives a new ranking and rejects replacement', () => {
  const calls = [];
  const a = item('left', () => calls.push('left')), b = item('right', () => calls.push('right'));
  b.position = [.8,0,0];
  const removeA = registerInteractable(a), removeB = registerInteractable(b);
  const obsolete = bindInteractionPanelInput(assert.fail);
  const release = bindInteractionPanelInput(row => resolvePromptTarget(row)?.onInteract());
  obsolete();
  try {
    const displayed = publishInteractionPrompt(nearestInteractable(.1,0,0).item, null);
    assert.equal(nearestInteractable(.7,0,0).item, b);
    requestPanelInteraction(displayed);
    removeA();
    const removeReplacement = registerInteractable({...a});
    try { requestPanelInteraction(displayed); }
    finally { removeReplacement(); }
    release();
    requestPanelInteraction(displayed);
    assert.deepEqual(calls,['left']);
  } finally { release(); removeA(); removeB(); }
});

test('a vault preview cannot conceal an available object or vehicle interaction', () => {
  const snapshot={...useWorldStore.getState(), canVault:true, lang:'en'};
  const { default: WorldCards } = compileWorldComponent(new URL('./WorldCards.tsx',import.meta.url))({
    './store':{useWorldStore:selector=>selector(snapshot)},
    './world-i18n':{worldText}, './WorldInteract':{}, './WorldCardContent':{},
    '../../lib/analytics':{}, './WorldUiGamepad':{},
  });
  const render=()=>renderToStaticMarkup(createElement(WorldCards,{content:{}}));
  const label={en:'Take lamp',zh:'取灯'}, row={id:'lamp',label,kind:'exhibit',registration:1};
  snapshot.nearbyInteract={...row,choices:[row]};
  assert.match(render(),/Take lamp/);
  snapshot.nearbyInteract=null;snapshot.nearbyVehicle='offroad';
  assert.match(render(),new RegExp(worldText.en.offroad));
  snapshot.nearbyVehicle=null;
  assert.match(render(),/world-vault-key/);
});

test('the coaster panel renders the controller selection after cycling even when another device is closer', () => {
  const label={en:'Board the train',zh:'坐进列车'}, row={id:'intent-board',label,kind:'exhibit',registration:1};
  const world={...useWorldStore.getState(),position:[0,0,0],lang:'en',nearbyInteract:{...row,choices:[row]}};
  const progress={keyTaken:false,chestOpen:false,gateOpen:true,passed:[],clarified:[]};
  const { default: Hud } = compileWorldComponent(new URL('./attractions/WorldIntentHud.tsx',import.meta.url))({
    '../store':{useWorldStore:selector=>selector(world)}, '../WorldInteract':{requestPanelInteraction},
    './coaster-track':{coasterVisibleView:()=>"chase"}, './intent-tasks':{findIntentTask:()=>null},
    './intent-state':{useIntentStore:()=>({active:true,progress})},
    './attraction-layout':{INTENT_COASTER:{bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2}}},
    './attraction-camera':{}, './intent-workshop-runtime':{useWorkshopStore:()=>({phase:'idle'})}, './intent-coaster.css':{},
    './intent-stations':{INTENT_TARGETS:{chest:[0,0,0],board:[2,0,0]},intentInReach:()=>true},
  });
  const render=()=>renderToStaticMarkup(createElement(Hud));
  assert.match(render(),/Board the train/);
  assert.doesNotMatch(render(),/Open the chest/);
  world.nearbyInteract=null;
  assert.doesNotMatch(render(),/intent-primary/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { guideActionHand } from '../rides/guide-action-hand.ts';
import { handleWorldEscape,useWorldStore } from '../store.ts';
import { startAlphaHand,cancelAlphaHand } from './alpha-state.ts';

test('Escape releases a scene-owned hand before opening the map',()=>{
 let released=0;useWorldStore.setState({paused:false});
 Object.assign(guideActionHand,{owner:'alpha-cave',target:[1,2,3],cancel:()=>released++});
 handleWorldEscape();assert.equal(released,1);assert.equal(guideActionHand.owner,null);
 assert.equal(useWorldStore.getState().paused,false);
 handleWorldEscape();assert.equal(useWorldStore.getState().paused,true);
 useWorldStore.setState({paused:false});
});
test('taking an existing island prop releases the cave lamp owner first',()=>{
 let released=0;Object.assign(guideActionHand,{owner:'alpha-cave',target:[1,2,3],cancel:()=>released++});
 startAlphaHand('wind',[4,5,6]);assert.equal(released,1);assert.equal(guideActionHand.owner,'alpha-island');
 cancelAlphaHand();assert.equal(guideActionHand.target,null);
});

// React, Three and Fiber perform the reconciliations and frame callbacks. Only the
// WebGL output is stubbed; pixel acceptance uses the separate browser runner.
import React from 'react';
import * as THREE from 'three';
import { act, advance, createRoot, extend } from '@react-three/fiber';

extend(THREE);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export async function mountFrameScene(t, Component, props) {
  const scene = new THREE.Scene();
  const canvas = {width:64,height:64};
  const root = createRoot(canvas);
  const gl = {domElement:canvas,render:()=>scene.updateMatrixWorld(true),setSize(){},setPixelRatio(){}};
  await root.configure({size:{width:64,height:64,top:0,left:0},gl,scene,frameloop:'never',dpr:1});
  let store, seconds=0;
  async function render(next) {
    await act(async()=>{store=root.render(React.createElement(Component,next));});
  }
  await render(props);
  t.after(async()=>{await act(async()=>{root.unmount();});});
  return {scene,render,frame:()=>advance(seconds+=1/60,false,store.getState())};
}

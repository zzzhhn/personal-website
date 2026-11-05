import base from '../coaster-ground-craft-20261105/review.config.mjs';

// Review-only controls. The normal playable build has no teleport/debug hooks.
const review = { name: 'coaster-site-repair-review', enforce: 'pre', transform(code,id) {
  if(id.endsWith('/layout-v4-flag.ts')) return code.replace('export const WORLD_SHOTS_V4 = [', `export const WORLD_SHOTS_V4 = [
    {id:'scene-arrival-day',position:[30,22,-102] as Vec3,target:[8,1,-123] as Vec3},
    {id:'scene-arrival-night',position:[30,22,-102] as Vec3,target:[8,1,-123] as Vec3},
    {id:'scene-boarding-day',position:[57,5.2,-145.5] as Vec3,target:[52,1.9,-153] as Vec3},
    {id:'scene-boarding-night',position:[57,5.2,-145.5] as Vec3,target:[52,1.9,-153] as Vec3},
    {id:'scene-boarding-graze-day',position:[55,2.6,-149.8] as Vec3,target:[52.8,1.8,-152.4] as Vec3},
    {id:'scene-boarding-graze-night',position:[55,2.6,-149.8] as Vec3,target:[52.8,1.8,-152.4] as Vec3},`);
  if(id.endsWith('/WorldRuntime.tsx')) return code.replace("button('侧面',", "button('到达广场',()=>view('scene-arrival'));button('右侧登乘',()=>view('scene-boarding'));button('楼梯掠视',()=>view('scene-boarding-graze'));button('侧面',");
  if(id.endsWith('/CarPerformanceReview.tsx')) return code.replace("button('QA 登乘口',", "button('QA 步道起点',()=>{worldActorDebug.teleportPlayer([8,1.045+PLAYER_CENTER_HEIGHT,-123]);useWorldStore.setState({shot:null,paused:false,seat:null});invalidate();});button('QA 登乘口',");
} };
export default { ...base, vite: { ...base.vite, plugins: [...base.vite.plugins,review] } };

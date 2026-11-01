/** Directed seam traversal evidence. QA teleports only establish isolated starts;
 * every tested connection is crossed with real WASD key events, without jumping.
 * Run after the environment seam fix; this script does not start a server. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = require(require.resolve('playwright', { paths: [process.env.WORLD_BROWSER_MODULES || repo] }));
const output = process.env.WORLD_CONNECTIONS_DIR || path.join(repo, 'docs/world/evidence');
const base = process.env.WORLD_BASE_URL || 'http://127.0.0.1:4321';
const boardwalkOnly = process.argv.includes('--boardwalk-only');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.WORLD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], checks = [], traversals = [];
const startedAt = new Date().toISOString();
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(() => window.__worldDebug.snapshot());
const distance = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const held = new Set();
function assert(condition, check, evidence) {
  checks.push({ check, passed: !!condition, evidence });
  if (!condition) throw new Error(check);
}
async function hold(keys) {
  const next = new Set(keys);
  for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
// WorldActors' fixed camera ground axes: D=(.8,-.6), W=(-.6,-.8).
// Select among the eight actual keyboard directions and correct on each sample.
const directions = [
  { keys:['KeyD'], x:.8,z:-.6 }, { keys:['KeyA'],x:-.8,z:.6 },
  { keys:['KeyW'],x:-.6,z:-.8 }, { keys:['KeyS'],x:.6,z:.8 },
  { keys:['KeyD','KeyW'],x:.2/Math.SQRT2,z:-1.4/Math.SQRT2 },
  { keys:['KeyD','KeyS'],x:1.4/Math.SQRT2,z:.2/Math.SQRT2 },
  { keys:['KeyA','KeyW'],x:-1.4/Math.SQRT2,z:-.2/Math.SQRT2 },
  { keys:['KeyA','KeyS'],x:-.2/Math.SQRT2,z:1.4/Math.SQRT2 },
];
function keysToward(position,target) {
  const dx=target[0]-position[0],dz=target[2]-position[2];
  return directions.reduce((best,direction)=>direction.x*dx+direction.z*dz>best.x*dx+best.z*dz?direction:best).keys;
}
function surfaceHeight(id,p) {
  if (id!=='camp-exit') return 1.14;
  if(p[0]<=-18) return 4.84;
  if(p[0]>=-5) return 1.14;
  return 4.84+(p[0]+18)/13*(1.14-4.84);
}
async function sample(route,keys=[]) {
  const s=await snapshot();
  const state=await page.evaluate(()=>({paused:window.__worldDebug.state().paused,shot:window.__worldDebug.state().shot}));
  const entry={ elapsedMs:Date.now()-route.started,position:s.player,grounded:s.grounded,activeVehicle:s.activeVehicle,keys:[...keys],surfaceY:surfaceHeight(route.id,s.player) };
  route.trace.push(entry);
  assert(s.activeVehicle===null && !state.paused && !state.shot,`${route.id}: walking physics stays active`,state);
  if(route.trace.length>1){
    const previous=route.trace.at(-2),dt=(entry.elapsedMs-previous.elapsedMs)/1000;
    // Detect an unexpected recovery/teleport rather than accepting its endpoint.
    if(distance(entry.position,previous.position)>7*dt+.65 || Math.abs(entry.position[1]-previous.position[1])>7*dt+.65) throw new Error(`${route.id}: discontinuous movement; possible recovery or teleport`);
  }
  if(Math.abs(entry.position[1]-(entry.surfaceY+.82))>.55) throw new Error(`${route.id}: capsule left the intended support surface`);
  return entry;
}
async function checkpoint(route,position,label) {
  const begin=Date.now();
  while(true){
    const current=await snapshot();
    if(distance(current.player,position)<.32) break;
    if(Date.now()-begin>15000) throw new Error(`${route.id}: could not reach ${label}`);
    const keys=keysToward(current.player,position);
    await hold(keys);await page.waitForTimeout(120);await sample(route,keys);
  }
  await hold([]);await page.waitForTimeout(180);
  await sample(route);
  const screenshot=`connection-${route.id}-${label}.png`;
  await page.screenshot({path:path.join(output,screenshot)});
  route.checkpoints.push({label,requested:position,actual:(await snapshot()).player,screenshot});
}
async function traverse({id,start,waypoints}) {
  await hold([]);
  if(start){
    const success=await page.evaluate(p=>window.__worldDebug.teleportPlayer(p),start);
    assert(success,`${id}: QA establishes start once`,start);
    await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded,undefined,{timeout:5000});
    await page.waitForTimeout(180);
  }
  const first=await snapshot();
  const route={id,setupTeleport:!!start,requestedStart:start ?? null,start:{position:first.player,grounded:first.grounded},started:Date.now(),trace:[],checkpoints:[]};
  traversals.push(route);
  await sample(route);
  await page.screenshot({path:path.join(output,`connection-${id}-start.png`)});
  for(const waypoint of waypoints) await checkpoint(route,waypoint.position,waypoint.label);
  await page.waitForFunction(()=>window.__worldDebug.snapshot().grounded,undefined,{timeout:3000});
  const last=await sample(route);
  route.end={position:last.position,grounded:last.grounded};
  route.groundedFraction=route.trace.filter(entry=>entry.grounded).length/route.trace.length;
  let unsupportedStart=null,maxUnsupportedMs=0;
  for(const entry of route.trace){
    if(!entry.grounded && unsupportedStart===null) unsupportedStart=entry.elapsedMs;
    if(entry.grounded && unsupportedStart!==null){maxUnsupportedMs=Math.max(maxUnsupportedMs,entry.elapsedMs-unsupportedStart);unsupportedStart=null;}
  }
  if(unsupportedStart!==null)maxUnsupportedMs=Math.max(maxUnsupportedMs,last.elapsedMs-unsupportedStart);
  route.maxUnsupportedMs=maxUnsupportedMs;
  assert(last.grounded,`${id}: endpoint grounded`,route.end);
  assert(route.groundedFraction>=.85 && maxUnsupportedMs<=600,`${id}: continuous support across connection`,{groundedFraction:route.groundedFraction,maxUnsupportedMs});
  assert(distance(route.start.position,last.position)>4,`${id}: meaningful keyboard traversal`,{start:route.start,end:route.end});
  route.passed=true;
}

try {
  await page.goto(`${base}/world?qa=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__worldDebug?.state().ready,undefined,{timeout:30000});
  await page.addStyleTag({content:'astro-dev-toolbar { display:none !important; }'});
  await page.waitForTimeout(700);
  await page.locator('canvas').click({position:{x:720,y:450}});
  if (!boardwalkOnly) {
  // Start past the parked offroad. Cross the camp's outer support edge, then
  // follow the actual descending centreline rather than falling off its side.
  await traverse({id:'camp-exit',start:[-22,5.78,34],waypoints:[
    {position:[-18.7,0,34],label:'seam'},
    {position:[-17,0,33.615],label:'slope'},
    {position:[-5,0,29],label:'ramp-end'},
    {position:[-2,0,27.64],label:'end'},
  ]});
  // A second isolated starting placement; from here both connections are walked
  // continuously. The bend on the plaza avoids the van's parked collision box.
  await traverse({id:'bridge-plaza',start:[30,2.1,-42.47],waypoints:[
    {position:[43,0,-44],label:'seam'},
    {position:[44,0,-42],label:'plaza'},
    {position:[51,0,-42],label:'end'},
  ]});
  }
  // Enter at the boardwalk's open end. Its +2.85m side rail starts at
  // centreline t=.12: approaching [53.5,-44.2] directly from the plaza
  // side would try to walk through that deliberate safety barrier.
  // The approach remains on the plaza, passes ahead of the rail start,
  // then walks through the mouth [49,-46] and along the centreline.
  await traverse({id:'plaza-boardwalk',start:boardwalkOnly?[50.8,2.1,-41.6]:undefined,waypoints:[
    {position:[49,0,-41.75],label:'approach'},
    {position:[49,0,-46],label:'entry-mouth'},
    {position:[53.5,0,-44.2],label:'seam'},
    {position:[62,0,-40.8],label:'end'},
  ]});
  assert(errors.length===0,'No browser page errors',errors);
} catch(error) {
  process.exitCode=1;
  checks.push({check:'Connection traversal completed',passed:false,error:error.message});
  await page.screenshot({path:path.join(output,'connection-failure.png')}).catch(()=>{});
} finally {
  await hold([]).catch(()=>{});
  const report={base,startedAt,finishedAt:new Date().toISOString(),command:`node scripts/world/connections.mjs${boardwalkOnly?' --boardwalk-only':''}`,
    scope:boardwalkOnly?'Only plaza-to-boardwalk traversal through its open entrance using real WASD events. One QA teleport establishes the plaza start. Camp and bridge checks are not rerun.':'Three targeted capsule connection traversals using real WASD keyboard events. QA teleport only sets two isolated starts. No jumps, driving, repeated teleports, or full regression.',
    routeCorrection:'The initial attempt approached the side rail from the plaza (blocked at [51.829647,-41.347374], about 3.27m from the centreline = 2.85m rail offset + .08m half thickness + .34m capsule radius). This route enters at the open mouth [49,-46]; it does not jump or cross the barrier.',
    limitation:'This records automated browser traversal and cannot substitute for Bobby’s five-minute handling/playability sign-off.',
    checks,traversals,errors};
  await writeFile(path.join(output,boardwalkOnly?'connection-boardwalk-regression.json':'connection-regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:checks.filter(check=>!check.passed || !check.check.includes('walking physics stays active')),routes:traversals.map(({id,start,end,passed,groundedFraction,maxUnsupportedMs})=>({id,start,end,passed,groundedFraction,maxUnsupportedMs})),errors},null,2));
  await browser.close();
}

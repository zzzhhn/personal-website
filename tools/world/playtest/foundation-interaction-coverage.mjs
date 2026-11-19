/** Recalculate per-ID coverage from the archived 138 registrations and any newer clean route reports. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import baseline from '../../../docs/world/foundation-20261117/interaction-census.json' with {type:'json'};

const venues=[
  [/^camp-about-/,'营地展品'],[/^camp-prop-/,'营地取用'],[/^camp-bench-/,'营地座位'],
  [/^street-/,'街区'],[/^town-/,'城镇'],[/^park-/,'园区'],[/^djc-/,'Club'],
  [/^factory-/,'工厂'],[/^ibd-/,'货场'],[/^intent-/,'过山车'],
  [/^alpha-(exchange|archive)-/,'交易厅'],[/^alpha-mine-/,'矿场'],[/^alpha-cave-/,'回音洞'],
  [/^alpha-waterwheel-/,'水车'],[/^alpha-(ferry|cable|sled)-/,'山岛交通'],[/^alpha-/,'山岛沿线'],
];
const conditional=[
  'alpha-lantern-release','ibd-stock-a','ibd-stock-b','ibd-truck-a','ibd-truck-b',
  ...['intake','bell','lookup','plan','debug','rewrite','extract','act'].map(id=>`intent-workshop-${id}`),
];
const noteUnknown=['交易厅档案票以下载后的 catalog 注册，ID 为 alpha-archive-<entry.id>。'];
// A successful route records only operations it actually completed. For example
// a far station reached by disembarking does not cover boarding from that station.
const original={
  ferry:[['alpha-ferry-board-0','keyboard','登船'],['alpha-ferry-board-0','panel','跳过到站并落脚']],
  cable:[['alpha-cable-board-0','gamepad','登乘'],['alpha-cable-board-0','panel','跳过到站并落脚']],
  sled:[['alpha-sled-board-0','keyboard','登乘'],['alpha-sled-board-0','panel','跳过到站并落脚']],
  coaster:[['intent-board','panel','登乘、跳过到站'],['intent-board','keyboard','申请下车']],
  lamp:[['alpha-cave-miner-lamp','gamepad','取灯']],
  factory:[['factory-raw','gamepad','选台、摇杆移吊、Y 吸取'],['factory-raw','panel','选择底盘料、退出']],
  yard:[
    ['ibd-manifest','keyboard','打开货单'],['ibd-manifest','panel','隐藏导览'],
    ['ibd-kit','keyboard','领取工具后继续拆检'],
    ['ibd-parts-a','keyboard','打开外箱'],['ibd-parts-a','panel','打开检验、呈样、合拢读取、归位退出'],
    ['ibd-parts-b','keyboard','打开外箱'],['ibd-parts-b','gamepad','呈样'],['ibd-parts-b','panel','打开检验、合拢读取、归位退出'],
  ],
  park:['P13-evalforge','P15-hepai','P18-interactive-learning'].map(id=>[`park-${id}`,'keyboard','起播、防重、播放结束恢复提示']),
  'coaster-obstacle':[
    ['intent-board','panel','登乘、清障重试、跳过回站'],['intent-board','keyboard','上阶中止、下车受阻保持'],
  ],
  'club-daybed':[['djc-daybed-0-1','keyboard','E 坐下、起身并恢复落地']],
  'park-course-obstacle':[['park-P18-interactive-learning','keyboard','受阻暂停，退开继续原轮次']],
  'camp-card-input':[
    ['camp-about-tent','keyboard','打开、关闭、重开、与 Y 同步防重'],
    ['camp-about-tent','gamepad','Y 重开、与 E 同步防重'],
    ['camp-about-tent','panel','关闭卡片'],
  ],
  'lamp-cancel-retry':[
    ['alpha-cave-miner-lamp','keyboard','靠近中改向取消、归还灯'],['alpha-cave-miner-lamp','gamepad','取消后重试取灯'],
  ],
  'park-djc-waypoint':[['park-P14-djc','gamepad','标出 Club 路线并提示']],
  'park-conversation':[
    ['park-P16-accompany','keyboard','入座并播放首句'],['park-P16-accompany','gamepad','起身，恢复落地'],
  ],
};

const [first,...rest]=process.argv.slice(2), json=first==='--json';
const paths=json?rest:process.argv.slice(2);
const current=new Set(baseline.ids), evidence=new Map(), sources=[];
const record=(route,source)=>{
  for(const [id,input,operation] of original[route]??[]){
    const key=`${id}/${input}`, operations=evidence.get(key)??new Map();
    const proof=operations.get(operation)??new Set();
    proof.add(source);operations.set(operation,proof);evidence.set(key,operations);
  }
};
sources.push({name:'archived census',entrySha256:baseline.entrySha256,browser:baseline.browser});
for(const route of baseline.passedRoutes)record(route,1);
for(const {passedRoutes,...source} of baseline.additionalRuns){
  sources.push(source);
  for(const route of passedRoutes)record(route,sources.length);
}
for(const path of paths){
  const rows=(await readFile(path,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  const entry=rows.find(row=>row.route==='ordinary entry'), end=rows.find(row=>['census','recovery-summary'].includes(row.route));
  assert.ok(entry?.entrySha256&&end,`${path}: missing entry or completed report`);
  assert.deepEqual(end.errors??[],[],`${path}: a run with browser errors is not evidence`);
  assert.deepEqual(end.failures??[],[],`${path}: a run with failed routes is not evidence`);
  assert.ok(!rows.some(row=>row.ok===false),`${path}: failed route`);
  for(const id of end.ids??[])if(!id.startsWith('qa-'))current.add(id);
  sources.push({name:path,entrySha256:entry.entrySha256,browser:entry.browser});
  for(const row of rows)if(row.ok===true)record(row.route,sources.length);
}
function coverage(id,input){
  return [...(evidence.get(`${id}/${input}`)??[])].map(([operation,proof])=>({operation,sources:[...proof]}));
}
const rows=[...new Set([...current,...conditional])].map(id=>{
  const venue=venues.find(([pattern])=>pattern.test(id))?.[1]??'待分区';
  return {id,venue,observed:current.has(id),keyboard:coverage(id,'keyboard'),gamepad:coverage(id,'gamepad'),panel:coverage(id,'panel')};
}).sort((a,b)=>a.venue.localeCompare(b.venue,'zh')||a.id.localeCompare(b.id));
const ordinary=rows.filter(row=>row.observed), modes=['keyboard','gamepad','panel'];
const summary={observed:ordinary.length,conditionalOnly:rows.length-ordinary.length,
  withBrowserAction:ordinary.filter(row=>modes.some(mode=>row[mode].length)).length,
  noBrowserAction:ordinary.filter(row=>modes.every(mode=>!row[mode].length)).length,
  perMode:Object.fromEntries(modes.map(mode=>[mode,ordinary.filter(row=>row[mode].length).length])),
};
if(json)console.log(JSON.stringify({summary,sources,rows,noteUnknown},null,2));
else{
  console.log(`已观察注册 ${summary.observed}，有至少一项实测操作 ${summary.withBrowserAction}，没有实测操作 ${summary.noBrowserAction}，仅从条件注册调用得知 ${summary.conditionalOnly}。\n`);
  console.log(sources.map((source,i)=>`[${i+1}] ${source.name} · ${source.browser} · ${source.entrySha256}`).join('\n'));
  console.log('\n短横线表示该输入方式没有本清单引用的证据。是否设计了独立面板入口需要看各场馆条件。');
  console.log('\n| 场馆 | ID | 注册 | Chrome 键盘 | 模拟标准手柄 | 面板点击 | 未验证的输入 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  const label={keyboard:'键盘',gamepad:'模拟手柄',panel:'面板'};
  for(const row of rows){
    const verified=mode=>row[mode].map(x=>`${x.operation} [${x.sources.join(',')}]`).join('；')||'—';
    const missing=modes.filter(mode=>!row[mode].length).map(mode=>label[mode]).join('、')||'见已验证子操作';
    console.log(`| ${row.venue} | \`${row.id}\` | ${row.observed?'实测挂载':'条件注册'} | ${modes.map(verified).join(' | ')} | ${missing} |`);
  }
  console.log(`\n${noteUnknown.join('\n')}`);
}

/** Normalize successful per-ID browser rows and the named older captures into one portable evidence file. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [archive,...logs]=process.argv.slice(2);
assert.ok(archive,'Usage: node foundation-interaction-evidence.mjs <evidence folder> [family JSONL ...]');
const runs=[];
async function previous(file,fixture,extract){
  const raw=await readFile(join(archive,file));
  const cases=extract(JSON.parse(raw));
  runs.push({name:file,sha256:createHash('sha256').update(raw).digest('hex'),fixture,cases});
}
function scenario(id,operation,before,after,control='E',input='keyboard'){
  return {id,events:[{input,control,operation,before,after}]};
}
await previous('mine-final-contact-play.json','Published mine entry and real keyboard routes. Backtest response stubbed.',d=>{
  assert.equal(d.equipped.prompt,'alpha-mine-tools');
  assert.match(d.equipped.label.en,/fresh exploration/);
  const vein=d.scanned.prompt;
  assert.equal(vein,'alpha-mine-vein-lower');
  for(const [state,needle] of [['scanned','0/3'],['hit1','1/3'],['hit2','2/3'],['hit3','Pick up']])assert.ok(d[state].label.en.includes(needle));
  assert.match(d.carriedHud,/follow the needle/i);
  assert.match(d.setDown,/ore is on the shelf/i);
  assert.ok(d.recovered.grounded&&d.toBayA.length>0);
  assert.equal(d.atA.prompt,'alpha-mine-pool-0');
  assert.deepEqual(d.post,[{method:'POST',factor:'REVERSAL_5'}]);
  assert.equal(d.resultMarker,'brain-online-result-0-REVERSAL_5');
  return [
    scenario(d.equipped.prompt,'装备探测器和镐，继续走向矿脉',d.entrance.at(-1).end,d.equipped),
    scenario(vein,'扫描、三敲并拾起矿石',d.intact.actor,{scanned:d.scanned,hit1:d.hit1,hit2:d.hit2,hit3:d.hit3,picked:d.picked,hud:d.carriedHud}),
    scenario('alpha-mine-dropped','F 暂存后 E 捡回同一矿石并走向池边',d.setDown,{recovered:d.recovered,next:d.toBayA[0].end},'F, E'),
    scenario(d.atA.prompt,'投入 A 池位，请求回测并展示结果',d.atA,{request:d.post,resultMarker:d.resultMarker,fixtureResponse:true}),
  ];
});
await previous('mine-final-contact-signage.json','Published mine entry and real keys.',d=>{
  const {prompt,card}=d.after;
  assert.equal(prompt.prompt,'alpha-mine-experience');assert.equal(card.kind,'experience');
  assert.deepEqual(d.before.card,card);
  return [scenario(prompt.prompt,'读取矿区经历卡',prompt,card)];
});
await previous('ibd-workstation-fixtures-play.json','Published yard entry and ordinary keyboard routing.',d=>{
  const {receiving,tools,toTools,kitOutcome}=d.after;
  assert.equal(receiving.prompt,'ibd-manifest');assert.equal(tools.prompt,'ibd-kit');
  assert.ok(tools.grounded&&toTools.length>0);
  assert.match(kitOutcome,/Take the torch and gauge/);
  return [
    scenario(receiving.prompt,'打开收货单并走向工具台',receiving,{arrival:tools}),
    scenario(tools.prompt,'启动领取检验工具',tools,{hud:kitOutcome}),
  ];
});
await previous('camp-pushable-browser.json','QA stance near the real objects. Original loader held then released.',d=>{
  const grabs=d.delayed.grabs;
  assert.equal(grabs.length,2);
  return grabs.flatMap(({held,dropped},i)=>{
    const id=`camp-prop-dumbbell-${i}`, prop=`C13-${i}`;
    const before=d.delayed.resolved.records.find(r=>r.id===prop);
    const a=held.records.find(r=>r.id===prop), b=dropped.records.find(r=>r.id===prop);
    assert.equal(before.colliderEnabled,true);
    assert.equal(a.colliderEnabled,false);assert.equal(b.colliderEnabled,true);
    return [scenario(id,'举起哑铃，手中刚体暂离碰撞',before,a),
      scenario(id+'-lower','放下哑铃，恢复实体碰撞',a,b)];
  });
});
await previous('camp-pushable-browser-tow.json','QA stance near the real suitcase.',d=>{
  const {start,drag,released}=d.tow.tow;
  assert.equal(drag.colliderHandle,start.colliderHandle);assert.equal(released.colliderEnabled,true);
  assert.ok(Math.hypot(drag.position[0]-start.position[0],drag.position[2]-start.position[2])>.08);
  return [scenario('camp-prop-suitcase','握柄拖行，再放开实物行李箱',start,{drag,released},'E, D, E')];
});
const benchCapture=await readFile(join(archive,'ibd-workstation-fixtures-benches.log'),'utf8');
const benchRows=benchCapture.trim().split('\n').map(line=>JSON.parse(line));
const benchEntry=benchRows.find(row=>row.route==='ordinary entry'),benchEnd=benchRows.find(row=>row.route==='census');
const benches=benchRows.find(row=>row.route==='yard'&&row.ok)?.benches;
assert.ok(benchEntry?.entrySha256&&benches?.length===2);
assert.deepEqual(benchEnd.failures,[]);assert.deepEqual(benchEnd.errors,[]);
runs.push({name:'ibd-workstation-fixtures-benches.log',entrySha256:benchEntry.entrySha256,browser:benchEntry.browser,
  sha256:createHash('sha256').update(benchCapture).digest('hex'),fixture:'Published entry checked. QA stance at each real inspection bench.',
  cases:benches.map(({id,before,after,reading},i)=>{
    assert.equal(id,['ibd-parts-a','ibd-parts-b'][i]);assert.equal(before.near,id);
    assert.ok(after.grounded);assert.equal(reading,'M8');
    return scenario(id,'打开检验，从指定口呈样，合拢读取 M8',before,{after,reading},
      i===0?'呈样、合拢按钮':'打开、合拢按钮','panel');
  }),
});
for(const file of logs){
  const raw=await readFile(file,'utf8'), rows=raw.trim().split('\n').map(line=>JSON.parse(line));
  if(rows[0]?.mode==='preferred'){
    const summary=rows.find(row=>Array.isArray(row.teleports));
    assert.deepEqual(summary.errors,[]);assert.deepEqual(summary.teleports,[]);
    const tools=rows.filter(row=>Number.isInteger(row.lane));
    assert.deepEqual(tools.map(row=>row.lane),[0,1,2,3,4]);
    const cases=tools.map(({lane,rest,held,returned})=>{
      const id=`camp-prop-tool-${lane}`;
      assert.equal(rest.activity.id,null);assert.equal(held.activity.id,id);
      assert.equal(held.activity.state.phase,'held');assert.ok(held.activity.hand.palm);
      assert.equal(returned.activity.id,null);assert.ok(returned.activity.actor.grounded);
      assert.deepEqual(returned.parts,rest.parts);
      const disabled=held.parts.filter(part=>!part.enabled);assert.equal(disabled.length,1);
      return scenario(id,'从工具墙取用，持有后归还并恢复原碰撞',
        {position:rest.player,tool:rest.parts.find(part=>part.id===disabled[0].id)},
        {held:held.activity.state,palm:held.activity.hand.palm,parkedDuringHold:disabled[0],returned:returned.parts.find(part=>part.id===disabled[0].id),
          grounded:returned.activity.actor.grounded,position:returned.player},'E, E');
    });
    runs.push({name:'C11 五件工具逐件实测',sha256:createHash('sha256').update(raw).digest('hex'),
      fixture:'QA readback only. Walked from camp with no position fixtures.',cases});
    continue;
  }
  const entry=rows.find(row=>row.route==='ordinary entry'), summary=rows.find(row=>row.route==='family-summary');
  assert.equal(entry?.entrySha256,summary?.entrySha256,`${file}: inconsistent build`);
  assert.ok(entry?.entrySha256&&summary,`${file}: incomplete capture`);
  assert.deepEqual(summary.errors,[],`${file}: browser errors`);
  const rejected=rows.filter(row=>row.route==='interaction-case'&&!row.ok).map(row=>row.id);
  assert.deepEqual(summary.failures,rejected,`${file}: inconsistent individual failures`);
  const cases=rows.filter(row=>row.route==='interaction-case'&&row.ok===true)
    .map(({id,fixture,events})=>({id,fixture,events}));
  runs.push({name:'操作族浏览器采集 · '+(logs.indexOf(file)+1),entrySha256:entry.entrySha256,browser:entry.browser,
    sha256:createHash('sha256').update(raw).digest('hex'),fixture:'Ordinary entry checked. QA locations followed by production controls.',cases,
    ids:summary.ids,omittedFailures:summary.failures});
}
console.log(JSON.stringify({runs},null,2));

// node --import ./tools/world/alpha-mine-tests/register.mjs --test src/components/world/water-interaction.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterContactSystem, WATER_IMPACT_CAPACITY, WATER_IMPACT_LIFETIME } from './WorldWaterInteraction.ts';
import { waterSurfaceAt } from './WorldWaterSurfaces.ts';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout.ts';
import { CLUB_POOL } from './djc-club-layout.ts';
import { WATER_Y } from './layout.ts';
const actor = (x, bottom, y = bottom + .85) => ({ id: 'player', kind: 'player', x, z: 0, y, bottom, radius: .45 });
const surface = x => x >= 0 ? 1.35 : null;
test('entry emits once, walking creates a wake, idle and a frozen clock create nothing', () => {
  const s = new WaterContactSystem();
  s.step([actor(-1, 1.4)], 0, surface);
  s.step([actor(.1, 1)], .1, surface); assert.equal(s.emitted, 1);
  for (let i = 2; i < 30; i++) s.step([actor(.1, 1)], i / 10, surface);
  assert.equal(s.emitted, 1);
  s.step([actor(.6, 1)], 3, surface); assert.equal(s.emitted, 2);
  s.step([actor(1.6, 1)], 3, surface); assert.equal(s.emitted, 2);
});
test('airborne characters and portals do not leave spurious water trails', () => {
  const s = new WaterContactSystem();
  s.step([actor(1, 3)], 0, surface); s.step([actor(1.3, 2)], .1, surface); assert.equal(s.emitted, 0);
  s.step([actor(1.4, 1)], .2, surface); assert.equal(s.emitted, 1); assert.ok(s.impacts[0].splash > .5);
  s.step([actor(50, 1)], .3, surface); assert.equal(s.emitted, 1);
  s.step([actor(50, 1)], .4, surface); assert.equal(s.emitted, 1);
});
test('long walks have fixed event storage and switching water elevations creates a new contact', () => {
  const s = new WaterContactSystem();
  for (let i = 0; i < 300; i++) s.step([actor(i * .5, 1)], i * .2, surface);
  assert.equal(s.impacts.length, WATER_IMPACT_CAPACITY); assert.ok(s.emitted > 100);
  assert.ok(s.impacts.every(p => Number.isFinite(p.strength) && p.strength <= 1));
  const before = s.emitted;
  s.step([actor(149.5, .6)], 60, () => 1); assert.equal(s.emitted, before + 1);
  assert.equal(s.impacts.find(p => p.at === 60)?.y, 1);
  s.step([], 60 + WATER_IMPACT_LIFETIME, surface); s.reset(); assert.equal(s.emitted, 0);
  assert.ok(s.impacts.every(p => p.strength === 0));
});
test('mine, club and sea use distinct elevations and dry ground has no water', () => {
  const basin = {center:[1.8,0,-6.5],innerRadius:2.5,waterY:.6};
  assert.equal(waterSurfaceAt(ALPHA_MINE_ORIGIN[0]+1.8,ALPHA_MINE_ORIGIN[2]-6.5,basin),ALPHA_MINE_ORIGIN[1]+.6);
  assert.equal(waterSurfaceAt(CLUB_POOL.center[0],CLUB_POOL.center[2],basin),CLUB_POOL.waterY);
  assert.equal(waterSurfaceAt(500,500,basin),WATER_Y);
  assert.equal(waterSurfaceAt(-35,35,basin),null);
});
test('thrown objects share bounded impact storage with footfalls', () => {
  const s = new WaterContactSystem();
  for(let i=0;i<30;i++)s.emit({x:2,z:3,y:1.74,at:i,strength:.85,radius:.08,splash:.55});
  assert.equal(s.emitted,30);assert.equal(s.impacts.length,WATER_IMPACT_CAPACITY);
  assert.ok(s.impacts.some(p=>p.at===29&&p.y===1.74));
});

test('walking wakes follow motion and turning changes their direction without changing entry impulses',()=>{
  const s=new WaterContactSystem();
  s.step([actor(.1,1)],0,surface);
  assert.equal(s.impacts[0].vx,0);assert.equal(s.impacts[0].vz,0,'entry radiates outward');
  s.step([actor(.7,1)],.2,surface);
  assert.ok(s.impacts[1].vx>0);assert.equal(s.impacts[1].vz,0);
  s.step([{...actor(.7,1),z:.7}],.4,surface);
  assert.equal(s.impacts[2].vx,0);assert.ok(s.impacts[2].vz>0);
  for(let i=0;i<WATER_IMPACT_CAPACITY;i++)s.emit({x:0,z:0,y:1.35,at:1+i,strength:.8,radius:.1,splash:.5});
  assert.ok(s.impacts.every(p=>p.vx===0&&p.vz===0),'reused drop slots never inherit walking directions');
});

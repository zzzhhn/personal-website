import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorldMap from './WorldMap.tsx';
import { useWorldStore } from './store.ts';
import { createMapPathCache } from './map-path-cache.ts';
import { WORLD_DESTINATIONS, FIRST_VISIT_DESTINATIONS, FERRY_MAP_MARK, destination, destinationAt, factoryGuideRoute } from './world-destinations.ts';
import { FACTORY, factoryWorld, factoryLocal, factoryStation, inFactory, FACTORY_STATIONS } from './factory/factory-layout.ts';
import { FACTORY_WALK_NODES, FACTORY_WALK_EDGES } from './factory/factory-navigation.ts';
import { INTENT_COASTER, IBD_YARD, attractionCapeDistance } from './attractions/attraction-layout.ts';
import { ALPHA_MINE_ORIGIN, isOnAlphaMineBase } from './alpha-mine-layout.ts';
import { CLUB } from './djc-club-layout.ts';
import { ALPHA_MAINLAND_PIER_POLYGON, ALPHA_MAINLAND_APPROACH, ALPHA_MAINLAND_DOCK } from './alpha-island/alpha-layout.ts';
import { DIRECTION_TEXT } from './WorldStreetSigns.ts';
import { worldText } from './world-i18n.ts';
import { meshHeight } from './WorldLandform.ts';

const inside = (x, z, polygon) => {
  let hit = false;
  polygon.forEach((a, i) => { const b = polygon[(i + 1) % polygon.length]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; });
  return hit;
};
const xz = p => [p[0], p[2]];

test('six featured places read their arrival points from the layout contracts', () => {
  assert.deepEqual(WORLD_DESTINATIONS.map(d => d.id), ['alpha', 'factory', 'coaster', 'yard', 'mine', 'club']);
  const source = { alpha: xz(ALPHA_MAINLAND_APPROACH[2]), factory: xz(FACTORY.entrance), coaster: xz(INTENT_COASTER.entrance),
    yard: xz(IBD_YARD.entrance), mine: xz(ALPHA_MINE_ORIGIN), club: xz(CLUB.entrance) };
  for (const d of WORLD_DESTINATIONS) assert.deepEqual(d.at, source[d.id], `${d.id} must reuse its layout constant`);
  assert.deepEqual(destination('alpha').at, [-10, 103]);
  assert.deepEqual(destination('factory').at, [-149, -17]);
  assert.deepEqual(FERRY_MAP_MARK, destination('alpha').at);
  assert.deepEqual(FIRST_VISIT_DESTINATIONS, ['alpha', 'factory', 'coaster']);
});

test('every arrival point is walkable: dry ground, a facility floor or the ferry pier deck', () => {
  for (const d of WORLD_DESTINATIONS) {
    const [x, z] = d.at;
    if (d.id === 'alpha') {
      // The boarding point is on the timber pier over water, between the shore and the berth.
      assert.ok(inside(x, z, ALPHA_MAINLAND_PIER_POLYGON.map(xz)), 'ferry point on the pier deck');
      assert.ok(z < ALPHA_MAINLAND_DOCK.safeExit[0][2] && z > ALPHA_MAINLAND_APPROACH[1][2], 'ferry point short of the berth');
      continue;
    }
    const y = meshHeight(x, z);
    assert.ok(y !== null && y > .9 && y < 1.4, `${d.id} at ${x},${z} has ground ${y}`);
  }
  assert.ok(inFactory(...destination('factory').at), 'factory entrance counts as inside the works');
  assert.ok(attractionCapeDistance(...destination('coaster').at) < 0 && attractionCapeDistance(...destination('yard').at) < 0);
  assert.ok(isOnAlphaMineBase(...destination('mine').at), 'quarry entrance is on the mine base');
});

test('copy is complete in both languages and states play, not portfolio facts', () => {
  for (const d of WORLD_DESTINATIONS) for (const lang of ['zh', 'en']) {
    assert.ok(d.name[lang].trim().length >= 2, `${d.id} ${lang} name`);
    assert.ok(d.detail[lang].trim().length >= 6, `${d.id} ${lang} detail`);
    assert.doesNotMatch(d.detail[lang], /\d{4}|实习|intern/i, `${d.id} ${lang} detail stays about play`);
  }
  for (const key of ['placesTitle', 'placesHint', 'placesActive', 'guideTitle', 'guideLead', 'guideAll', 'guideClose', 'ferryMark',
    'factoryFresh', 'factoryNext', 'factoryNextTail', 'factoryReleased', 'factoryShow', 'factoryShown'])
    for (const lang of ['zh', 'en']) assert.ok(worldText[lang][key]?.length, `${lang}.${key}`);
});

test('a waypoint is matched to a place only at its arrival point', () => {
  assert.equal(destinationAt(null), null);
  assert.equal(destinationAt([-10, 103.4]), 'alpha');
  assert.equal(destinationAt([-10, 109]), null);
  for (const d of WORLD_DESTINATIONS) assert.equal(destinationAt(d.at), d.id);
});

test('floor guide from any spot inside the works follows surveyed aisles to the station', () => {
  const nodes = Object.values(FACTORY_WALK_NODES), linked = new Set(FACTORY_WALK_EDGES.map(([a, b]) => `${a}|${b}`));
  const isNode = p => nodes.some(n => Math.hypot(n[0] - p[0], n[2] - p[2]) < 1e-6);
  const starts = [FACTORY.entrance, factoryWorld([0, .12, -29.5]), factoryWorld([-40, .12, -27]), factoryWorld(factoryStation('raw').at), factoryWorld([45, .12, 20])];
  for (const station of FACTORY_STATIONS) for (const start of starts) {
    const route = factoryGuideRoute(start[0], start[2], station.id);
    const goal = factoryStation(station.id).at, local = factoryLocal(start);
    if (Math.hypot(local[0] - goal[0], local[2] - goal[2]) < .01) { assert.deepEqual(route, []); continue; }
    assert.ok(route.length >= 2, `${station.id} from ${start}`);
    assert.deepEqual(route.at(-1), [...goal], `${station.id} route ends at the console stand`);
    route.slice(1).forEach(p => assert.ok(isNode(p), `${station.id}: ${p} is a surveyed aisle node`));
    // Only the first leg may leave the graph, and it is a short step onto the nearest node.
    if (!isNode(route[0])) assert.ok(Math.hypot(route[0][0] - route[1][0], route[0][2] - route[1][2]) < 30);
    else for (let i = 1; i < route.length; i++) {
      const key = q => Object.entries(FACTORY_WALK_NODES).find(([, n]) => Math.hypot(n[0] - q[0], n[2] - q[2]) < 1e-6)[0];
      const a = key(route[i - 1]), b = key(route[i]);
      assert.ok(linked.has(`${a}|${b}`) || linked.has(`${b}|${a}`), `${a} -> ${b} is a surveyed edge`);
    }
  }
  const fromEntrance = factoryGuideRoute(FACTORY.entrance[0], FACTORY.entrance[2], 'raw');
  assert.deepEqual(fromEntrance[0], FACTORY_WALK_NODES.entrance, 'outside door joins the graph at the entrance node');
});

test('street boards name the new districts and fit their 660x290 cells', () => {
  const all = Object.values(DIRECTION_TEXT).flat();
  assert.ok(all.some(r => r[1] === worldText.zh.factory), 'west boards point to the works');
  assert.ok(all.some(r => r[1] === worldText.zh.ferryMark), 'camp road points to the ferry');
  assert.ok(all.some(r => /过山车/.test(r[1])), 'north cape coaster is signed');
  assert.ok(!all.some(r => r[1] === '西岸'), 'stale west shore board replaced');
  assert.equal(Object.keys(DIRECTION_TEXT).length, 6);
  // Conservative glyph widths at the painter's sizes: CJK 64 px, Latin 38 px font (~.62 em average).
  const width = (s, px) => [...s].reduce((w, c) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? px : c === ' ' ? px * .3 : px * .62), 0);
  for (const [arrow, zh, en] of all) {
    assert.match(arrow, /^[←→↑]$/);
    assert.ok(width(zh, 64) <= 660 * .68, `${zh} fits`);
    assert.ok(width(en, 38) <= 660 * .68, `${en} fits`);
  }
  assert.equal(all.length, 12, 'two rows per board, same UV layout');
});

test('full map and radar actually render the player anchor and the labelled ferry at its berth', () => {
  const { position, lang } = useWorldStore.getInitialState();
  for (const mode of ['full', 'mini']) {
    const svg = renderToStaticMarkup(createElement(WorldMap, { mode }));
    const player = svg.match(/<circle\b[^>]*class="world-map-anchor"[^>]*>/)?.[0];
    assert.ok(player?.includes(`cx="${position[0]}"`) && player.includes(`cy="${position[2]}"`) && player.includes('r="2.6"'));
    const berth = svg.match(/<g\b[^>]*data-ferry-mark="mainland"[^>]*>[\s\S]*?<\/g>/)?.[0];
    assert.ok(berth?.includes(`translate(${FERRY_MAP_MARK.join(' ')})`));
    assert.ok(berth.includes('>' + worldText[lang].ferryMark + '<'));
  }
});

test('static map positions are serialized once; live points can move on the next render', () => {
  let reads = 0;
  const fixed = [[1, 2], [3, 4]];
  Object.defineProperty(fixed[0], '0', { get() { reads++; return 1; } });
  const cache = createMapPathCache();
  cache.register(fixed);
  assert.equal(cache.path(fixed), '1,2 3,4');
  const firstReads = reads;
  assert.ok(firstReads > 0);
  for (let render=0;render<20;render++) assert.equal(cache.path(fixed), '1,2 3,4');
  assert.equal(reads, firstReads);
  const live = [[1, 3]];
  assert.equal(cache.path(live), '1,3');
  live[0][0] = 5;
  assert.equal(cache.path(live), '5,3');
});

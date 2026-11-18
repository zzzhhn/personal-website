import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { snapshotInputs } from './world-map-snapshot.mjs';

const root = new URL('../../src/components/world/', import.meta.url);
const snapshots = ['v4', 'v3'].map(variant => JSON.parse(readFileSync(new URL(`world-map-${variant}.generated.json`, root), 'utf8')));

test('generated maps are current and contain every waterline and route within full-map bounds', () => {
  const { sourceHash } = snapshotInputs();
  for (const geometry of snapshots) {
    assert.equal(geometry.sourceHash, sourceHash, 'run node tools/world/world-map-snapshot.mjs after terrain/layout changes');
    assert.ok(geometry.shores.length >= 2, 'both mainland and Alpha island must exist immediately');
    const [x, z, width, height] = geometry.viewBox;
    assert.ok(width > 400 && height > 600, 'the complete expanded world must replace the cropped legacy view');
    for (const p of [...geometry.shores.flat(), ...geometry.coaster, ...geometry.camp, ...(geometry.roads?.flatMap(r => r.pts) ?? [])]) {
      const pz = p.length === 3 ? p[2] : p[1];
      assert.ok(p[0] >= x + 11.99 && p[0] <= x + width - 11.99 && pz >= z + 11.99 && pz <= z + height - 11.99, `clipped map geometry at ${p}`);
    }
  }
});

test('the first full-map render already has the complete current shoreline without a terrain/Three import', async () => {
  // Node's TS test loader handles app modules; mirror Vite's JSON support while guarding the UI boundary.
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      assert.ok(!/^three(?:\/|$)/.test(specifier), `loading map imported ${specifier}`);
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      assert.ok(!/\/(?:WorldLandform|alpha-terrain)\.ts$/.test(url), `loading map imported ${url}`);
      if (url.startsWith('file:') && url.endsWith('.generated.json')) return { format: 'module', source: `export default ${readFileSync(new URL(url), 'utf8')}`, shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  try {
    const { default: WorldMap, WORLD_MAP_GEOMETRY: geometry } = await import(new URL('WorldMap.tsx', root));
    const full = renderToStaticMarkup(createElement(WorldMap, { mode: 'full', showPlayer: false }));
    const shoreline = geometry.shores.map(loop => `M${loop.map(p => `${p[0]},${p[1]}`).join(' ')}Z`).join(' ');
    assert.ok(full.includes(`viewBox="${geometry.viewBox.join(' ')}"`));
    assert.ok(full.includes(`d="${shoreline}"`), 'first render must use current terrain waterlines');
    assert.ok(full.includes('data-alpha-island="batch2"'));
    assert.ok(!full.includes('world-map-player'), 'loading map hides player');
    assert.match(full, />(海侧步道|Coastal path)<\/text>/);
    assert.doesNotMatch(full, />(石滩|Shallows)<\/text>/);
    const mini = renderToStaticMarkup(createElement(WorldMap));
    assert.ok(/viewBox="[^"]+ 92 92"/.test(mini), 'radar keeps its player-centered window');
    assert.ok(mini.includes('world-map-player'));
  } finally { hook.deregister(); }
});

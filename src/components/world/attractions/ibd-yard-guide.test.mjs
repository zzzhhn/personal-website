import test from 'node:test';
import assert from 'node:assert/strict';
import { ibdGuideStep, ibdGuideRoute, ibdGuideReturnRoute, ibdGuideResult, ibdGuidePhaseDone } from './ibd-yard-guide.ts';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createIbdYardGame, requestIbdYardAction, finishIbdYardAction, yardActions, yardCase } from './ibd-yard-game.ts';
import { ibdStation } from './ibd-yard-layout.ts';
import { assessIbd } from './ibd-model.ts';
import { buildIbdStatic } from './ibd-yard-geometry.ts';

const actor = (game, station) => ({ active: true, local: ibdStation(station, game.core.moved).at });
function act(game, action) {
  const a = actor(game, action.station), requested = requestIbdYardAction(game, action, a);
  return requested.pending ? finishIbdYardAction(requested, requested.pending.token, a) : requested;
}
function manual(game, station, kind) {
  return act(game, yardActions(game, station).find(a => !kind || a.kind === kind));
}
test('a fresh player can finish the first real batch by following only the current recommended action', () => {
  let game = createIbdYardGame(); const visited = [];
  for (let i = 0; i < 40 && !game.released; i++) {
    const step = ibdGuideStep(game); visited.push(step.action.kind);
    const before = JSON.stringify(game); assert.deepEqual(ibdGuideStep(game), step); assert.equal(JSON.stringify(game), before);
    assert.ok(step.title.zh.length <= 16 && step.hint.zh.length <= 28, 'instructions must stay short');
    const next = act(game, step.action);
    assert.notDeepEqual(next, game, `${step.action.station}/${step.action.kind} must do actual work`); game = next;
  }
  assert.equal(game.released, true); assert.equal(assessIbd(yardCase(game), game.core).status, 'clear');
  assert.deepEqual(visited, ['brief', 'kit', 'scan', 'turn', 'rear', 'crane', 'scan', 'turn', 'rear', 'weigh', 'open', 'contents', 'weigh', 'open', 'contents', 'load', 'load', 'verify', 'release']);
  assert.deepEqual(game.core.loaded, ['parts-a', 'parts-b']);
});
test('all anomaly cases guide through real correction, replacement reinspection and dispatch without a dead end', () => {
  for (const index of [1, 2, 3]) {
    let game = createIbdYardGame(index); let exchanges = 0;
    for (let i = 0; i < 60 && !game.released; i++) {
      const step = ibdGuideStep(game); if (step.action.kind === 'replace') exchanges++;
      game = act(game, step.action);
    }
    assert.equal(game.released, true, `case ${index}`); assert.equal(exchanges, 1);
    assert.equal(assessIbd(yardCase(game), game.core).status, 'clear');
    assert.equal(game.exchanges.length, 1);
  }
});
test('pending, cancelled, remote and paused actions never falsely advance the next physical instruction', () => {
  let game = manual(createIbdYardGame(), 'manifest', 'brief'), step = ibdGuideStep(game);
  const remote = requestIbdYardAction(game, step.action, { active: true, local: [500, 1, 500] });
  assert.equal(ibdGuideStep(remote).action.kind, 'kit');
  const pending = requestIbdYardAction(game, step.action, actor(game, 'kit'));
  assert.equal(ibdGuideStep(pending).action.kind, 'kit'); assert.equal(pending.equipped, false);
  const paused = finishIbdYardAction(pending, pending.pending.token, { ...actor(game, 'kit'), paused: true });
  assert.equal(paused, pending);
  const away = finishIbdYardAction(pending, pending.pending.token, { active: true, local: [50, 1, 50] });
  assert.equal(away.equipped, false); assert.equal(ibdGuideStep(away).action.kind, 'kit');
  game = act(away, ibdGuideStep(away).action); assert.equal(ibdGuideStep(game).action.kind, 'scan');
});
test('resuming after free exploration respects gallery proofs, opened cartons and wrongly loaded cargo', () => {
  let game = manual(manual(createIbdYardGame(), 'manifest'), 'kit');
  game = manual(manual(game, 'gallery-front'), 'gallery-rear');
  assert.equal(ibdGuideStep(game).action.kind, 'weigh');
  game = manual(game, 'parts-a', 'open');
  assert.equal(ibdGuideStep(game).action.kind, 'contents', 'do not force optional weighing after opening');
  game = manual(game, 'load-a');
  assert.equal(ibdGuideStep(game).action.kind, 'unload');
  assert.equal(ibdGuidePhaseDone(game)[3], false); assert.equal(ibdGuidePhaseDone(game)[4], false);
  game = act(game, ibdGuideStep(game).action);
  assert.equal(ibdGuideStep(game).action.kind, 'contents');
  const saved = JSON.stringify(game); ibdGuideStep(game); ibdGuideRoute(game); assert.equal(JSON.stringify(game), saved);
  game = manual(game, 'manifest', 'reset');
  assert.equal(ibdGuideStep(game).action.kind, 'brief'); assert.equal(game.round, 2);
});
test('changed React components and guide modules parse without TS/JSX syntax errors', () => {
  for (const file of ['WorldIbdGuide.tsx', 'WorldIbdHud.tsx', 'WorldIbdYard.tsx', 'ibd-yard-guide.ts', 'ibd-yard-store.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [], file);
  }
});
test('the first-batch ground breadcrumbs avoid floor-level fixed cuboids with player-width clearance', () => {
  const data = buildIbdStatic();
  try {
    const obstacles = data.solids.filter(s => !s.rotation && s.at[1] + s.size[1] / 2 > .16 && s.at[1] - s.size[1] / 2 < 1.7);
    let game = createIbdYardGame();
    for (let action = 0; action < 30 && !game.released; action++) {
      const step = ibdGuideStep(game), paths = [ibdGuideRoute(game, step), ibdGuideReturnRoute(game, step)];
      for (const path of paths) for (let j = 0; j < path.length - 1; j++) {
        const a = path[j], b = path[j + 1], samples = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / .2);
        for (let i = 0; i <= samples; i++) {
          const t = samples ? i / samples : 0, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
          for (const s of obstacles) {
            const dx = Math.max(0, Math.abs(x - s.at[0]) - s.size[0] / 2), dz = Math.max(0, Math.abs(z - s.at[2]) - s.size[2] / 2);
            assert.ok(Math.hypot(dx, dz) >= .34, `${step.action.station}: trail at ${x},${z} hits solid ${s.at}`);
          }
        }
      }
      game = act(game, step.action);
    }
  } finally { data.geometry.dispose(); }
});

test('rear-coil approach and return cues use the south opening and keep turn instructions outside the controls', () => {
  let game = createIbdYardGame();
  for (let i = 0; i < 12 && game.notice !== 'crane'; i++) game = act(game, ibdGuideStep(game).action);
  assert.equal(game.notice, 'crane');
  for (const kind of ['scan', 'turn', 'rear']) {
    const step = ibdGuideStep(game), path = ibdGuideReturnRoute(game, step);
    assert.equal(step.action.kind, kind); assert.equal(step.action.slot, 'coil-rear');
    assert.match(step.hint.zh, /南端开口/); assert.match(step.hint.en, /south opening/);
    const pending = requestIbdYardAction(game, step.action, actor(game, step.action.station));
    assert.deepEqual(ibdGuideStep(pending).hint, step.hint, 'the same approach/retreat instruction remains during the operation');
    assert.ok(path[1][2] > 0 && path[2][2] > 0, 'cross the guard line only beyond its open south end');
    assert.ok(path[0][2] < path[1][2], 'first return south instead of walking sideways through the guard');
    if (kind === 'turn') {
      assert.match(step.hint.zh, /操作台外侧/); assert.match(step.hint.en, /outer side/);
      assert.ok(path[0][0] < -9.5 && path.at(-1)[0] > -9.5);
    } else assert.ok(path[0][0] > -9.5 && path.at(-1)[0] < -9.5);
    game = act(game, step.action);
    if (kind === 'turn') assert.match(ibdGuideResult(game).zh, /南端开口/);
  }
  assert.equal(ibdGuideReturnRoute(game).length, 0, 'subsequent pack work keeps its existing route');
});

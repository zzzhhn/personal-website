import assert from 'node:assert/strict';
import { CHROME, loadPlaywright } from '../playtest/lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4343';
const expectedShape = process.argv.includes('--legacy') ? 'convexpolyhedron' : 'trimesh';
const browser = await loadPlaywright().chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.routeWebSocket('**/*', ws => ws.close());
  await page.goto(new URL('/world/?start=town&qa=1', base).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__worldDebug?.state().ready && window.__worldTown?.stats().boards === 6, undefined, { timeout: 60_000 });
  const inspection = await page.evaluate(() => ({
    stats: window.__worldTown.stats(),
    boards: window.__worldDebug.physicsInventory().filter(item => item.assetId === 'T09')
      .map(item => ({ name: item.visualRef, shape: item.shape, bounds: item.aabb })),
  }));
  assert.equal(inspection.boards.length, 6);
  assert.ok(inspection.boards.every(board => board.shape === expectedShape));
  const placements = inspection.boards.map(({ name, bounds }) => ({
    name, position: [bounds.max[0] + 1.2, 2.02, (bounds.min[2] + bounds.max[2]) / 2],
  }));
  const cards = [];
  for (const [slot, placement] of placements.entries()) {
    // Placement is a QA fixture. Contact, prompt selection and E go through the normal actor.
    assert.equal(await page.evaluate(position => window.__worldDebug.teleportPlayer(position), placement.position), true);
    await page.waitForFunction(slot => window.__worldDebug.snapshot().grounded && window.__worldDebug.state().nearbyInteract?.id === 'town-board-' + slot,
      slot, { timeout: 12_000 });
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__worldDebug.state().card?.kind === 'experience', undefined, { timeout: 8_000 });
    cards.push({ board: placement.name, experience: await page.evaluate(() => window.__worldDebug.state().card.id) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__worldDebug.state().card);
  }
  assert.equal(new Set(cards.map(card => card.experience)).size, 6);
  console.log(JSON.stringify({ ...inspection, cards }));
} finally { await browser.close(); }

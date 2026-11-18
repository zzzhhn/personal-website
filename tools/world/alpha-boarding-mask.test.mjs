import test from 'node:test';
import assert from 'node:assert/strict';
import { alphaTransportBoardingFootprints } from '../../src/components/world/alpha-island/transports/alpha-routes.ts';

test('the island material initializes and masks every boarding strip, including the ferry', async () => {
  const strips = alphaTransportBoardingFootprints(true);
  const { alphaBoardUniforms, alphaBoardMaskHead, alphaBoardMaskFragment } = await import('../../src/components/world/alpha-island/alpha-boarding-mask.ts');
  const capacity = alphaBoardUniforms.uAlphaBoardLines.value.length;
  assert.ok(capacity >= strips.length);
  assert.ok(alphaBoardMaskHead.includes(`uAlphaBoardLines[${capacity}]`));
  assert.ok(alphaBoardMaskFragment.includes(`abi<${capacity}`));
  for (const [i, { a, b, halfWidth }] of strips.entries()) {
    assert.deepEqual(alphaBoardUniforms.uAlphaBoardLines.value[i].toArray(), [a[0], a[2], b[0], b[2]]);
    assert.deepEqual(alphaBoardUniforms.uAlphaBoardHeights.value[i].toArray(), [a[1], b[1]]);
    assert.equal(alphaBoardUniforms.uAlphaBoardWidths.value[i], Math.fround(halfWidth));
  }
});

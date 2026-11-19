import test from 'node:test';
import assert from 'node:assert/strict';
import { configureWorldShaderDiagnostics } from '../../../src/components/world/performance-render-policy.ts';

test('only ordinary production startup disables the existing driver diagnostics', () => {
  for (const initial of [false, true]) {
    for (const development of [false, true]) {
      for (const search of ['', '?qa=1', '?shaderDebug=1', '?qa=1&shaderDebug']) {
        const debug = {checkShaderErrors: initial};
        configureWorldShaderDiagnostics(debug, development, search);
        const expected = (development || search.includes('shaderDebug')) && initial;
        assert.equal(debug.checkShaderErrors, expected, JSON.stringify({initial, development, search}));
      }
    }
  }
});

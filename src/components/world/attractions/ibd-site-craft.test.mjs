import test from 'node:test';
import assert from 'node:assert/strict';
import { Builder } from '../WorldStreetGeometry.ts';
import { addIbdPlant } from './ibd-site-craft.ts';

test('planted stems and leaves export finite material attributes at varied scales', () => {
  for (const [seed, scale] of [[0, .65], [2, 1], [7, 1.4]]) {
    const builder = new Builder();
    addIbdPlant(builder, [3, 1, -2], seed, scale);
    const geometry = builder.build();
    try {
      const material = geometry.getAttribute('aMat');
      assert.equal(material.count, geometry.getAttribute('position').count);
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        assert.ok(attribute.array.every(Number.isFinite), `${name} contains non-finite values`);
      }
      for (let i = 0; i < material.count; i++) {
        assert.equal(material.getY(i), 0, 'plant surfaces are nonmetallic');
      }
    } finally {
      geometry.dispose();
    }
  }
});

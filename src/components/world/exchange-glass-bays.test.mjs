import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlphaExchangeGeometry } from './WorldAlphaExchangeGeometry.ts';
import { exchangeGlassBays } from './exchange-glass-bays.ts';
test('real window bays have independent depth bounds without copying vertex buffers',()=>{
  const built=buildAlphaExchangeGeometry(),bays=exchangeGlassBays(built.glass,built.glassRanges);
  try{
    assert.ok(bays.length>1&&bays.length<=12,`window draw count ${bays.length}`);
    assert.equal(bays.reduce((n,g)=>n+g.drawRange.count,0),built.glass.getAttribute('position').count);
    assert.ok(new Set(bays.map(g=>g.boundingSphere.center.toArray().join(','))).size>1);
    for(const g of bays){
      assert.equal(g.getAttribute('position'),built.glass.getAttribute('position'));
      assert.ok(g.boundingBox.max.x-g.boundingBox.min.x<.2,'one thin wall per sorting object');
      assert.ok(g.boundingSphere.radius<8,'bounds must belong to one bay rather than the entire hall');
    }
  }finally{bays.forEach(g=>g.dispose());built.body.dispose();built.glass.dispose();}
});

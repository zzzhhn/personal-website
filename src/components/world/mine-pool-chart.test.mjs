import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poolDomain, poolPoint, poolDateIndex, POOL_INK } from './mine-pool-chart.ts';

const curve=[{date:'2025-01-02',nav:1,benchmark:1},{date:'2025-01-03',nav:.81,benchmark:1.1},{date:'2025-01-06',nav:1.12,benchmark:1.3}];
test('pool comparison includes both real series and NAV one with margin, even flat or empty',()=>{
  const bounds=poolDomain([curve,[{date:'2025-01-02',nav:.65,benchmark:1.5}]]);
  assert.ok(bounds[0]<.65&&bounds[1]>1.5);
  for(const data of [[],[[{date:'2025-01-02',nav:1,benchmark:1}]]]){const [a,b]=poolDomain(data);assert.ok(a<1&&b>1);}
  assert.equal(poolPoint(curve,0,'nav',bounds).x,0);assert.equal(poolPoint(curve,2,'nav',bounds).x,1);
  assert.ok(poolPoint(curve,1,'nav',bounds).y<poolPoint(curve,1,'benchmark',bounds).y);
});
test('scrubbing missing days uses an actual preceding observation, clamps endpoints and never interpolates',()=>{
  assert.equal(poolDateIndex(curve,'2025-01-01'),0);
  assert.equal(poolDateIndex(curve,'2025-01-03'),1);
  assert.equal(poolDateIndex(curve,'2025-01-05'),1);
  assert.equal(poolDateIndex(curve,'2025-01-09'),2);
});
test('emitted factor inks exceed text contrast threshold on the fixed plot background',()=>{
  const lum=hex=>{const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  for(const color of Object.values(POOL_INK))assert.ok((lum(color)+.05)/(lum('#102a28')+.05)>4.5);
});

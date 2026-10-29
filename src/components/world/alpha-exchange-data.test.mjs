import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeArchiveCatalog, exchangeBenchmarkHistory } from './alpha-exchange-data.ts';
const fixture=()=>({metadata:{acknowledgedParameters:{benchmark:'SPY'}},factor:{curve:Array.from({length:12},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,benchmark:1+i*.01,nav:99-i}))}});
test('uses only the real benchmark curve, preserving dates and normalizing NAV to 100',()=>{
  const p=fixture(),a=exchangeBenchmarkHistory(p);assert.equal(a[0].value,100);assert.ok(Math.abs(a[11].value-111)<1e-10);
  assert.equal(a[11].date,'2026-01-12');assert.equal('nav' in a[0],false);p.factor.curve[1].nav=1e99;assert.deepEqual(a,exchangeBenchmarkHistory(p));
});
test('rejects wrong benchmark, malformed dates, nonpositive or unordered NAV without fabricated fallback',()=>{
  for(const mutate of [p=>p.metadata.acknowledgedParameters.benchmark='QQQ',p=>p.factor.curve.length=2,
    p=>p.factor.curve[1].date='2026-02-30',p=>p.factor.curve[1].date='2026-01-01',p=>p.factor.curve[1].benchmark=NaN,
    p=>p.factor.curve[1].benchmark=0,p=>p.factor.curve[0].benchmark=2]){
    const p=fixture();mutate(p);assert.throws(()=>exchangeBenchmarkHistory(p));
  }
});

const yearDays = (year, count = 20, base = 100) => Array.from({ length: count }, (_, i) => ({
  date: new Date(Date.UTC(year, 0, i + 1)).toISOString().slice(0, 10), value: base + i,
}));

test('archive tickets preserve actual partial-year coverage and rebase each dated series to NAV 100', () => {
  const source = [...yearDays(2023, 20), ...yearDays(2024, 20, 200), ...yearDays(2025, 19, 300)];
  const catalog = exchangeArchiveCatalog(source);
  assert.deepEqual(catalog.map(({ id, label }) => [id, label]), [['full', 'SPY'], ['year-2023', '2023'], ['year-2024', '2024']]);
  assert.deepEqual(catalog[0].history, source);
  assert.equal(catalog[1].history[0].date, '2023-01-01');
  assert.equal(catalog[1].history.at(-1).date, '2023-01-20');
  assert.deepEqual(catalog[2].history, yearDays(2024, 20, 200).map(row => ({ date: row.date, value: row.value / 200 * 100 })));
  assert.ok(catalog.every(ticket => ticket.history[0].value === 100));
  assert.deepEqual(exchangeArchiveCatalog(yearDays(2026, 10)).map(ticket => ticket.id), ['full']);
});

test('archive catalogs contain full history and at most the four most recent eligible years', () => {
  const source = Array.from({ length: 7 }, (_, i) => yearDays(2019 + i, i === 6 ? 19 : 20, 100 + i * 100)).flat();
  const catalog = exchangeArchiveCatalog(source);
  assert.equal(catalog.length, 5);
  assert.deepEqual(catalog.map(ticket => ticket.id), ['full', 'year-2021', 'year-2022', 'year-2023', 'year-2024']);
  assert.equal(catalog[0].history.length, source.length);
});

test('ticket histories are independent clones and identities use every original dated NAV', () => {
  const source = [...yearDays(2023), ...yearDays(2024, 20, 200)], snapshot = structuredClone(source);
  const catalog = exchangeArchiveCatalog(source);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(catalog.map(ticket => ticket.identity), exchangeArchiveCatalog(snapshot).map(ticket => ticket.identity));
  const changed = structuredClone(source); changed[30].value += .1;
  const other = exchangeArchiveCatalog(changed);
  assert.notEqual(catalog[0].identity, other[0].identity);
  assert.equal(catalog[1].identity, other[1].identity);
  assert.notEqual(catalog[2].identity, other[2].identity);
  const scaled = source.map(row => row.date.startsWith('2024') ? { ...row, value: row.value * 2 } : { ...row });
  const proportional = exchangeArchiveCatalog(scaled);
  assert.deepEqual(catalog[2].history, proportional[2].history);
  assert.notEqual(catalog[2].identity, proportional[2].identity);
  source[0].value = 0;
  assert.equal(catalog[0].history[0].value, 100);
  catalog[0].history[0].value = 99;
  assert.equal(catalog[1].history[0].value, 100);
  catalog[2].history[0].value = 1;
  assert.equal(source[20].value, 200);
});

test('archive catalog rejects invalid, unnormalized or unsupported history without substitute tickets', () => {
  for (const source of [null, [], yearDays(2026, 9), yearDays(2026, 10, 101), yearDays(2026).reverse(),
    [...yearDays(2026), ...yearDays(2026)], Array(10),
    yearDays(2026).map((row, i) => i === 1 ? { ...row, date: '2026-02-30' } : row),
    ...[0, -1, NaN, Infinity, 1e8 + 1, '101'].map(value => yearDays(2026).map((row, i) => i === 1 ? { ...row, value } : row)),
    Array.from({ length: 10001 }, () => ({ date: '2026-01-01', value: 100 })),
    [...yearDays(2025), ...yearDays(2026, 20, 200).map((row, i) => i === 0 ? { ...row, value: 1e-300 } : row)],
  ]) assert.throws(() => exchangeArchiveCatalog(source));
});

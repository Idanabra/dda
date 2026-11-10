import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameScore, CatalogIndex, matchReceipt, normalize } from '../src/matcher.js';
import { compareCarts } from '../src/cart.js';

test('normalizes units and Hebrew final letters', () => {
  assert.equal(normalize('קוטג׳ 5% 250 גר'), 'קוטג 5pct 250g');
  assert.equal(normalize('שמן 1 ליטר'), 'שמנ 1000ml');
});

test('name scoring prefers same size', () => {
  const a = nameScore('קוטג 5% 250 גר', 'קוטג 5% 250 גרם');
  const b = nameScore('קוטג 5% 250 גר', 'קוטג 5% 500 גרם');
  assert.ok(a > 0.9, `same size ${a}`);
  assert.ok(b < a);
});

const catalog = (items) => ({ items: Object.fromEntries(items.map(([c, n, p]) => [c, { name: n, price: p }])) });

test('matches by barcode, name, and cross-referenced barcode', () => {
  const indexes = {
    a: new CatalogIndex(catalog([['7290000000111', 'חלב 3% 1 ליטר', 6], ['7290000000222', 'לחם אחיד פרוס', 7]])),
    b: new CatalogIndex(catalog([['7290000000111', 'חלב תנובה 3%', 6.5], ['7290000000222', 'לחם לבן', 7.2]])),
  };
  const items = [
    { name: 'חלב', barcode: '7290000000111', quantity: 2 },
    { name: 'לחם אחיד פרוס', barcode: null, quantity: 1 },
    { name: 'משהו אחר לגמרי', barcode: null, quantity: 1, line_total: 10 },
  ];
  const m = matchReceipt(items, indexes);
  assert.equal(m[0].a.method, 'barcode');
  assert.equal(m[1].a.method, 'name');
  assert.equal(m[1].b.method, 'barcode-crossref');
  assert.equal(m[2].a, null);

  const r = compareCarts(items, m, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  assert.equal(r.bestChainId, 'a');
  const a = r.carts.find((c) => c.chainId === 'a');
  assert.equal(a.foundTotal, 19); // 2*6 + 7
  assert.equal(a.estimatedTotal, 29); // + receipt price for missing item
  assert.equal(r.commonCount, 2);
});

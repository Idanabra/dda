import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupReceipt, LookupCache } from '../src/lookup.js';
import { compareCarts } from '../src/cart.js';

const store = (id, products, { fail = false } = {}) => {
  const calls = [];
  return {
    id, name: id, branch: '1', calls,
    async searchBarcode(bc) {
      calls.push(['barcode', bc]);
      if (fail) throw new Error('HTTP 403');
      return products.filter((p) => p.barcode === bc);
    },
    async searchName(q) {
      calls.push(['name', q]);
      if (fail) throw new Error('HTTP 403');
      return products.filter((p) => p.name.split(' ')[0] === q.split(' ')[0]);
    },
  };
};
const P = (barcode, name, price) => ({ barcode, name, price, isWeighted: false });
const memCache = () => new LookupCache('/dev/null', { persist: false });

test('barcode, name and cross-referenced barcode matches', async () => {
  const a = store('a', [P('7290000000111', 'חלב 3% 1 ליטר', 6), P('7290000000222', 'לחם אחיד פרוס', 7)]);
  const b = store('b', [P('7290000000111', 'חלב תנובה 3%', 6.5), P('7290000000222', 'לחם לבן', 7.2)]);
  const items = [
    { name: 'חלב', barcode: '7290000000111', quantity: 2 },
    { name: 'לחם אחיד פרוס', barcode: null, quantity: 1 },
    { name: 'משהו אחר לגמרי', barcode: null, quantity: 1, line_total: 10 },
  ];
  const { matches, status } = await lookupReceipt(items, [a, b], memCache());
  assert.equal(matches[0].a.method, 'barcode');
  assert.equal(matches[1].a.method, 'name');
  assert.equal(matches[1].b.method, 'barcode-crossref'); // "לחם לבן" too weak by name; found via a's barcode
  assert.equal(matches[2].a, null);
  assert.equal(status.a.error, null);

  const r = compareCarts(items, matches, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  assert.equal(r.bestChainId, 'a');
  const ca = r.carts.find((c) => c.chainId === 'a');
  assert.equal(ca.foundTotal, 19);
  assert.equal(ca.estimatedTotal, 29);
});

test('a blocked store is reported and does not break the others', async () => {
  const ok = store('ok', [P('7290000000111', 'חלב', 6)]);
  const bad = store('bad', [], { fail: true });
  const { matches, status } = await lookupReceipt([{ name: 'חלב', barcode: '7290000000111', quantity: 1 }], [ok, bad], memCache());
  assert.equal(matches[0].ok.price, 6);
  assert.equal(matches[0].bad, null);
  assert.match(status.bad.error, /403/);
});

test('results are cached between receipts', async () => {
  const a = store('a', [P('7290000000111', 'חלב', 6)]);
  const cache = memCache();
  const items = [{ name: 'חלב', barcode: '7290000000111', quantity: 1 }];
  await lookupReceipt(items, [a], cache);
  const n = a.calls.length;
  await lookupReceipt(items, [a], cache);
  assert.equal(a.calls.length, n);
});

test('sale prices are used only when enabled', () => {
  const items = [{ name: 'x', quantity: 2 }];
  const matches = [{ a: { price: 10, salePrice: 8 } }];
  assert.equal(compareCarts(items, matches, [{ id: 'a' }]).carts[0].foundTotal, 20);
  assert.equal(compareCarts(items, matches, [{ id: 'a' }], { useSalePrices: true }).carts[0].foundTotal, 16);
});

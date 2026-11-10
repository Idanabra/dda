import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ramiLevySource } from '../src/sources/ramiLevy.js';
import { zuzSource, barcodeOf } from '../src/sources/zuz.js';

// Local stand-ins for the store APIs, returning the response shapes the real sites use.
let server;
let base;
const seen = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      seen.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/api/catalog') {
        const { q } = JSON.parse(body);
        return res.end(JSON.stringify({
          status: 200,
          data: q === '7290004127329' || q.includes('קוטג')
            ? [{ id: 9360, name: 'קוטג 5% 250 גרם', barcode: 7290004127329, price: { price: 5.9 }, prop: { by_kilo: 0 } }]
            : [],
        }));
      }
      if (url.pathname === '/blocked/v2/retailers/1/branches/2/products') {
        res.statusCode = 403;
        return res.end('<html>blocked</html>');
      }
      if (url.pathname.startsWith('/v2/retailers/1470/')) {
        const q = url.searchParams.get('q');
        const filters = url.searchParams.get('filters');
        if (filters) return res.end(JSON.stringify({ total: 0, products: [] })); // platform ignores/doesn't support it
        const products = q === '7290004127329' || q?.includes('קוטג')
          ? [
              { productId: 1, names: { 1: { long: 'קוטג 5% 250 גרם' } }, image: { url: 'https://cdn/x/7290004127329-555/{{size}}.jpg' },
                branch: { regularPrice: 6.4, salePrice: 5.5, isActive: true, isVisible: true } },
              { productId: 2, names: { 1: { long: 'קוטג 9% 250 גרם' } }, image: { url: 'https://cdn/x/7290004127336-556/{{size}}.jpg' },
                branch: { regularPrice: 6.9, salePrice: null, isActive: true, isVisible: true } },
            ]
          : [];
        return res.end(JSON.stringify({ total: products.length, products }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Rami Levy: posts {q, store, aggs} and maps the response', async () => {
  const src = ramiLevySource({ storeId: '331', baseUrl: base });
  const [p] = await src.searchBarcode('7290004127329');
  assert.deepEqual(JSON.parse(seen.at(-1).body), { q: '7290004127329', store: '331', aggs: 1 });
  assert.equal(p.barcode, '7290004127329');
  assert.equal(p.price, 5.9);
  assert.equal(p.name, 'קוטג 5% 250 גרם');
});

test('ZuZ platform: barcode search verifies the barcode from the image URL', async () => {
  const src = zuzSource({ id: 'victory', name: 'ויקטורי', baseUrl: base, retailerId: 1470, branchId: 2930 });
  const hits = await src.searchBarcode('7290004127329');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, 'קוטג 5% 250 גרם');
  assert.equal(hits[0].price, 6.4);
  assert.equal(hits[0].salePrice, 5.5);
  assert.ok(seen.some((r) => r.path === '/v2/retailers/1470/branches/2930/products' && r.query.q === '7290004127329'));
  assert.equal((await src.searchName('קוטג')).length, 2);
});

test('ZuZ platform: blocked site surfaces a helpful error', async () => {
  const src = zuzSource({ id: 'x', baseUrl: `${base}/blocked`, retailerId: 1, branchId: 2 });
  await assert.rejects(src.searchName('חלב'), /403|404/);
});

test('barcodeOf reads explicit fields and image URLs', () => {
  assert.equal(barcodeOf({ barcode: '7290000000011' }), '7290000000011');
  assert.equal(barcodeOf({ image: { url: 'https://cdn/gs1-products/1540/medium/7290000066882-12345/a.jpg' } }), '7290000066882');
  assert.equal(barcodeOf({ image: { url: 'https://cdn/no-code.jpg' } }), null);
});

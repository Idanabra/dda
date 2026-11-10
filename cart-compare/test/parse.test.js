import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parsePriceFile, parseFileName } from '../src/feeds/parse.js';
import { extractLinks, pickLatestPriceFull } from '../src/feeds/fetchers.js';

test('parses Items/Item dialect from gzip', () => {
  const xml = `<?xml version="1.0"?><Root><ChainId>7290058140886</ChainId><StoreId>39</StoreId><Items>
    <Item><ItemCode>7290000000011</ItemCode><ItemName>חלב 3%</ItemName><ItemPrice>6.90</ItemPrice><bIsWeighted>0</bIsWeighted></Item>
    <Item><ItemCode>123</ItemCode><ItemName>עגבניות</ItemName><ItemPrice>5.9</ItemPrice><bIsWeighted>1</bIsWeighted></Item>
  </Items></Root>`;
  const out = parsePriceFile(gzipSync(Buffer.from(xml)));
  assert.equal(out.chainCode, '7290058140886');
  assert.equal(out.storeId, '39');
  assert.equal(out.items['7290000000011'].price, 6.9);
  assert.equal(out.items['123'].isWeighted, true);
});

test('parses Products/Product dialect with lowercase tags and ItemNm', () => {
  const xml = `<Prices><ChainID>1</ChainID><StoreID>2</StoreID><Products>
    <Product><itemcode>0007290000000028</itemcode><itemnm>לחם</itemnm><itemprice>7.5</itemprice></Product>
  </Products></Prices>`;
  const out = parsePriceFile(Buffer.from(xml));
  assert.equal(out.items['7290000000028'].name, 'לחם');
});

test('parses UTF-16 files', () => {
  const xml = '<root><Items><Item><ItemCode>5</ItemCode><ItemName>במבה</ItemName><ItemPrice>4.9</ItemPrice></Item></Items></root>';
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
  assert.equal(parsePriceFile(buf).items['5'].name, 'במבה');
});

test('file name metadata and latest-file selection', () => {
  assert.deepEqual(parseFileName('PriceFull7290058140886-039-202611100300.gz'),
    { chainCode: '7290058140886', storeId: '039', stamp: '202611100300' });
  const html = `<a href="/files/PriceFull7290058140886-002-202611090300.gz">a</a>
    <a href='files/PriceFull7290058140886-001-202611100300.gz'>b</a>
    <a href="/files/PriceFull7290058140886-001-202611090300.gz">c</a>
    <a href="/files/Promo7290058140886-001-202611100300.gz">d</a>`;
  const links = extractLinks(html, 'https://example.com/list/');
  assert.equal(links.length, 3);
  assert.equal(pickLatestPriceFull(links).url, 'https://example.com/list/files/PriceFull7290058140886-001-202611100300.gz');
  assert.equal(pickLatestPriceFull(links, { storeId: '2' }).name, 'PriceFull7290058140886-002-202611090300.gz');
});

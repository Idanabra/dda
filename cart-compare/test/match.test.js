import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameScore, normalize, bestByName } from '../src/matcher.js';

test('normalizes units and Hebrew final letters', () => {
  assert.equal(normalize('קוטג׳ 5% 250 גר'), 'קוטג 5pct 250g');
  assert.equal(normalize('שמן 1 ליטר'), 'שמנ 1000ml');
  assert.equal(normalize('פסטה 500 ג'), 'פסטה 500g');
});

test('name scoring prefers same size', () => {
  const a = nameScore('קוטג 5% 250 גר', 'קוטג 5% 250 גרם');
  const b = nameScore('קוטג 5% 250 גר', 'קוטג 5% 500 גרם');
  assert.ok(a > 0.9, `same size ${a}`);
  assert.ok(b < a);
});

test('bestByName picks the closest and rejects weak matches', () => {
  const products = [{ name: 'קוטג 5% 500 גרם' }, { name: 'קוטג 5% 250 גרם' }, { name: 'חלב 3%' }];
  assert.equal(bestByName('קוטג 250 גר', products).product.name, 'קוטג 5% 250 גרם');
  assert.equal(bestByName('אבקת כביסה', products), null);
});

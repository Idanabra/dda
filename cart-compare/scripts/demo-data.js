// Synthetic demo catalogs (NOT real prices) so the app can be tried without network access.
// Each chain gets a slightly different price multiplier, name spelling and a few gaps.

export const DEMO_PRODUCTS = [
  ['7290000000011', 'חלב 3% שומן 1 ליטר בקרטון', 6.9],
  ['7290000000028', 'לחם אחיד פרוס', 7.5],
  ['7290000000035', 'ביצים L 12 יחידות', 13.9],
  ['7290000000042', 'גבינה לבנה 5% 250 גרם', 5.9],
  ['7290000000059', 'קוטג 5% 250 גרם', 6.2],
  ['7290000000066', 'יוגורט טבעי 3% 200 גרם', 3.4],
  ['7290000000073', 'חמאה 200 גרם', 9.9],
  ['7290000000080', 'שמן קנולה 1 ליטר', 11.9],
  ['7290000000097', 'אורז פרסי 1 ק"ג', 9.5],
  ['7290000000103', 'פסטה פנה 500 גרם', 5.5],
  ['7290000000110', 'רסק עגבניות 100 גרם', 2.4],
  ['7290000000127', 'טונה בשמן 160 גרם', 7.2],
  ['7290000000134', 'קפה נמס 200 גרם', 29.9],
  ['7290000000141', 'תה ירוק 25 שקיקים', 12.9],
  ['7290000000158', 'סוכר לבן 1 ק"ג', 5.2],
  ['7290000000165', 'קמח לבן 1 ק"ג', 4.9],
  ['7290000000172', 'שוקולד חלב 100 גרם', 6.5],
  ['7290000000189', 'במבה 80 גרם', 4.9],
  ['7290000000196', 'מים מינרליים 1.5 ליטר', 3.2],
  ['7290000000202', 'קולה 1.5 ליטר', 7.9],
  ['7290000000219', 'נייר טואלט 32 גלילים', 39.9],
  ['7290000000226', 'אבקת כביסה 4 ק"ג', 44.9],
  ['7290000000233', 'נוזל כלים 1 ליטר', 8.9],
  ['7290000000240', 'עגבניות', 6.9, true],
  ['7290000000257', 'מלפפונים', 5.9, true],
  ['7290000000264', 'בננות', 7.9, true],
  ['7290000000271', 'חזה עוף טרי', 39.9, true],
  ['7290000000288', 'שניצל תירס קפוא 700 גרם', 24.9],
  ['7290000000295', 'חומוס 400 גרם', 8.5],
  ['7290000000301', 'פיתות 10 יחידות', 8.9],
];

const CHAIN_PROFILES = {
  rami_levy: { chainCode: '7290058140886', storeId: '001', factor: 0.93, skip: [13], seed: 1 },
  victory: { chainCode: '7290696200003', storeId: '002', factor: 0.97, skip: [20], seed: 2 },
  super_tal: { chainCode: '7290000000000', storeId: '001', factor: 1.04, skip: [], seed: 3 },
  carrefour: { chainCode: '7290055700007', storeId: '003', factor: 0.99, skip: [26, 9], seed: 4 },
};

function jitter(seed, i) {
  const x = Math.sin(seed * 1000 + i * 77) * 10000;
  return 0.94 + (x - Math.floor(x)) * 0.12; // 0.94 .. 1.06
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function demoPriceXml(chainId) {
  const p = CHAIN_PROFILES[chainId];
  const items = DEMO_PRODUCTS.map(([code, name, price, weighted], i) => {
    if (p.skip.includes(i)) return '';
    const v = (Math.round(price * p.factor * jitter(p.seed, i) * 10) / 10 - 0.01).toFixed(2);
    return `<Item><ItemCode>${code}</ItemCode><ItemName>${esc(name)}</ItemName><ItemPrice>${v}</ItemPrice>` +
      `<bIsWeighted>${weighted ? 1 : 0}</bIsWeighted><UnitQty>${weighted ? 'קילו' : 'יחידה'}</UnitQty></Item>`;
  }).join('');
  return `<?xml version="1.0" encoding="utf-8"?><Root><ChainId>${p.chainCode}</ChainId><StoreId>${p.storeId}</StoreId><Items>${items}</Items></Root>`;
}

/** A sample receipt (as Claude would return it) for trying the UI without an API key. */
export const DEMO_RECEIPT = {
  store_name: 'דוגמה',
  date: null,
  total: 128.4,
  items: [
    { name: 'חלב 3% 1 ל קרטון', barcode: '7290000000011', quantity: 2, unit_price: 7.1, line_total: 14.2, is_weighted: false },
    { name: 'לחם אחיד פרוס', barcode: null, quantity: 1, unit_price: 7.9, line_total: 7.9, is_weighted: false },
    { name: 'ביצים L 12', barcode: null, quantity: 1, unit_price: 14.5, line_total: 14.5, is_weighted: false },
    { name: 'קוטג׳ 5% 250 גר', barcode: null, quantity: 3, unit_price: 6.5, line_total: 19.5, is_weighted: false },
    { name: 'פסטה פנה 500 ג', barcode: '7290000000103', quantity: 2, unit_price: 5.9, line_total: 11.8, is_weighted: false },
    { name: 'קפה נמס 200 גר', barcode: null, quantity: 1, unit_price: 31.9, line_total: 31.9, is_weighted: false },
    { name: 'עגבניות', barcode: null, quantity: 1.2, unit_price: 7.9, line_total: 9.48, is_weighted: true },
    { name: 'בננות', barcode: null, quantity: 0.9, unit_price: 8.9, line_total: 8.01, is_weighted: true },
    { name: 'במבה 80 גרם', barcode: '7290000000189', quantity: 2, unit_price: 5.5, line_total: 11.0, is_weighted: false },
  ],
};

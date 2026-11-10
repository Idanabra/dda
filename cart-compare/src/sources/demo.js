// Offline stand-in for the store websites (DEMO=1). Prices are FAKE.
import { DEMO_PRODUCTS, demoPrice, DEMO_CHAINS } from '../../scripts/demo-data.js';
import { nameScore } from '../matcher.js';

export function demoSource(id) {
  const meta = DEMO_CHAINS[id];
  const catalog = DEMO_PRODUCTS.map(([barcode, name, base, weighted], i) => {
    const price = demoPrice(id, i, base);
    return price && { barcode, name, price, salePrice: null, isWeighted: Boolean(weighted), url: null };
  }).filter(Boolean);
  return {
    id,
    name: meta.name,
    nameEn: meta.nameEn,
    branch: 'demo',
    demo: true,
    async searchBarcode(bc) {
      return catalog.filter((p) => p.barcode === bc);
    },
    async searchName(q) {
      return catalog.filter((p) => nameScore(q, p.name) > 0.3);
    },
  };
}

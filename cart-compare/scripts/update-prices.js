// Download the latest PriceFull file for each chain. Usage: npm run update-prices [chainId]
import { getChains } from '../src/chains.js';
import { PriceStore } from '../src/store.js';

const only = process.argv[2];
const store = new PriceStore();
let failed = 0;
for (const c of getChains().filter((c) => !only || c.id === only)) {
  try {
    const cat = await store.refresh(c);
    console.log(`✓ ${c.nameEn}: ${cat.itemCount} items (store ${cat.storeId}, ${cat.fileName})`);
  } catch (e) {
    failed++;
    console.error(`✗ ${c.nameEn}: ${e.message}`);
  }
}
process.exitCode = failed ? 1 : 0;

// Import a PriceFull file you downloaded yourself. Usage: npm run import-prices <chainId> <file>
import fs from 'node:fs';
import path from 'node:path';
import { CHAINS } from '../src/chains.js';
import { PriceStore } from '../src/store.js';

const [chainId, file] = process.argv.slice(2);
if (!chainId || !file || !CHAINS.some((c) => c.id === chainId)) {
  console.error(`Usage: npm run import-prices <${CHAINS.map((c) => c.id).join('|')}> <PriceFull file>`);
  process.exit(1);
}
const cat = new PriceStore().importBuffer(chainId, fs.readFileSync(file), { fileName: path.basename(file), source: 'upload' });
console.log(`Imported ${cat.itemCount} items for ${chainId} (store ${cat.storeId})`);

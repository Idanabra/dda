// Load synthetic demo price lists for all four chains (offline demo).
import { CHAINS } from '../src/chains.js';
import { PriceStore } from '../src/store.js';
import { demoPriceXml } from './demo-data.js';

const store = new PriceStore();
for (const c of CHAINS) {
  const cat = store.importBuffer(c.id, Buffer.from(demoPriceXml(c.id)), { fileName: 'demo.xml', source: 'demo' });
  console.log(`${c.nameEn}: ${cat.itemCount} demo items`);
}
console.log('Demo prices loaded. These are NOT real prices.');

// Checks that each store's website answers barcode and name searches from this machine.
// Usage: npm run check-stores [barcode] [name]
import { getSources } from '../src/sources/index.js';

const barcode = process.argv[2] ?? '7290004127329'; // Tnuva cottage 5% 250g
const name = process.argv[3] ?? 'קוטג';
let failed = 0;
for (const s of getSources()) {
  if (s.disabled) {
    console.log(`- ${s.nameEn}: skipped (${s.disabled})`);
    continue;
  }
  for (const [kind, fn, q] of [['barcode', s.searchBarcode, barcode], ['name', s.searchName, name]]) {
    try {
      const res = await fn(q);
      const top = res[0];
      console.log(`${res.length ? '✓' : '?'} ${s.nameEn} ${kind} "${q}": ${res.length} result(s)` +
        (top ? ` — ${top.name} ₪${top.price}${top.barcode ? ` [${top.barcode}]` : ''}` : ''));
      if (!res.length) failed++;
    } catch (e) {
      failed++;
      console.log(`✗ ${s.nameEn} ${kind}: ${e.message}`);
    }
  }
}
process.exitCode = failed ? 1 : 0;

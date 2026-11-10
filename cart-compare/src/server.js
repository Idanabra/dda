import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSources } from './sources/index.js';
import { lookupReceipt, LookupCache } from './lookup.js';
import { compareCarts } from './cart.js';
import { extractReceipt } from './receipt.js';
import { DEMO_RECEIPT } from '../scripts/demo-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const sources = getSources();
const active = sources.filter((s) => !s.disabled);
const cache = new LookupCache();
const useSalePrices = process.env.PRICE_MODE === 'sale';

async function compare(items) {
  const { matches, status } = await lookupReceipt(items, active, cache);
  // Stores whose every request failed (blocked, down) are left out of the ranking.
  const answered = active.filter((s) => !status[s.id].error);
  const chains = sources.map((s) => ({
    id: s.id,
    name: s.name,
    nameEn: s.nameEn,
    branch: s.branch ?? null,
    demo: Boolean(s.demo),
    error: s.disabled ?? status[s.id]?.error ?? null,
  }));
  return { items, matches, chains, useSalePrices, ...compareCarts(items, matches, answered, { useSalePrices }) };
}

const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/chains', (_req, res) =>
  res.json(sources.map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn, branch: s.branch ?? null, demo: Boolean(s.demo), disabled: s.disabled ?? null }))));

// Upload a receipt → extract items with Claude → look up prices on each store's website.
app.post('/api/receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing receipt file' });
    if (!RECEIPT_TYPES.has(req.file.mimetype))
      return res.status(415).json({ error: `Unsupported file type ${req.file.mimetype}` });
    const receipt = await extractReceipt(req.file.buffer, req.file.mimetype);
    res.json({ receipt, ...(await compare(receipt.items)) });
  } catch (e) {
    console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Sample receipt for trying the app without an API key.
app.get('/api/demo-receipt', async (_req, res) => {
  try {
    res.json({ receipt: DEMO_RECEIPT, ...(await compare(DEMO_RECEIPT.items)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Re-run on edited items (user fixed a name/quantity in the UI).
app.post('/api/compare', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: 'Body must be { items: [...] }' });
  try {
    res.json(await compare(items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, () => {
    console.log(`Cart compare running on http://localhost:${port}`);
    for (const s of sources) console.log(`  ${s.nameEn}: ${s.disabled ? 'disabled – ' + s.disabled : `branch ${s.branch}${s.demo ? ' (DEMO prices)' : ''}`}`);
  });
}

export { app };

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChains } from './chains.js';
import { PriceStore } from './store.js';
import { CatalogIndex, matchReceipt } from './matcher.js';
import { compareCarts } from './cart.js';
import { extractReceipt } from './receipt.js';
import { DEMO_RECEIPT } from '../scripts/demo-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const chains = getChains();
const store = new PriceStore();

const indexCache = new Map();
function indexFor(chainId) {
  const cat = store.get(chainId);
  if (!cat) return null;
  const cached = indexCache.get(chainId);
  if (cached?.fetchedAt === cat.fetchedAt) return cached.index;
  const index = new CatalogIndex(cat);
  indexCache.set(chainId, { fetchedAt: cat.fetchedAt, index });
  return index;
}

function compare(items) {
  const loaded = chains.filter((c) => store.get(c.id));
  if (!loaded.length) {
    const err = new Error('No price data loaded yet. Refresh prices or import PriceFull files first.');
    err.status = 409;
    throw err;
  }
  const indexes = Object.fromEntries(loaded.map((c) => [c.id, indexFor(c.id)]));
  const matches = matchReceipt(items, indexes);
  return { items, matches, ...compareCarts(items, matches, loaded) };
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/chains', (_req, res) => res.json(store.status(chains)));

// Download the latest price file for one chain (or all with id=all).
app.post('/api/prices/:id/refresh', async (req, res) => {
  const targets = req.params.id === 'all' ? chains : chains.filter((c) => c.id === req.params.id);
  if (!targets.length) return res.status(404).json({ error: 'Unknown chain' });
  const results = await Promise.all(
    targets.map(async (c) => {
      try {
        const cat = await store.refresh(c);
        return { id: c.id, ok: true, itemCount: cat.itemCount, storeId: cat.storeId };
      } catch (e) {
        return { id: c.id, ok: false, error: e.message };
      }
    }),
  );
  res.json(results);
});

// Manually import a PriceFull .xml / .gz / .zip for a chain.
app.post('/api/prices/:id/import', upload.single('file'), (req, res) => {
  if (!chains.some((c) => c.id === req.params.id)) return res.status(404).json({ error: 'Unknown chain' });
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  try {
    const cat = store.importBuffer(req.params.id, req.file.buffer, { fileName: req.file.originalname, source: 'upload' });
    res.json({ ok: true, itemCount: cat.itemCount, storeId: cat.storeId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Upload a receipt → extract items with Claude → compare.
app.post('/api/receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing receipt file' });
    if (!IMAGE_TYPES.has(req.file.mimetype))
      return res.status(415).json({ error: `Unsupported file type ${req.file.mimetype}` });
    const receipt = await extractReceipt(req.file.buffer, req.file.mimetype);
    res.json({ receipt, ...compare(receipt.items) });
  } catch (e) {
    console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Sample receipt for trying the app without an API key.
app.get('/api/demo-receipt', (_req, res) => {
  try {
    res.json({ receipt: DEMO_RECEIPT, ...compare(DEMO_RECEIPT.items) });
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

// Re-run comparison on edited items (user fixed names/quantities in the UI).
app.post('/api/compare', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ error: 'Body must be { items: [...] }' });
    res.json(compare(items));
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`Cart compare running on http://localhost:${port}`));
}

export { app };

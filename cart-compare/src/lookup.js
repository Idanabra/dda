// Looks up every receipt line on every store's website:
//   1. barcode printed on the receipt → barcode search on the store
//   2. otherwise name search on the store, best fuzzy match
//   3. a confident match in one store gives a barcode to search in the others
// Results are cached (memory + data/cache.json) so repeated receipts are fast
// and we don't hit the retailers more than needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestByName, sameBarcode, CONFIDENT_NAME_SCORE } from './matcher.js';

const CACHE_FILE = process.env.CACHE_FILE ??
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cache.json');
const TTL_MS = Number(process.env.CACHE_HOURS ?? 12) * 3600_000;

export class LookupCache {
  constructor(file = CACHE_FILE, { persist = true } = {}) {
    this.file = file;
    this.persist = persist;
    this.map = new Map();
    if (persist && fs.existsSync(file)) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) this.map.set(k, v);
      } catch {
        /* corrupt cache: start fresh */
      }
    }
  }
  get(key) {
    const hit = this.map.get(key);
    return hit && Date.now() - hit.at < TTL_MS ? hit.value : undefined;
  }
  set(key, value) {
    this.map.set(key, { at: Date.now(), value });
    this.dirty = true;
  }
  flush() {
    if (!this.persist || !this.dirty) return;
    const now = Date.now();
    const live = Object.fromEntries([...this.map].filter(([, v]) => now - v.at < TTL_MS));
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(live));
    this.dirty = false;
  }
}

const cleanQuery = (name) => name.replace(/["'״׳*]/g, ' ').replace(/\s+/g, ' ').trim();

/** Wraps a source with caching and error capture. */
function cached(source, cache, errors) {
  const run = async (kind, q) => {
    const key = `${source.id}:${source.branch}:${kind}:${q}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    try {
      const res = kind === 'barcode' ? await source.searchBarcode(q) : await source.searchName(q);
      cache.set(key, res);
      errors.ok++;
      return res;
    } catch (e) {
      errors.failed++;
      errors.last = e.message;
      return null; // unknown (error), as opposed to [] (not found)
    }
  };
  return {
    barcode: async (bc) => (await run('barcode', bc))?.filter((p) => !p.barcode || sameBarcode(p.barcode, bc)) ?? null,
    name: (q) => run('name', cleanQuery(q)),
  };
}

const asMatch = (p, method, score) => ({
  code: p.barcode,
  name: p.name,
  price: p.price,
  salePrice: p.salePrice ?? null,
  isWeighted: p.isWeighted,
  url: p.url ?? null,
  method,
  score: Math.round(score * 100) / 100,
});

/**
 * @returns {{ matches: Array<Record<string, object|null>>, status: Record<string, {ok, failed, error}> }}
 */
export async function lookupReceipt(items, sources, cache = new LookupCache()) {
  const errors = Object.fromEntries(sources.map((s) => [s.id, { ok: 0, failed: 0, last: null }]));
  const api = Object.fromEntries(sources.map((s) => [s.id, cached(s, cache, errors[s.id])]));
  const ids = sources.map((s) => s.id);

  const matches = await Promise.all(
    items.map(async (it) => {
      const row = Object.fromEntries(ids.map((id) => [id, null]));

      // Pass 1: barcode, else name — all stores in parallel.
      await Promise.all(ids.map(async (id) => {
        if (it.barcode) {
          const hits = await api[id].barcode(it.barcode);
          if (hits?.length) return (row[id] = asMatch(hits[0], 'barcode', 1));
        }
        const results = await api[id].name(it.name);
        const best = results && bestByName(it.name, results);
        if (best) row[id] = asMatch(best.product, 'name', best.score);
      }));

      // Pass 2: confident matches lend their barcodes to the other stores.
      const borrowed = [...new Set(ids
        .map((id) => row[id])
        .filter((m) => m?.code && (m.method === 'barcode' || m.score >= CONFIDENT_NAME_SCORE))
        .map((m) => m.code))];
      await Promise.all(ids.map(async (id) => {
        if (row[id]?.method === 'barcode') return;
        for (const code of borrowed) {
          if (sameBarcode(row[id]?.code, code)) return; // already agrees
          const hits = await api[id].barcode(code);
          if (hits?.length) return (row[id] = asMatch(hits[0], 'barcode-crossref', 0.95));
        }
      }));
      return row;
    }),
  );
  cache.flush();

  const status = Object.fromEntries(ids.map((id) => {
    const e = errors[id];
    return [id, { ok: e.ok, failed: e.failed, error: e.failed && !e.ok ? e.last : null }];
  }));
  return { matches, status };
}

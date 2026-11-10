import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePriceFile } from './feeds/parse.js';
import { downloadPriceFile } from './feeds/fetchers.js';

const DATA_DIR = process.env.DATA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'prices');

/** Price catalogs for each chain, persisted as JSON in data/prices/<chain>.json */
export class PriceStore {
  constructor(dir = DATA_DIR) {
    this.dir = dir;
    this.catalogs = new Map();
    this.load();
  }
  load() {
    if (!fs.existsSync(this.dir)) return;
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const cat = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
      this.catalogs.set(cat.chainId, cat);
    }
  }
  get(chainId) {
    return this.catalogs.get(chainId) ?? null;
  }
  save(cat) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, `${cat.chainId}.json`), JSON.stringify(cat));
    this.catalogs.set(cat.chainId, cat);
    return cat;
  }
  /** Import a PriceFull file (xml/gz/zip bytes) for a chain. */
  importBuffer(chainId, buffer, { fileName = '', source = 'upload' } = {}) {
    const parsed = parsePriceFile(buffer);
    const count = Object.keys(parsed.items).length;
    if (!count) throw new Error('No items found in price file');
    return this.save({
      chainId,
      storeId: parsed.storeId,
      chainCode: parsed.chainCode,
      fileName,
      source,
      fetchedAt: new Date().toISOString(),
      itemCount: count,
      items: parsed.items,
    });
  }
  async refresh(chain) {
    const { name, buffer } = await downloadPriceFile(chain);
    return this.importBuffer(chain.id, buffer, { fileName: name, source: chain.source.type });
  }
  status(chains) {
    return chains.map((c) => {
      const cat = this.get(c.id);
      return {
        id: c.id,
        name: c.name,
        nameEn: c.nameEn,
        configured: Boolean(c.source),
        sourceType: c.source?.type ?? null,
        loaded: Boolean(cat),
        source: cat?.source ?? null,
        storeId: cat?.storeId ?? null,
        fileName: cat?.fileName ?? null,
        fetchedAt: cat?.fetchedAt ?? null,
        itemCount: cat?.itemCount ?? 0,
      };
    });
  }
}

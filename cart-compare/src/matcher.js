// Matches receipt lines to items in a chain's price catalog:
// 1) exact barcode, 2) fuzzy Hebrew/English name match, 3) barcode borrowed
// from a confident name match in another chain.

const NIQQUD = /[֑-ׇ]/g;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const STOP = new Set(['של', 'עם', 'ב', 'ו', 'את', 'יח', "יח'", 'מארז', 'the', 'and']);
const UNIT_ALIASES = [
  [/(\d+(?:\.\d+)?)\s*(?:ק"ג|קג|ק״ג|kg|קילו)/gi, (n) => `${Math.round(parseFloat(n) * 1000)}g`],
  [/(\d+(?:\.\d+)?)\s*(?:גרם|גר'|גר|ג'|ג|gr|g)(?!\p{L})/giu, (n) => `${Math.round(parseFloat(n))}g`],
  [/(\d+(?:\.\d+)?)\s*(?:ליטר|ל'|lt|l)(?!\p{L})/giu, (n) => `${Math.round(parseFloat(n) * 1000)}ml`],
  [/(\d+(?:\.\d+)?)\s*(?:מ"ל|מל|מ״ל|ml)/gi, (n) => `${Math.round(parseFloat(n))}ml`],
  [/(\d+(?:\.\d+)?)\s*%/g, (n) => `${parseFloat(n)}pct`],
];

export function normalize(text) {
  let s = String(text ?? '').toLowerCase().replace(NIQQUD, '');
  for (const [re, fn] of UNIT_ALIASES) s = s.replace(re, (_, n) => ` ${fn(n)} `);
  s = s.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
  s = s.replace(/["'״׳`]/g, '').replace(/[^\p{L}\p{N}.]+/gu, ' ');
  return s.trim();
}

export function tokenize(text) {
  return normalize(text).split(/\s+/).filter((t) => t && !STOP.has(t) && !/^\.+$/.test(t));
}

const isMeasure = (t) => /^\d+(?:\.\d+)?(?:g|ml|pct)$/.test(t);

function tokenSim(a, b) {
  if (a === b) return 1;
  if (isMeasure(a) || isMeasure(b)) return 0;
  // Receipts abbreviate ("שוקו" vs "שוקולד"): prefix match counts partially.
  if (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.5 ? 0.8 : 0.5;
  }
  return 0;
}

/** Similarity 0..1 between two product names. */
export function nameScore(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const wa = ta.filter((t) => !isMeasure(t));
  const wb = tb.filter((t) => !isMeasure(t));
  let hit = 0;
  const used = new Set();
  for (const x of wa) {
    let best = 0;
    let bi = -1;
    wb.forEach((y, i) => {
      if (used.has(i)) return;
      const s = tokenSim(x, y);
      if (s > best) [best, bi] = [s, i];
    });
    if (bi >= 0) used.add(bi);
    hit += best;
  }
  let score = wa.length && wb.length ? (2 * hit) / (wa.length + wb.length) : 0;
  // Sizes / fat % must agree when both sides state them.
  const ma = ta.filter(isMeasure);
  const mb = tb.filter(isMeasure);
  let agree = 0;
  let conflict = 0;
  for (const kind of ['g', 'ml', 'pct']) {
    const xa = ma.filter((m) => m.endsWith(kind) && !(kind === 'g' && m.endsWith('pct')));
    const xb = mb.filter((m) => m.endsWith(kind) && !(kind === 'g' && m.endsWith('pct')));
    if (!xa.length || !xb.length) continue;
    if (xa.some((m) => xb.includes(m))) agree++;
    else conflict++;
  }
  if (conflict) score *= 0.6;
  else if (agree) score *= 1.1;
  return Math.min(1, score);
}

export function barcodeVariants(code) {
  const c = String(code ?? '').replace(/\D/g, '');
  if (c.length < 4) return [];
  const stripped = c.replace(/^0+/, '');
  return [...new Set([c, stripped, stripped.padStart(13, '0'), stripped.padStart(12, '0')])];
}

/** Inverted index over a catalog so name lookups don't scan every item. */
export class CatalogIndex {
  constructor(catalog) {
    this.items = catalog?.items ?? {};
    this.byToken = new Map();
    this.byPrefix = new Map();
    for (const [code, item] of Object.entries(this.items)) {
      for (const t of new Set(tokenize(item.name))) {
        if (isMeasure(t)) continue;
        if (!this.byToken.has(t)) this.byToken.set(t, []);
        this.byToken.get(t).push(code);
        const p = t.slice(0, 3);
        if (p.length >= 2) {
          if (!this.byPrefix.has(p)) this.byPrefix.set(p, []);
          this.byPrefix.get(p).push(code);
        }
      }
    }
  }
  byBarcode(code) {
    for (const v of barcodeVariants(code)) if (this.items[v]) return { code: v, item: this.items[v] };
    return null;
  }
  searchName(name, limit = 3) {
    const counts = new Map();
    for (const t of tokenize(name)) {
      if (isMeasure(t)) continue;
      const list = this.byToken.get(t) ?? this.byPrefix.get(t.slice(0, 3)) ?? [];
      if (list.length > 5000) continue; // too generic to be useful
      for (const c of list) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const candidates = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 300);
    return candidates
      .map(([code]) => ({ code, item: this.items[code], score: nameScore(name, this.items[code].name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export const MIN_NAME_SCORE = 0.55;
const CONFIDENT = 0.8;

/**
 * Match every receipt item against every chain.
 * Returns matches[itemIndex][chainId] = { code, name, price, method, score } | null
 */
export function matchReceipt(receiptItems, indexes) {
  const chainIds = Object.keys(indexes);
  return receiptItems.map((ri) => {
    const row = {};
    const borrowed = new Set();
    // Pass 1: barcode printed on the receipt.
    for (const id of chainIds) {
      const hit = ri.barcode ? indexes[id].byBarcode(ri.barcode) : null;
      row[id] = hit ? { code: hit.code, ...pick(hit.item), method: 'barcode', score: 1 } : null;
    }
    // Pass 2: name search where barcode failed.
    for (const id of chainIds) {
      if (row[id]) continue;
      const [best] = indexes[id].searchName(ri.name, 1);
      if (best && best.score >= MIN_NAME_SCORE)
        row[id] = { code: best.code, ...pick(best.item), method: 'name', score: round(best.score) };
    }
    // Pass 3: a confident match anywhere gives a barcode to try everywhere else.
    for (const id of chainIds) {
      const m = row[id];
      if (!m || (m.method === 'name' && m.score < CONFIDENT)) continue;
      borrowed.add(m.code);
    }
    for (const id of chainIds) {
      if (row[id]?.method === 'barcode') continue;
      for (const code of borrowed) {
        const hit = indexes[id].byBarcode(code);
        if (hit && hit.code === row[id]?.code) break; // name match already agrees
        if (hit) {
          row[id] = { code: hit.code, ...pick(hit.item), method: 'barcode-crossref', score: 0.95 };
          break;
        }
      }
    }
    return row;
  });
}

const pick = (item) => ({ name: item.name, price: item.price, isWeighted: item.isWeighted });
const round = (n) => Math.round(n * 100) / 100;

// Product-name normalization and fuzzy matching for Hebrew receipt lines.

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

export const MIN_NAME_SCORE = 0.55;
export const CONFIDENT_NAME_SCORE = 0.8;

export const sameBarcode = (a, b) =>
  Boolean(a && b) && String(a).replace(/^0+/, '') === String(b).replace(/^0+/, '');

/** Best name match among search results, or null if nothing is close enough. */
export function bestByName(query, products) {
  let best = null;
  for (const p of products) {
    const score = nameScore(query, p.name);
    if (!best || score > best.score) best = { product: p, score };
  }
  return best && best.score >= MIN_NAME_SCORE ? best : null;
}

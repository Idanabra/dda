import { Session } from './http.js';
import { parseFileName } from './parse.js';

/**
 * Pick the newest PriceFull file, optionally for a specific store.
 * `files` is a list of { name, url }.
 */
export function pickLatestPriceFull(files, { chainCode, storeId } = {}) {
  let full = files
    .map((f) => ({ ...f, meta: parseFileName(f.name) }))
    .filter((f) => /pricefull/i.test(f.name));
  if (chainCode) {
    const sameChain = full.filter((f) => !f.meta || f.meta.chainCode === chainCode);
    if (sameChain.length) full = sameChain;
  }
  if (storeId) {
    const want = String(Number(storeId));
    full = full.filter((f) => f.meta && String(Number(f.meta.storeId)) === want);
  }
  if (!full.length) return null;
  // Newest first; without a store filter, newest file of the lowest-numbered store.
  full.sort((a, b) => (b.meta?.stamp ?? '').localeCompare(a.meta?.stamp ?? ''));
  if (!storeId) {
    const stores = full.filter((f) => f.meta).map((f) => Number(f.meta.storeId));
    if (stores.length) {
      const first = Math.min(...stores);
      return full.find((f) => f.meta && Number(f.meta.storeId) === first);
    }
  }
  return full[0];
}

/** Extract PriceFull links from an HTML listing page. */
export function extractLinks(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const re = /(?:href|src)\s*=\s*["']([^"']*PriceFull[^"']*)["']|["']([^"'\s]*PriceFull[^"'\s]*\.(?:gz|xml|zip))["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? m[2]).replace(/&amp;/g, '&').replace(/\\\//g, '/');
    let url;
    try {
      url = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]);
    out.push({ name, url });
  }
  return out;
}

async function fetchListing(source, chain) {
  const s = new Session();
  const html = await s.text(source.url);
  const pick = pickLatestPriceFull(extractLinks(html, source.url), chain);
  if (!pick) throw new Error(`No PriceFull files found on ${source.url}`);
  return { name: pick.name, buffer: await s.buffer(pick.url) };
}

const CERBERUS = 'https://url.publishedprices.co.il';

function csrf(html) {
  const m = /name=["']csrftoken["']\s+content=["']([^"']+)["']/i.exec(html) ??
    /name=["']csrftoken["'][^>]*value=["']([^"']+)["']/i.exec(html);
  return m?.[1] ?? '';
}

async function fetchCerberus(source, chain) {
  const s = new Session();
  const base = source.baseUrl ?? CERBERUS;
  const form = (o) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(o).toString(),
  });
  const loginPage = await s.text(`${base}/login`);
  await s.fetch(`${base}/login/user`, form({
    r: '', username: source.username, password: source.password ?? '', Submit: 'Sign in', csrftoken: csrf(loginPage),
  }));
  const filePage = await s.text(`${base}/file`);
  const res = await s.fetch(`${base}/file/json/dir`, form({
    sEcho: '1', iColumns: '5', iDisplayStart: '0', iDisplayLength: '100000',
    sSearch: 'PriceFull', cd: '/', csrftoken: csrf(filePage),
  }));
  if (!res.ok) throw new Error(`Cerberus listing failed: ${res.status}`);
  const json = await res.json();
  const files = (json.aaData ?? []).map((r) => ({ name: r.fname, url: `${base}/file/d/${encodeURIComponent(r.fname)}` }));
  const pick = pickLatestPriceFull(files, chain);
  if (!pick) throw new Error(`No PriceFull files for user ${source.username}`);
  return { name: pick.name, buffer: await s.buffer(pick.url) };
}

async function fetchDirect(source) {
  const s = new Session();
  return { name: source.url.split('/').pop(), buffer: await s.buffer(source.url) };
}

/** Download the latest PriceFull file for a chain. Returns { name, buffer }. */
export async function downloadPriceFile(chain) {
  const src = chain.source;
  if (!src) throw new Error(`${chain.nameEn}: no price source configured (see README)`);
  if (src.type === 'cerberus') return fetchCerberus(src, chain);
  if (src.type === 'listing') return fetchListing(src, chain);
  if (src.type === 'url') return fetchDirect(src);
  throw new Error(`Unknown source type ${src.type}`);
}

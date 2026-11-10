// The four retailers. Every value can be overridden with environment variables,
// e.g. RAMI_LEVY_STORE_ID=039 or SUPER_TAL_PRICE_URL=https://.../PriceFull...gz
//
// Israeli chains publish their full price lists (PriceFull*.xml / .gz) under the
// Price Transparency regulations. Sources below are the publicly known portals:
//   - "cerberus": url.publishedprices.co.il, login with a public username, no password
//   - "listing":  an HTML page that links to PriceFull files
//   - "url":      a direct link to one PriceFull file (works for any chain)

export const CHAINS = [
  {
    id: 'rami_levy',
    name: 'רמי לוי',
    nameEn: 'Rami Levy',
    chainCode: '7290058140886',
    source: { type: 'cerberus', username: 'RamiLevi', password: '' },
  },
  {
    id: 'victory',
    name: 'ויקטורי',
    nameEn: 'Victory',
    chainCode: '7290696200003',
    source: { type: 'listing', url: 'https://laibcatalog.co.il/' },
  },
  {
    id: 'super_tal',
    name: 'סופר טל',
    nameEn: 'Super Tal',
    chainCode: null,
    // No verified public source; set SUPER_TAL_PRICE_URL, SUPER_TAL_LISTING_URL
    // or SUPER_TAL_CERBERUS_USER, or import a PriceFull file manually.
    source: null,
  },
  {
    id: 'carrefour',
    name: 'קרפור',
    nameEn: 'Carrefour',
    chainCode: '7290055700007',
    source: { type: 'listing', url: 'https://prices.carrefour.co.il/' },
  },
];

function envKey(chain, suffix) {
  return `${chain.id.toUpperCase()}_${suffix}`;
}

/** Chain config with environment overrides applied. */
export function resolveChain(chain, env = process.env) {
  const out = { ...chain, source: chain.source ? { ...chain.source } : null };
  const directUrl = env[envKey(chain, 'PRICE_URL')];
  const listingUrl = env[envKey(chain, 'LISTING_URL')];
  const cerberusUser = env[envKey(chain, 'CERBERUS_USER')];
  if (directUrl) out.source = { type: 'url', url: directUrl };
  else if (listingUrl) out.source = { type: 'listing', url: listingUrl };
  else if (cerberusUser)
    out.source = { type: 'cerberus', username: cerberusUser, password: env[envKey(chain, 'CERBERUS_PASSWORD')] ?? '' };
  out.storeId = env[envKey(chain, 'STORE_ID')] ?? null;
  if (env[envKey(chain, 'CHAIN_CODE')]) out.chainCode = env[envKey(chain, 'CHAIN_CODE')];
  return out;
}

export function getChains(env = process.env) {
  return CHAINS.map((c) => resolveChain(c, env));
}

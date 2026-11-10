// Online stores built on the shared "/v2/retailers/{id}" e-commerce platform
// (Victory = retailer 1470, Carrefour = 1540, and others).
//
// The site's search page (/search/{barcode}) calls the products API with `q`.
// Product objects don't always carry a barcode field, but the product image
// URL embeds it (".../7290004127329-12345/..."), so results are verified
// against the requested barcode before being trusted.
import { fetchJson } from './http.js';

const BARCODE_IN_URL = /\/(\d{7,14})-/;

export function barcodeOf(p) {
  const direct = p.barcode ?? p.gs1ProductId ?? p.localBarcode ?? null;
  if (direct && /^\d{7,14}$/.test(String(direct))) return String(direct);
  for (const url of [p?.image?.url, ...(p?.images ?? []).map((i) => i?.url)]) {
    const m = url && BARCODE_IN_URL.exec(url);
    if (m) return m[1];
  }
  return null;
}

export function toProduct(p, baseUrl) {
  const b = p?.branch ?? (p?.branches ? Object.values(p.branches)[0] : null) ?? {};
  const price = Number(b.regularPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (b.isActive === false || b.isVisible === false) return null;
  const sale = Number(b.salePrice);
  const names = p.names?.['1'] ?? p.names?.he ?? {};
  const barcode = barcodeOf(p);
  return {
    barcode,
    name: String(names.long || names.short || p.localName || p.name || ''),
    price,
    salePrice: Number.isFinite(sale) && sale > 0 && sale < price ? sale : null,
    isWeighted: Boolean(p.isWeighable),
    outOfStock: Boolean(b.isOutOfStock),
    url: `${baseUrl}/search/${encodeURIComponent(barcode ?? p.localName ?? '')}`,
  };
}

const sameBarcode = (a, b) => a && b && a.replace(/^0+/, '') === String(b).replace(/^0+/, '');

export function zuzSource({ id, name, nameEn, baseUrl, retailerId, branchId }) {
  const api = `${baseUrl}/v2/retailers/${retailerId}`;
  const common = 'languageId=1&from=0&size=24';

  async function query(params) {
    const urls = [
      `${api}/branches/${branchId}/products?appId=4&${common}&${params}`,
      `${api}/products?appId=2&${common}&${params}`,
    ];
    let lastErr;
    for (const url of urls) {
      try {
        const data = await fetchJson(url, { headers: { Referer: `${baseUrl}/` } });
        const items = (data.products ?? []).map((p) => toProduct(p, baseUrl)).filter(Boolean);
        if (items.length) return items;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  return {
    id,
    name,
    nameEn,
    branch: String(branchId),
    async searchBarcode(barcode) {
      const filter = encodeURIComponent(JSON.stringify({ must: { term: { barcode: String(barcode) } } }));
      let items = await query(`filters=${filter}`).catch(() => []);
      if (!items.some((p) => sameBarcode(p.barcode, barcode))) items = await query(`q=${encodeURIComponent(barcode)}`);
      const exact = items.filter((p) => sameBarcode(p.barcode, barcode));
      if (exact.length) return exact;
      // A barcode query that returns exactly one product with no barcode info is the product.
      return items.length === 1 && !items[0].barcode ? items : [];
    },
    searchName: (text) => query(`q=${encodeURIComponent(text)}`),
  };
}

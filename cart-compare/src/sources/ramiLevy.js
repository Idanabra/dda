// Rami Levy online store (www.rami-levy.co.il). Its site search calls
// POST /api/catalog with { q, store, aggs }, where q can be a barcode or a name.
import { fetchJson } from './http.js';

const BASE = 'https://www.rami-levy.co.il';

export function ramiLevySource({ storeId = '331', token, baseUrl = BASE } = {}) {
  async function search(q) {
    const data = await fetchJson(`${baseUrl}/api/catalog`, {
      method: 'POST',
      body: { q: String(q), store: String(storeId), aggs: 1 },
      headers: {
        locale: 'he',
        Referer: `${baseUrl}/he/online/search?q=${encodeURIComponent(q)}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return (data.data ?? []).map(toProduct).filter(Boolean);
  }
  return {
    id: 'rami_levy',
    name: 'רמי לוי',
    nameEn: 'Rami Levy',
    branch: String(storeId),
    searchBarcode: (barcode) => search(barcode),
    searchName: (name) => search(name),
  };
}

export function toProduct(p) {
  const price = Number(p?.price?.price);
  if (!p || !Number.isFinite(price) || price <= 0) return null;
  const sale = Number(p?.sale?.price ?? p?.price?.sale ?? NaN);
  return {
    barcode: p.barcode != null ? String(p.barcode) : null,
    name: String(p.name ?? ''),
    price,
    salePrice: Number.isFinite(sale) && sale > 0 && sale < price ? sale : null,
    isWeighted: Boolean(p?.prop?.by_kilo),
    url: p.id ? `${BASE}/he/online/product/${p.id}` : `${BASE}/he/online/search?q=${encodeURIComponent(p.barcode ?? '')}`,
  };
}

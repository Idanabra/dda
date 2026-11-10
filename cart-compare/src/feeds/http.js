/** Tiny fetch wrapper with a cookie jar (needed for the Cerberus portal). */
export class Session {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async fetch(url, opts = {}) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (cart-compare)', ...(opts.headers ?? {}) };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    const res = await fetch(url, { redirect: 'manual', ...opts, headers });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), url).toString();
      return this.fetch(next, { ...opts, method: 'GET', body: undefined });
    }
    return res;
  }
  async text(url, opts) {
    const res = await this.fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
  }
  async buffer(url, opts) {
    const res = await this.fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

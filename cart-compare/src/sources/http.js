// Shared HTTP helper for the store scrapers: browser-like headers, optional
// proxy (these sites often block non-Israeli / cloud IPs), timeouts, retries,
// and a per-host rate limit so we don't hammer the retailers.
import { fetch, ProxyAgent, EnvHttpProxyAgent } from 'undici';

// SCRAPE_PROXY_URL wins (e.g. an Israeli proxy); otherwise honor HTTPS_PROXY / NO_PROXY.
const PROXY = process.env.SCRAPE_PROXY_URL || null;
const dispatcher = PROXY
  ? new ProxyAgent(PROXY)
  : process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY
    ? new EnvHttpProxyAgent()
    : undefined;

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MIN_INTERVAL_MS = Number(process.env.SCRAPE_MIN_INTERVAL_MS ?? 250);
const lastByHost = new Map();
const queueByHost = new Map();

/** Serialize requests per host with a minimum gap between them. */
function throttle(host) {
  const prev = queueByHost.get(host) ?? Promise.resolve();
  const next = prev.then(async () => {
    const wait = (lastByHost.get(host) ?? 0) + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastByHost.set(host, Date.now());
  });
  queueByHost.set(host, next.catch(() => {}));
  return next;
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} from ${new URL(url).host}${status === 403 || status === 402 ? ' (blocked – run from an Israeli IP or set SCRAPE_PROXY_URL)' : ''}`);
    this.status = status;
    this.body = body;
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchJson(url, { method = 'GET', headers = {}, body, retries = 2, timeoutMs = 15000 } = {}) {
  const origin = new URL(url).origin;
  for (let attempt = 0; ; attempt++) {
    await throttle(new URL(url).host);
    try {
      const res = await fetch(url, {
        method,
        dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
          Origin: origin,
          Referer: `${origin}/`,
          ...(body ? { 'Content-Type': 'application/json;charset=UTF-8' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, url, text.slice(0, 300));
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${new URL(url).host} (probably a bot-protection page)`);
      }
    } catch (err) {
      let e = err;
      if (e instanceof TypeError && e.message === 'fetch failed') {
        const cause = typeof e.cause?.code === 'string' ? e.cause.code : e.cause?.message || 'network error';
        e = new Error(`Cannot reach ${new URL(url).host} (${cause})`);
      }
      const retryable = e.name === 'TimeoutError' || (e instanceof HttpError && RETRYABLE.has(e.status)) || e.code === 'ECONNRESET';
      if (!retryable || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
}

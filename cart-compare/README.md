# 🛒 הסל הזול — Cheapest Cart

Upload a photo or PDF of a supermarket receipt. The app reads every line with Claude, then **searches each product by barcode on the online stores** of Rami Levy, Victory, Super Tal and Carrefour. It shows which store has the cheapest cart, and what you'd pay if you split the cart across stores.

There are no price files to download or upload: prices are looked up live on the retailers' websites.

## Quick start

```bash
cd cart-compare
npm install                         # Node 22.19+
export ANTHROPIC_API_KEY=sk-ant-... # used to read receipts
npm run check-stores                # verify the store websites answer from your machine
npm start                           # http://localhost:3000
```

To try the app offline with fake prices, run `npm run demo` and press **"נסו עם קבלת דוגמה"**.

## ⚠️ Run it from Israel

The retailers' websites usually block requests from outside Israel and from cloud servers. Rami Levy also uses bot protection. Run the app on a computer in Israel. If you host it on a server, route the store requests through an Israeli proxy:

```bash
SCRAPE_PROXY_URL=http://user:pass@il-proxy.example:8080 npm start
```

`npm run check-stores [barcode] [name]` runs a barcode search and a name search on each store, so you can see what works from your machine.

## How it works

1. **Reading the receipt** (`src/receipt.js`): Claude (`claude-opus-5-5`, structured JSON output) extracts each line's name, barcode if printed, quantity or weight, unit price and line total.
2. **Live store lookup** (`src/lookup.js`, `src/sources/`). For each receipt line, in each store:
   1. If the receipt prints a barcode, the app searches that store for it, the same way the store's own site search does.
   2. Otherwise it searches the store by product name and keeps the best fuzzy match (`src/matcher.js`: Hebrew normalization, units, size checks).
   3. A confident match in one store supplies a barcode, which is then searched in the other stores. That way the same exact product is compared everywhere, even when the receipt has no barcodes.
3. **Comparison** (`src/cart.js`):
   - **Estimated total per store:** if a store doesn't carry an item, the price you paid stands in for it.
   - **Common-items total:** the total over only the products every store carries.
   - **Split cart:** each item bought where it's cheapest.

Lookups are cached for 12 hours in `data/cache.json` (`CACHE_HOURS` to change), and requests to each site are rate-limited.

## Stores

| Store | How it's searched | Default branch | Override |
|---|---|---|---|
| Rami Levy | `POST https://www.rami-levy.co.il/api/catalog` `{q, store, aggs}` | `331` | `RAMI_LEVY_STORE_ID`, optional `RAMI_LEVY_TOKEN` |
| Victory | `https://www.victoryonline.co.il/v2/retailers/1470/branches/{branch}/products?q=…` | `2930` (online, Lod) | `VICTORY_BRANCH_ID` |
| Carrefour | `https://www.carrefour.co.il/v2/retailers/1540/branches/{branch}/products?q=…` | `3003` | `CARREFOUR_BRANCH_ID` |
| Super Tal | **not configured** | — | see below |

Online prices differ by branch, so set the branch that delivers to you. The branch lists are at `/v2/retailers/<id>/branches?appId=2&languageId=1` on the Victory and Carrefour sites.

The API details come from open-source projects that document these sites ([rami-levy-mcp](https://github.com/shilomagen/rami-levy-mcp) and [SuperMarketScraping](https://github.com/tomer362/SuperMarketScraping)). They have **not** been verified from this repository's CI, because the sites block non-Israeli traffic. Run `npm run check-stores` to confirm. Sites change: if a store stops answering, open its search page in Chrome, open DevTools → Network, and compare the requests with `src/sources/`.

**Super Tal:** I couldn't find an online store for it. If its site runs on the same platform as Victory and Carrefour (its network requests look like `/v2/retailers/<id>/branches/<id>/products`), set:

```bash
SUPER_TAL_SITE_URL=https://… SUPER_TAL_RETAILER_ID=… SUPER_TAL_BRANCH_ID=…
```

If it uses a different platform, it needs its own adapter in `src/sources/`. Each adapter only implements `searchBarcode(code)` and `searchName(text)`.

## Settings

| Variable | Default | |
|---|---|---|
| `PRICE_MODE` | `regular` | `sale` = use the store's online sale price when it has one |
| `SCRAPE_PROXY_URL` | — | proxy for store requests (`HTTPS_PROXY` / `NO_PROXY` are also honored) |
| `SCRAPE_MIN_INTERVAL_MS` | `250` | minimum gap between requests to the same site |
| `CACHE_HOURS` | `12` | how long lookups are cached |
| `CLAUDE_MODEL` | `claude-opus-5-5` | model that reads receipts |
| `DEMO` | — | `1` = fake offline stores |

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/receipt` | multipart field `receipt` (jpeg/png/webp/gif/pdf) → extraction + live comparison |
| `POST` | `/api/compare` | `{ items: [...] }` → live comparison (after editing items) |
| `GET`  | `/api/chains` | configured stores and branches |
| `GET`  | `/api/demo-receipt` | sample receipt comparison |

## Tests

```bash
npm test
```

The tests run the store adapters against local mock servers that return the stores' response shapes, so they need no network access.

## Limitations

- Club-member and multi-buy deals ("2 ב־20") aren't applied. Single-item online sale prices are shown, and are used when `PRICE_MODE=sale`.
- Produce sold by weight usually has no barcode on the receipt, so it's matched by name. Check those rows.
- Online-store prices can differ from in-store prices.

# 🛒 הסל הזול — Cheapest Cart

Upload a photo or PDF of a supermarket receipt. The app reads every line with Claude, finds the same products in the price lists of **Rami Levy, Victory, Super Tal and Carrefour**, and shows which chain gives the cheapest cart. It also shows the total if you split the cart across chains.

## Quick start

```bash
cd cart-compare
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # needed to read receipts
npm run update-prices                 # download real price lists (see below)
#   or: npm run seed-demo             # offline demo with FAKE prices
npm start                             # http://localhost:3000
```

The **"נסו עם קבלת דוגמה"** button runs a sample receipt without an API key.

## How it works

1. **Reading the receipt** (`src/receipt.js`): the image or PDF goes to Claude (`claude-opus-5-5`, structured JSON output). Claude returns each line's name, barcode if printed, quantity or weight, unit price and line total. Discount lines are folded into their products. Deposit, bag and payment lines are skipped.
2. **Price data** (`src/feeds/`, `src/store.js`): Israel's Price Transparency regulations (חוק המזון – שקיפות מחירים) make every chain publish `PriceFull*.xml(.gz)` files for each store. The app downloads the latest file per chain and caches it in `data/prices/<chain>.json`. The parser handles the different XML styles chains use (`Items/Item`, `Products/Product`, `ItemNm`, UTF‑16, gzip/zip).
3. **Matching** (`src/matcher.js`) runs in this order:
   - the barcode, if the receipt prints one
   - a fuzzy Hebrew name match: units are normalized (גר/גרם/ק"ג → grams, ל/ליטר/מ"ל → ml, %), and a size mismatch is penalized
   - a barcode taken from a confident match in another chain, used to find the same product everywhere
4. **Cart comparison** (`src/cart.js`):
   - **Estimated total:** if a chain doesn't carry an item, the price you paid stands in for it. This keeps totals comparable, and the cheapest estimated total wins.
   - **Common-items total:** the total over only the products that every chain carries.
   - **Split cart:** each item bought where it's cheapest.

In the UI you can fix a product name or quantity and press **חישוב מחדש** to recalculate.

## Price sources

| Chain | Default source | Notes |
|---|---|---|
| Rami Levy | `url.publishedprices.co.il` (Cerberus), user `RamiLevi` | |
| Victory | `laibcatalog.co.il` listing page | |
| Carrefour | `prices.carrefour.co.il` listing page | |
| Super Tal | **none built in** | Set one of the env vars below, or import a file |

The portals change from time to time. Every chain can be overridden with environment variables (`<CHAIN>` = `RAMI_LEVY`, `VICTORY`, `SUPER_TAL`, `CARREFOUR`):

```bash
<CHAIN>_PRICE_URL=https://…/PriceFull….gz   # direct link to one file
<CHAIN>_LISTING_URL=https://…               # HTML page linking to PriceFull files
<CHAIN>_CERBERUS_USER=username              # publishedprices.co.il account (+ <CHAIN>_CERBERUS_PASSWORD)
<CHAIN>_STORE_ID=039                        # which branch to price (default: lowest store number)
```

Prices differ between branches. Set `<CHAIN>_STORE_ID` to the branch you would actually shop at.

**Manual import:** download a `PriceFull` file yourself, then use the **ייבוא קובץ** button in the UI, or run:

```bash
npm run import-prices super_tal ~/Downloads/PriceFull7290000000000-001-202611100300.gz
```

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/receipt` | multipart field `receipt` (jpeg/png/webp/gif/pdf) → extraction + comparison |
| `POST` | `/api/compare` | `{ items: [...] }` → comparison (for edited items) |
| `GET`  | `/api/chains` | price data status per chain |
| `POST` | `/api/prices/:id/refresh` | download latest prices (`:id` = chain id or `all`) |
| `POST` | `/api/prices/:id/import` | multipart field `file` with a PriceFull file |
| `GET`  | `/api/demo-receipt` | sample receipt comparison |

## Tests

```bash
npm test
```

## Limitations

- Club and promotion prices (`PromoFull` files) are not applied yet. Comparisons use regular shelf prices.
- Produce sold by weight often has store-internal codes, so it is matched by name. Check those rows in the table.
- Online-store prices can differ from the branch prices published in the transparency files.

// Turns receipt items + per-chain matches into cart totals and a recommendation.

const r2 = (n) => Math.round(n * 100) / 100;

/** Cost of one receipt line at a given catalog price. */
export function lineCost(item, price) {
  const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  return r2(price * qty);
}

/** What the shopper actually paid for the line, if the receipt says. */
export function receiptLineCost(item) {
  if (Number.isFinite(item.line_total) && item.line_total > 0) return item.line_total;
  if (Number.isFinite(item.unit_price)) return r2(item.unit_price * (Number(item.quantity) || 1));
  return null;
}

/**
 * @param items   receipt items [{ name, barcode, quantity, unit_price, line_total }]
 * @param matches output of matchReceipt
 * @param chains  [{ id, name, nameEn }] — only chains with loaded catalogs
 */
export function compareCarts(items, matches, chains) {
  const carts = chains.map((c) => {
    let found = 0;
    let estimated = 0;
    let commonTotal = 0;
    const missing = [];
    const lines = items.map((it, i) => {
      const m = matches[i][c.id];
      const paid = receiptLineCost(it);
      if (!m) {
        missing.push(it.name);
        // Not sold / not found: assume the receipt's price to keep totals comparable.
        if (paid !== null) estimated += paid;
        return { index: i, found: false, cost: null };
      }
      const cost = lineCost(it, m.price);
      found += cost;
      estimated += cost;
      return { index: i, found: true, cost, match: m };
    });
    return {
      chainId: c.id,
      name: c.name,
      nameEn: c.nameEn,
      foundTotal: r2(found),
      estimatedTotal: r2(estimated),
      matchedCount: items.length - missing.length,
      missing,
      lines,
      commonTotal,
    };
  });

  // Items every chain has → fair apples-to-apples total.
  const common = items.map((_, i) => carts.length > 0 && carts.every((c) => c.lines[i].found));
  for (const c of carts) c.commonTotal = r2(c.lines.reduce((s, l, i) => s + (common[i] ? l.cost : 0), 0));
  const commonCount = common.filter(Boolean).length;

  // Best single store: lowest estimated total (receipt price stands in for missing items).
  const ranked = [...carts].sort((a, b) => a.estimatedTotal - b.estimatedTotal);
  const best = ranked[0] ?? null;

  // Split cart: buy each item where it's cheapest.
  const split = items.map((it, i) => {
    let bestLine = null;
    for (const c of carts) {
      const l = c.lines[i];
      if (l.found && (!bestLine || l.cost < bestLine.cost)) bestLine = { chainId: c.chainId, name: c.name, cost: l.cost };
    }
    return bestLine;
  });
  const splitTotal = r2(split.reduce((s, l, i) => s + (l ? l.cost : receiptLineCost(items[i]) ?? 0), 0));

  const receiptTotal = r2(items.reduce((s, it) => s + (receiptLineCost(it) ?? 0), 0));

  return {
    carts: ranked,
    bestChainId: best?.chainId ?? null,
    commonCount,
    receiptTotal,
    savingsVsReceipt: best ? r2(receiptTotal - best.estimatedTotal) : null,
    split: { lines: split, total: splitTotal, savingsVsBest: best ? r2(best.estimatedTotal - splitTotal) : null },
  };
}

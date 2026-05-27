/**
 * Catalog deduplication — pure functions, no Prisma.
 * Used during generation (buildCatalog) and persistence (prepare rows).
 */

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function normalizeCatalogProductName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Deduplicate draft catalog products by normalized name (first wins).
 *
 * @param {Array<{ name?: string, [key: string]: unknown }>} products
 * @param {{ logContext?: string }} [opts]
 * @returns {{ products: typeof products, removedCount: number, removedNames: string[] }}
 */
export function dedupeCatalogProductsByName(products, opts = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { products: [], removedCount: 0, removedNames: [] };
  }
  const seen = new Set();
  const kept = [];
  const removedNames = [];

  for (const p of products) {
    const key = normalizeCatalogProductName(p?.name);
    if (!key) {
      kept.push(p);
      continue;
    }
    if (seen.has(key)) {
      removedNames.push(p.name);
      continue;
    }
    seen.add(key);
    kept.push(p);
  }

  const removedCount = products.length - kept.length;
  if (removedCount > 0) {
    console.log(
      '[CATALOG_DEDUPE]',
      JSON.stringify({
        context: opts.logContext ?? 'catalog',
        removedCount,
        sample: removedNames.slice(0, 8),
      }),
    );
  }

  return { products: kept, removedCount, removedNames };
}

/**
 * Deduplicate Prisma product insert rows by normalized name (first wins).
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ logContext?: string }} [opts]
 * @returns {{ rows: typeof rows, removedCount: number }}
 */
export function dedupeRowsBeforeInsert(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows: [], removedCount: 0 };
  }
  const seen = new Set();
  const kept = [];
  let removedCount = 0;

  for (const row of rows) {
    const key = normalizeCatalogProductName(row?.name);
    if (!key) {
      kept.push(row);
      continue;
    }
    if (seen.has(key)) {
      removedCount += 1;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }

  if (removedCount > 0) {
    console.log(
      '[CATALOG_DEDUPE]',
      JSON.stringify({
        context: opts.logContext ?? 'insert_rows',
        removedCount,
      }),
    );
  }

  return { rows: kept, removedCount };
}

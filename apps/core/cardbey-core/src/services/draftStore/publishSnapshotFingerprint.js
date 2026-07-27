/**
 * Deterministic catalog fingerprint for publish snapshot identity checks.
 * Mirrors dashboard publishSourceFingerprint (names, prices, categories).
 */

function normStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function normPrice(item) {
  const pv1 = item?.priceV1;
  if (pv1 && typeof pv1 === 'object') {
    const amt = typeof pv1.amount === 'number' && Number.isFinite(pv1.amount) ? pv1.amount : null;
    const cur = normStr(pv1.currency).toUpperCase();
    if (amt != null && cur) return `${cur}:${amt}`;
    if (amt != null) return `:${amt}`;
  }
  const cur = normStr(item?.currency).toUpperCase();
  const p = item?.price;
  if (typeof p === 'number' && Number.isFinite(p)) return `${cur || ''}:${p}`;
  return `${cur || ''}:${normStr(p)}`;
}

function normCategory(item) {
  const cid = normStr(item?.categoryId);
  if (cid) return `id:${cid}`;
  const c = normStr(item?.category);
  return c ? `name:${c}` : '';
}

function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/**
 * @param {unknown[]} items
 * @returns {{ count: number, headNames: string[], hash: string }}
 */
export function buildCatalogFingerprint(items) {
  const cleaned = (items ?? [])
    .map((it) => ({
      name: normStr(it?.name),
      price: normPrice(it ?? {}),
      category: normCategory(it ?? {}),
    }))
    .filter((it) => it.name);

  const count = cleaned.length;
  const headNames = cleaned.slice(0, 10).map((x) => x.name);
  const stableLines = cleaned.map((x) => `${x.name.toLowerCase()}|${x.price}|${x.category}`).join('\n');
  return {
    count,
    headNames,
    hash: djb2Hash(stableLines),
  };
}

export function buildSourceFingerprintFromCatalog(products) {
  return buildCatalogFingerprint(products).hash;
}

/**
 * Fingerprint for hero media on draft preview (catalog fingerprint ignores hero-only edits).
 * @param {object} preview
 */
export function buildHeroFingerprintFromPreview(preview) {
  if (!preview || typeof preview !== 'object') return '';
  const hero =
    preview.hero && typeof preview.hero === 'object' && !Array.isArray(preview.hero) ? preview.hero : {};
  const parts = [
    String(preview.heroMediaType ?? hero.type ?? ''),
    String(preview.heroVideoUrl ?? preview.heroVideo ?? hero.videoUrl ?? ''),
    String(preview.heroImageUrl ?? hero.imageUrl ?? hero.url ?? ''),
    String(preview.heroPosterUrl ?? preview.heroPoster ?? ''),
  ].map((s) => s.trim());
  return djb2Hash(parts.join('|'));
}

/**
 * @param {object|null|undefined} hero - snapshot.hero
 */
export function buildHeroFingerprintFromSnapshotHero(hero) {
  if (!hero || typeof hero !== 'object') return '';
  const parts = [
    String(hero.type ?? ''),
    String(hero.videoUrl ?? ''),
    String(hero.imageUrl ?? ''),
    String(hero.url ?? ''),
  ].map((s) => s.trim());
  return djb2Hash(parts.join('|'));
}

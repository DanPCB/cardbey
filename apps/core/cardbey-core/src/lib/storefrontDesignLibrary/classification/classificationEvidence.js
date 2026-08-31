/**
 * Normalize partial item / page evidence for classification.
 */

/**
 * @typedef {{
 *   label: string,
 *   labelLower: string,
 *   description: string,
 *   descriptionLower: string,
 *   url: string,
 *   urlPath: string,
 *   pageTitle: string,
 *   heading: string,
 *   sourceType: string,
 *   schemaType: string,
 *   itemType: string,
 *   navigationParent: string,
 *   navigationDepth: number | null,
 *   hasPrice: boolean,
 *   hasPurchaseAction: boolean,
 *   hasBookingEvidence: boolean,
 *   contentOrigin: string | null,
 *   raw: Record<string, unknown>,
 * }} ClassificationInput
 */

/**
 * @param {unknown} item
 * @param {Record<string, unknown>} [context]
 * @returns {ClassificationInput}
 */
export function buildClassificationInput(item, context = {}) {
  const row = item && typeof item === 'object' && !Array.isArray(item)
    ? /** @type {Record<string, unknown>} */ (item)
    : {};

  const label = String(row.name ?? row.title ?? row.label ?? context.label ?? '').trim();
  const description = String(row.description ?? row.summary ?? context.description ?? '').trim();
  const url = String(
    row.url ?? row.sourceUrl ?? row.href ?? row.link ?? context.url ?? row.researchMeta?.sourceUrl ?? '',
  ).trim();
  let urlPath = '';
  try {
    if (url.startsWith('/')) urlPath = url.split('?')[0];
    else if (url) urlPath = new URL(url).pathname || '';
  } catch {
    urlPath = String(url).split('?')[0] || '';
  }
  const pageTitle = String(row.pageTitle ?? row.title ?? context.pageTitle ?? '').trim();
  const heading = String(row.heading ?? row.h1 ?? context.heading ?? '').trim();
  const sourceType = String(
    row.sourceType ??
      row.sourceEvidence ??
      row.researchMeta?.sourceType ??
      row.type ??
      row.itemType ??
      context.sourceType ??
      '',
  )
    .trim()
    .toLowerCase();
  const schemaType = String(row.schemaType ?? row['@type'] ?? context.schemaType ?? '')
    .trim()
    .toLowerCase();
  const itemType = String(row.itemType ?? row.kind ?? row.type ?? '')
    .trim()
    .toLowerCase();
  const navigationParent = String(row.navigationParent ?? row.parentLabel ?? context.navigationParent ?? '')
    .trim()
    .toLowerCase();
  const depthRaw = row.navigationDepth ?? context.navigationDepth;
  const navigationDepth =
    typeof depthRaw === 'number' && Number.isFinite(depthRaw) ? depthRaw : depthRaw != null ? Number(depthRaw) : null;

  const price =
    row.price ?? row.amount ?? row.priceMin ?? row.priceMax ?? null;
  const hasPrice =
    price != null &&
    price !== '' &&
    !(typeof price === 'number' && !Number.isFinite(price)) &&
    row.priceWasNotExplicitlyProvided !== true;

  const purchaseSignals = [
    row.purchaseEnabled,
    row.addToCart,
    row.ctaAction,
    row.primaryAction,
    row.executionAction,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  const hasPurchaseAction =
    row.purchaseEnabled === true ||
    /\b(buy|add[_ ]?to[_ ]?cart|purchase|shop)\b/.test(purchaseSignals) ||
    Boolean(row.sku || row.SKU);

  const bookingSignals = [
    row.bookingUrl,
    row.bookingProvider,
    row.bookingEnabled,
    context.bookingUrl,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  const hasBookingEvidence =
    row.bookingEnabled === true ||
    Boolean(String(row.bookingUrl ?? '').trim()) ||
    /\b(fresha|squareup|calendly|booksy|mindbody)\b/.test(bookingSignals);

  const contentOrigin =
    typeof row.contentOrigin === 'string' ? row.contentOrigin : context.contentOrigin ?? null;

  return {
    label,
    labelLower: label.toLowerCase(),
    description,
    descriptionLower: description.toLowerCase(),
    url,
    urlPath: urlPath.toLowerCase(),
    pageTitle,
    heading,
    sourceType,
    schemaType,
    itemType,
    navigationParent,
    navigationDepth: Number.isFinite(navigationDepth) ? /** @type {number} */ (navigationDepth) : null,
    hasPrice,
    hasPurchaseAction,
    hasBookingEvidence,
    contentOrigin: contentOrigin != null ? String(contentOrigin) : null,
    raw: row,
  };
}

/**
 * Combined text blob for pattern matching (label + path + title + heading).
 * @param {ClassificationInput} input
 */
export function evidenceText(input) {
  return [input.labelLower, input.urlPath, input.pageTitle.toLowerCase(), input.heading.toLowerCase(), input.descriptionLower]
    .filter(Boolean)
    .join(' | ');
}

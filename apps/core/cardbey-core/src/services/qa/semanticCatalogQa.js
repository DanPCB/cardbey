/**
 * Semantic catalog QA — validates image relevance, schema, titles, pricing, currency.
 */

import { buildServiceImageIntent } from '../../services/media/serviceImageIntentResolver.js';
import { scoreServiceImageCandidateMetadata } from '../../services/media/serviceImageCandidateScorer.js';
import { evaluateServiceMismatchGuard } from '../../services/media/serviceImageMismatchGuards.js';
import { isMalformedServiceTitle } from '../../lib/catalog/canonicalServiceNormalizer.js';
import { countCatalogItemsByKind } from '../../lib/commerce/assertCatalogKindConsistency.js';

export const MINIMUM_ACCEPTABLE_IMAGE = 0.62;
export const STRONG_IMAGE_MATCH = 0.72;

/**
 * @param {object} item
 * @param {import('../commerce/commerceProfileTypes.js').BusinessCommerceProfile} [profile]
 */
export function evaluateItemImageSemantics(item, profile) {
  const issues = [];
  const imageUrl = item?.imageUrl ?? item?.images?.[0];
  const hasUrl = !!(imageUrl && String(imageUrl).trim());

  if (!hasUrl) {
    return {
      status: 'missing',
      score: 0,
      blocking: profile?.catalogKind === 'service',
      issues: [{ code: 'IMAGE_MISSING', severity: 'blocking', itemName: item?.name }],
    };
  }

  const selection = item.imageSelection;
  if (selection?.finalScore != null) {
    const score = selection.finalScore;
    const status = selection.status ?? (score >= STRONG_IMAGE_MATCH ? 'strong' : score >= MINIMUM_ACCEPTABLE_IMAGE ? 'acceptable' : 'rejected');
    if (score < MINIMUM_ACCEPTABLE_IMAGE || status === 'rejected' || status === 'missing') {
      issues.push({
        code: 'IMAGE_SEMANTIC_MISMATCH',
        severity: 'blocking',
        itemName: item?.name,
        imageUrl,
        score,
        expectedConcepts: selection.matchedObjects ?? [],
        detectedConcepts: selection.conflictingObjects ?? [],
      });
    } else if (score < STRONG_IMAGE_MATCH) {
      issues.push({
        code: 'IMAGE_WEAK_MATCH',
        severity: 'warning',
        itemName: item?.name,
        score,
      });
    }
    return {
      status,
      score,
      blocking: issues.some((i) => i.severity === 'blocking'),
      issues,
    };
  }

  const intent = buildServiceImageIntent({
    serviceName: item?.canonicalServiceTitle ?? item?.name ?? '',
    category: item?.category,
    imageQueryHint: item?.imageQueryHint,
  });
  const candidateText = [item?.imageAlt, item?.name, imageUrl].filter(Boolean).join(' ');
  const meta = scoreServiceImageCandidateMetadata(intent, {
    provider: 'stored',
    imageUrl: String(imageUrl),
    title: item?.name,
    altText: item?.imageAlt,
    tags: item?.tags ?? [],
    sourceQuery: item?.imageQueryHint ?? item?.name ?? '',
  });
  const guard = evaluateServiceMismatchGuard(intent.canonicalTitle, candidateText);
  const score = meta.metadataScore;

  if (meta.hardReject || !guard.pass || score < MINIMUM_ACCEPTABLE_IMAGE) {
    issues.push({
      code: 'IMAGE_SEMANTIC_MISMATCH',
      severity: 'blocking',
      itemName: item?.name,
      imageUrl,
      expectedConcepts: [...intent.objectTerms, ...intent.actionTerms].slice(0, 6),
      detectedConcepts: [...meta.rejectedConflicts, ...(guard.conflicts ?? [])],
      score,
    });
  }

  return {
    status: score >= STRONG_IMAGE_MATCH ? 'strong' : score >= MINIMUM_ACCEPTABLE_IMAGE ? 'acceptable' : 'rejected',
    score,
    blocking: issues.some((i) => i.severity === 'blocking'),
    issues,
  };
}

/**
 * @param {object} draft
 * @param {{ logger?: (msg: string) => void }} [opts]
 */
export function runSemanticCatalogQa(draft, opts = {}) {
  const logger = opts.logger ?? (() => {});
  const preview =
    draft?.preview && typeof draft.preview === 'object'
      ? draft.preview
      : typeof draft?.preview === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.preview);
            } catch {
              return {};
            }
          })()
        : {};

  const items = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.catalog?.products)
      ? preview.catalog.products
      : [];

  const profile =
    preview.meta?.businessCommerceProfile ??
    opts.businessCommerceProfile ??
    null;
  const catalogKind = profile?.catalogKind ?? preview.meta?.catalogKind ?? 'product';
  const isServiceCatalog = catalogKind === 'service';

  const counts = countCatalogItemsByKind(items);
  let semanticallyMatchedImages = 0;
  let weakImageMatches = 0;
  let rejectedImageMatches = 0;
  let placeholderImages = 0;
  let malformedServiceTitles = 0;
  let duplicateServices = 0;
  let serviceSchemaViolations = 0;
  let currencyIssues = 0;

  const issues = [];
  const issueCodes = [];
  const seenNames = new Map();

  for (const item of items) {
    if (!item) continue;
    const name = String(item.name ?? '').trim();
    const nameKey = name.toLowerCase();
    if (nameKey) {
      const prev = seenNames.get(nameKey) ?? 0;
      seenNames.set(nameKey, prev + 1);
      if (prev > 0) duplicateServices += 1;
    }

    if (isServiceCatalog && isMalformedServiceTitle(name)) {
      malformedServiceTitles += 1;
      issues.push(`Malformed service title: "${name}"`);
      issueCodes.push('SERVICE_TITLE_MALFORMED');
    }

    if (isServiceCatalog && item.recordType !== 'conversion_action') {
      const kind = String(item.itemKind ?? item.itemType ?? item.type ?? '').toLowerCase();
      if (kind !== 'service') {
        serviceSchemaViolations += 1;
        issues.push(`Service schema violation: "${name}" is not itemKind service`);
        issueCodes.push('SERVICE_SCHEMA_INVALID');
      }
      if (item.sku != null || item.inventory != null) {
        serviceSchemaViolations += 1;
        issueCodes.push('SERVICE_SCHEMA_INVALID');
      }
      if (
        item.priceMode !== 'quote_required' &&
        item.priceMode !== 'free' &&
        item.priceProvenance == null &&
        typeof item.price === 'number' &&
        item.price > 0 &&
        !item.fromPrice
      ) {
        issues.push(`Unsupported fixed price without evidence: "${name}"`);
        issueCodes.push('PRICE_UNSUPPORTED');
      }
    }

    const itemCurrency = item.currencyCode ?? item.currency;
    if (profile?.currencyCode && itemCurrency && itemCurrency !== profile.currencyCode) {
      currencyIssues += 1;
      issueCodes.push('CURRENCY_MISMATCH');
    }

    if (isServiceCatalog) {
      const imageEval = evaluateItemImageSemantics(item, profile);
      if (item.imageMatchStatus === 'placeholder' || item.imageMatchStatus === 'category_fallback') {
        placeholderImages += 1;
      } else if (imageEval.blocking) {
        rejectedImageMatches += 1;
        for (const iss of imageEval.issues) {
          if (iss.severity === 'blocking') {
            issues.push(
              `${iss.code}: ${iss.itemName} (score ${iss.score?.toFixed?.(2) ?? iss.score})`,
            );
            issueCodes.push(iss.code);
            console.log('[CatalogQA] semantic mismatch detected', {
              event: 'catalog.image.rejected',
              businessKind: profile?.businessKind,
              catalogKind,
              itemName: iss.itemName,
              expectedConcepts: iss.expectedConcepts,
              detectedConcepts: iss.detectedConcepts,
              finalScore: iss.score,
              reason: 'semantic validation failed',
            });
          }
        }
      } else if (imageEval.score >= STRONG_IMAGE_MATCH) {
        semanticallyMatchedImages += 1;
      } else if (imageEval.score >= MINIMUM_ACCEPTABLE_IMAGE) {
        weakImageMatches += 1;
        semanticallyMatchedImages += 1;
      }
    } else if (item.imageUrl || item.images?.[0]) {
      semanticallyMatchedImages += 1;
    }
  }

  const totalItems = items.length;
  const itemsWithImages = items.filter((i) => i && (i.imageUrl || i.images?.[0])).length;
  const itemsWithoutImages = totalItems - itemsWithImages;

  const blockingCodes = new Set([
    'IMAGE_SEMANTIC_MISMATCH',
    'CATALOG_KIND_INCORRECT',
    'SERVICE_SCHEMA_INVALID',
    'SERVICE_TITLE_MALFORMED',
    'PRICE_UNSUPPORTED',
    'CURRENCY_MISMATCH',
  ]);
  const hasBlocking = issueCodes.some((c) => blockingCodes.has(c));

  let score = 100;
  if (totalItems > 0) {
    if (isServiceCatalog) {
      const imageRatio = semanticallyMatchedImages / totalItems;
      const schemaPenalty = (serviceSchemaViolations + malformedServiceTitles) * 8;
      const imagePenalty = rejectedImageMatches * 12;
      const pricePenalty = issues.filter((i) => i.includes('Unsupported fixed price')).length * 5;
      score = Math.max(
        0,
        Math.round(imageRatio * 70 + (hasBlocking ? 0 : 30) - schemaPenalty - imagePenalty - pricePenalty),
      );
      if (hasBlocking || rejectedImageMatches > 0) {
        score = Math.min(score, 85);
      }
    } else {
      const imageScore = Math.round((itemsWithImages / totalItems) * 100);
      score = imageScore;
    }
  }

  const catalogPass = !hasBlocking && rejectedImageMatches === 0 && serviceSchemaViolations === 0;

  const qaReport = {
    totalItems,
    itemsWithImages,
    itemsWithoutImages,
    semanticallyMatchedImages,
    weakImageMatches,
    rejectedImageMatches,
    placeholderImages,
    malformedServiceTitles,
    duplicateServices,
    serviceSchemaViolations,
    currencyIssues,
    catalogKind,
    catalogPass,
    score,
    issues,
    issueCodes: [...new Set(issueCodes)],
    counts,
    computedAt: new Date().toISOString(),
  };

  logger(
    `[CatalogQA] score=${score} catalogPass=${catalogPass} semantic=${semanticallyMatchedImages}/${totalItems} rejected=${rejectedImageMatches}`,
  );
  return qaReport;
}

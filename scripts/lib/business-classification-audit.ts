/**
 * Business classification audit helpers.
 */

import { classifyBusinessVertical } from '../../apps/core/cardbey-core/src/lib/classifyBusinessVertical.js';

export type ClassificationAuditRow = {
  id: string;
  name: string | null;
  slug: string | null;
  type: string | null;
  seedCategory: string | null;
  transactionMode: string | null;
  ctaLabel: string | null;
  catalogLabel: string | null;
  businessVertical: string;
  commerceMode: string;
  expectedCta: string;
  expectedTransactionMode: string;
  feedCategory: string;
  needsRepair: boolean;
  repairReason: string | null;
};

export function auditBusinessClassificationRow(row: {
  id: string;
  name?: string | null;
  slug?: string | null;
  type?: string | null;
  transactionMode?: string | null;
  ctaLabel?: string | null;
  catalogLabel?: string | null;
  storefrontSettings?: Record<string, unknown> | null;
  seedCategory?: string | null;
}): ClassificationAuditRow {
  const settings = row.storefrontSettings ?? {};
  const classification = classifyBusinessVertical({
    category: row.seedCategory ?? row.type ?? null,
    businessType: row.type ?? null,
    businessName: row.name ?? null,
    businessVertical: typeof settings.businessVertical === 'string' ? settings.businessVertical : null,
    commerceMode: typeof settings.commerceVerticalMode === 'string' ? settings.commerceVerticalMode : null,
  });

  const reasons: string[] = [];
  const tx = row.transactionMode ?? null;
  const cta = row.ctaLabel ?? null;
  if (
    (classification.businessVertical === 'food' || classification.businessVertical === 'retail') &&
    tx === 'booking'
  ) {
    reasons.push('food/retail_with_booking_mode');
  }
  if (cta && /^book(\s+now|\s+appointment)?$/i.test(cta) && classification.businessVertical === 'food') {
    reasons.push('food_with_book_cta');
  }
  if (cta && /^book(\s+now|\s+appointment)?$/i.test(cta) && classification.businessVertical === 'retail') {
    reasons.push('retail_with_book_cta');
  }
  if (
    classification.businessVertical === 'food' &&
    cta &&
    !/order|menu/i.test(cta) &&
    !/^view\s+menu$/i.test(cta)
  ) {
    if (/^book/i.test(cta) || /^shop/i.test(cta)) reasons.push('food_wrong_cta');
  }

  return {
    id: row.id,
    name: row.name ?? null,
    slug: row.slug ?? null,
    type: row.type ?? null,
    seedCategory: row.seedCategory ?? null,
    transactionMode: tx,
    ctaLabel: cta,
    catalogLabel: row.catalogLabel ?? null,
    businessVertical: classification.businessVertical,
    commerceMode: classification.commerceMode,
    expectedCta: classification.ctaLabel,
    expectedTransactionMode: classification.transactionMode,
    feedCategory: classification.feedCategory,
    needsRepair: reasons.length > 0,
    repairReason: reasons.length ? reasons.join(',') : null,
  };
}

export function formatClassificationAuditReport(rows: ClassificationAuditRow[]): string {
  const needsRepair = rows.filter((r) => r.needsRepair);
  const lines = [
    '# Business Classification Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Stores audited | ${rows.length} |`,
    `| Needs repair | ${needsRepair.length} |`,
    '',
    '## Truth table',
    '',
    '| Business | Seed/Type | Vertical | Commerce | CTA | Expected CTA | Tx | Expected Tx | Feed | Repair |',
    '|----------|-----------|----------|----------|-----|--------------|----|--------------|------|--------|',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.name ?? row.id} | ${row.seedCategory ?? row.type ?? '—'} | ${row.businessVertical} | ${row.commerceMode} | ${row.ctaLabel ?? '—'} | ${row.expectedCta} | ${row.transactionMode ?? '—'} | ${row.expectedTransactionMode} | ${row.feedCategory} | ${row.needsRepair ? row.repairReason : '—'} |`,
    );
  }
  return lines.join('\n');
}

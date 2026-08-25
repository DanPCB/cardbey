/**
 * generate_report_summary — deterministic report bullets from analytics (Round 3).
 * DANH: skill-round3-analytics
 */

/**
 * @param {object} analytics
 * @returns {{ strengths: string[], gaps: string[], topAction: string }}
 */
export function buildReportSummary(analytics) {
  const strengths = [];
  const gaps = [];

  if ((analytics.bookingCount ?? 0) > 0) {
    strengths.push(`${analytics.bookingCount} booking(s) in the last ${analytics.windowDays ?? 30} days`);
  } else {
    gaps.push('No bookings recorded in the last 30 days');
  }

  if ((analytics.productCount ?? 0) >= 5) {
    strengths.push(`${analytics.productCount} products in your catalog`);
  } else if ((analytics.productCount ?? 0) > 0) {
    gaps.push(`Only ${analytics.productCount} product(s) — consider adding more menu items`);
  } else {
    gaps.push('Catalog is empty — add at least one product or service');
  }

  if ((analytics.activePromos ?? 0) > 0) {
    strengths.push(`${analytics.activePromos} active promotion(s)`);
  } else {
    gaps.push('No active promotions — offers may be invisible to customers');
  }

  if ((analytics.campaignReach ?? 0) > 10) {
    strengths.push(`Promo QR scans: ${analytics.campaignReach}`);
  }

  if ((analytics.productViews ?? 0) > 0) {
    strengths.push(`${analytics.productViews} product view(s) tracked`);
  }

  if (analytics.daysSinceUpdate != null && analytics.daysSinceUpdate > 14) {
    gaps.push(`Store profile not updated in ${analytics.daysSinceUpdate} days`);
  }

  let topAction = 'Review your catalog and publish one new offer this week';
  if ((analytics.productCount ?? 0) === 0) {
    topAction = 'Add your first product or service to the catalog today';
  } else if ((analytics.bookingCount ?? 0) === 0) {
    topAction = 'Enable booking or share your store link to drive first appointments';
  } else if ((analytics.activePromos ?? 0) === 0) {
    topAction = 'Create a simple promo to increase campaign reach';
  } else if (analytics.daysSinceUpdate != null && analytics.daysSinceUpdate > 14) {
    topAction = 'Refresh hero image or description to signal the store is active';
  }

  return {
    strengths,
    gaps,
    topAction,
  };
}

/**
 * @param {Record<string, unknown>} analytics
 * @param {{ strengths: string[], gaps: string[], topAction: string }} summary
 */
export function formatAnalyticsReportMarkdown(analytics, summary) {
  const name = analytics.storeName ?? analytics.storeSlug ?? analytics.storeId ?? 'Store';
  const lines = [
    `# Store Performance Report — ${name}`,
    '',
    `Window: last ${analytics.windowDays ?? 30} days`,
    '',
    '## Snapshot',
    `- Bookings: ${analytics.bookingCount ?? 0}`,
    `- Products: ${analytics.productCount ?? 0}`,
    `- Active promos: ${analytics.activePromos ?? 0}`,
    `- Campaign reach (promo scans): ${analytics.campaignReach ?? 0}`,
    `- Product views: ${analytics.productViews ?? 0}`,
    '',
    '## Strengths',
    ...(summary.strengths?.length ? summary.strengths.map((s) => `- ${s}`) : ['- None noted']),
    '',
    '## Gaps',
    ...(summary.gaps?.length ? summary.gaps.map((g) => `- ${g}`) : ['- None noted']),
    '',
    `## Top action`,
    summary.topAction ?? 'Review store health this week',
  ];
  return lines.join('\n');
}

/**
 * @param {object} [input]
 * @param {object} [_context]
 */
export async function execute(input = {}, _context = {}) {
  const analytics = input?.analytics ?? input;
  if (!analytics || typeof analytics !== 'object') {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'analytics object is required' },
      output: { ok: false, error: 'analytics_required' },
    };
  }

  const summary = buildReportSummary(analytics);
  const content = formatAnalyticsReportMarkdown(analytics, summary);

  // @pure-transform: deterministic transform of analytics input; no DB/API side effects by design.
  return {
    status: 'ok',
    type: 'analytics_report',
    content,
    output: {
      ok: true,
      summary,
      strengths: summary.strengths,
      gaps: summary.gaps,
      topAction: summary.topAction,
      type: 'analytics_report',
      title: 'Store Performance Report',
      format: 'markdown',
      content,
    },
  };
}

export default execute;

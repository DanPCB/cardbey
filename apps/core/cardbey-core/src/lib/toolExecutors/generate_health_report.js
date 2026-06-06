/**
 * generate_health_report — prioritised fixes from completeness audit (Round 3).
 * DANH: skill-round3-health
 *
 * AUDIT:
 * - generate_health_report: not found
 * - generate_growth_plan: found — growth actions from local audit, different output
 */

const FIX_REASONS = {
  name: 'Customers need a clear store name',
  phone: 'Add a phone number so customers can reach you',
  heroImageUrl: 'A hero image makes your storefront look trustworthy',
  products: 'Add at least one product or service to sell',
  description: 'A short description helps customers understand what you offer',
  address: 'An address builds local trust',
  logo: 'A logo strengthens brand recognition',
  category: 'Set your business type so Cardbey can categorize you correctly',
  socialLinks: 'Link one social account to grow reach',
  brandTone: 'Brand tone guides consistent marketing copy',
  brandStyle: 'Brand style helps visuals stay on-brand',
};

/**
 * @param {object} audit
 */
export function buildHealthReport(audit) {
  const score = audit.score ?? 0;
  const scoreLabel = score >= 75 ? 'Established' : score >= 45 ? 'Growing' : 'Starter';

  const priorityOrder = [
    'products',
    'heroImageUrl',
    'phone',
    'name',
    'description',
    'logo',
    'socialLinks',
    'address',
    'category',
    'brandTone',
    'brandStyle',
  ];

  const missingSet = new Set(audit.missing ?? []);
  const topFixes = priorityOrder
    .filter((field) => missingSet.has(field))
    .slice(0, 5)
    .map((field, idx) => ({
      field,
      reason: FIX_REASONS[field] ?? `Complete ${field}`,
      priority: idx + 1,
    }));

  const celebrationNote =
    score >= 75 && (audit.criticalMissing?.length ?? 0) === 0
      ? 'Your store profile looks strong — focus on promotions and bookings next.'
      : score >= 45
        ? 'Good progress — a few fixes will make your store feel complete.'
        : null;

  return { scoreLabel, topFixes, celebrationNote };
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const audit = input?.audit ?? input;
  if (!audit || typeof audit !== 'object' || typeof audit.score !== 'number') {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'audit result with score is required' },
      output: { ok: false, error: 'audit_required' },
    };
  }

  const report = buildHealthReport(audit);

  // @pure-transform: deterministic transform of audit input; no DB/API side effects by design.
  return {
    status: 'ok',
    output: {
      ok: true,
      score: audit.score,
      ...report,
    },
  };
}

export default execute;

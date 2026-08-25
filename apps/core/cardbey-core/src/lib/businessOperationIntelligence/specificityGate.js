/**
 * Recommendation specificity gate — Phase D6.
 * Prefer BUSINESS_SPECIFIC / EVIDENCE_SPECIFIC; suppress GENERIC padding.
 */

export const SPECIFICITY = Object.freeze({
  GENERIC: 'GENERIC',
  CONTEXTUAL: 'CONTEXTUAL',
  BUSINESS_SPECIFIC: 'BUSINESS_SPECIFIC',
  EVIDENCE_SPECIFIC: 'EVIDENCE_SPECIFIC',
});

const GENERIC_PATTERNS = [
  /\bimprove your website\b/i,
  /\buse social media\b/i,
  /\bimprove marketing\b/i,
  /\bunderstand your customers\b/i,
  /\bbuild your brand\b/i,
  /\bget more customers\b/i,
  /\bcreate a structured business offering catalogue\b/i,
  /\bcreate a unified cardbey business presence\b/i,
  /\bprepare clear business messaging\b/i,
];

/**
 * @param {{
 *   text?: string,
 *   observation?: string,
 *   evidenceRefs?: unknown[],
 *   metrics?: object,
 *   businessName?: string | null,
 *   location?: string | null,
 *   verticalLabel?: string | null,
 *   offeringCount?: number | null,
 * }} input
 */
export function classifyRecommendationSpecificity(input = {}) {
  const text = `${input.text || ''} ${input.observation || ''}`.trim();
  if (!text) return SPECIFICITY.GENERIC;
  if (GENERIC_PATTERNS.some((re) => re.test(text))) return SPECIFICITY.GENERIC;

  const hasNumber = /\b\d+\b/.test(text);
  const hasEvidenceVerb =
    /\b(identified|found|verified|could not verify|on current evidence|from website evidence)\b/i.test(
      text,
    );
  const hasMetric =
    hasNumber ||
    (typeof input.offeringCount === 'number' && input.offeringCount > 0) ||
    Object.keys(input.metrics || {}).length > 0;
  const evidenceRefs = input.evidenceRefs || [];

  if (hasEvidenceVerb && hasMetric && evidenceRefs.length) {
    return SPECIFICITY.EVIDENCE_SPECIFIC;
  }
  if (hasEvidenceVerb && evidenceRefs.length) {
    return SPECIFICITY.EVIDENCE_SPECIFIC;
  }

  const name = String(input.businessName || '').trim();
  const loc = String(input.location || '').trim();
  if (
    (name && text.toLowerCase().includes(name.toLowerCase())) ||
    (loc && text.toLowerCase().includes(loc.toLowerCase()))
  ) {
    return SPECIFICITY.BUSINESS_SPECIFIC;
  }

  const vertical = String(input.verticalLabel || '').trim();
  if (vertical && text.toLowerCase().includes(vertical.toLowerCase().split(/[\/&]/)[0].trim())) {
    return SPECIFICITY.CONTEXTUAL;
  }
  if (/\b(restaurant|plumbing|packaging|retail|accounting|detailing)\b/i.test(text)) {
    return SPECIFICITY.CONTEXTUAL;
  }

  return SPECIFICITY.GENERIC;
}

/**
 * Keep only sufficiently specific recommendations; optionally keep one insufficient note.
 * @param {object[]} recs
 * @param {{ minKeep?: number, allowInsufficientNote?: boolean }} [opts]
 */
export function applySpecificityGate(recs, opts = {}) {
  const minKeep = opts.minKeep ?? 0;
  const allowed = new Set([
    SPECIFICITY.EVIDENCE_SPECIFIC,
    SPECIFICITY.BUSINESS_SPECIFIC,
  ]);
  const kept = [];
  const rejected = [];
  for (const r of recs || []) {
    const level = r.specificity || SPECIFICITY.GENERIC;
    if (allowed.has(level) || level === SPECIFICITY.CONTEXTUAL) {
      // CONTEXTUAL alone is weak — only keep if paired with evidence fields
      if (level === SPECIFICITY.CONTEXTUAL && !(r.evidenceRefs || []).length) {
        rejected.push(r);
        continue;
      }
      if (level === SPECIFICITY.CONTEXTUAL) {
        // demote display but allow if observation is concrete
        if (!/\b(identified|found|verified|could not)\b/i.test(r.recommendedAction || r.recommendation || '')) {
          rejected.push(r);
          continue;
        }
      }
      kept.push(r);
    } else {
      rejected.push(r);
    }
  }

  if (kept.length >= minKeep) return { recommendations: kept, rejected };

  // Prefer fewer strong over padding — if none, return insufficient note
  if (opts.allowInsufficientNote !== false && kept.length === 0) {
    return {
      recommendations: [
        {
          id: 'rec_insufficient_evidence',
          title: 'Insufficient evidence for specific recommendations',
          finding: 'Current evidence does not support business-specific recommendations beyond the free snapshot.',
          businessSpecificObservation:
            'Cardbey does not yet have enough evidence to make a specific recommendation in this area.',
          evidenceRefs: [],
          signal: null,
          whyItMatters:
            'Padding the report with generic advice would reduce trust without helping this business act.',
          recommendedAction:
            'Cardbey does not yet have enough evidence to make a specific recommendation in this area. Confirm offerings, location, and digital presence, then re-run analysis.',
          recommendation:
            'Cardbey does not yet have enough evidence to make a specific recommendation in this area.',
          interpretation: 'Prefer a short honest report over generic padding.',
          priority: 'medium',
          specificity: SPECIFICITY.BUSINESS_SPECIFIC,
          verticalContext: null,
          limitations: ['Insufficient evidence'],
          cardbeyExecution: {
            capability: 'see_business',
            route: '/see-your-business',
            status: 'EXECUTABLE_NOW',
            label: 'Continue on See Your Business',
          },
          possibleCardbeyAction: {
            kind: 'see_business',
            label: 'Continue on See Your Business',
            href: '/see-your-business',
          },
          knowledgeState: 'RECOMMENDATION',
          supportingStates: [],
          confidence: 0.6,
          assumptions: [],
        },
      ],
      rejected,
    };
  }

  return { recommendations: kept, rejected };
}

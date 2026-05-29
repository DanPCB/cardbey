/**
 * LLM-inferred opportunities from store analysis.
 * Writes to IntentOpportunity with source='llm_inference'.
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { isPrismaMissingTableError } from '../prismaTableErrors.js';
import { localeInstruction, normalizeLocale } from '../localePrompt.js';

const VALID_INTENT_TYPES = new Set([
  'rewrite_descriptions',
  'generate_tags',
  'create_offer',
  'improve_hero',
  'create_qr_for_offer',
]);

function priorityToSeverity(priority) {
  if (priority === 1) return 'high';
  if (priority === 2) return 'medium';
  return 'low';
}

/**
 * @param {object} prisma - Prisma client
 * @param {string} storeId
 * @param {{ storeName?: string; storeType?: string; productCount?: number; issues?: string[]; missing?: string[] }} storeAnalysis
 * @param {string} tenantKey
 * @param {string} [locale]
 * @returns {Promise<{ ok: boolean, reason?: string, error?: string, created?: number }>}
 */
export async function inferOpportunities(prisma, storeId, storeAnalysis, tenantKey, locale = 'en') {
  const normalizedLocale = normalizeLocale(locale);
  try {
    const storeName = storeAnalysis?.storeName ?? 'Store';
    const storeType = storeAnalysis?.storeType ?? 'retail';
    const productCount = typeof storeAnalysis?.productCount === 'number' ? storeAnalysis.productCount : 0;
    const issues = Array.isArray(storeAnalysis?.issues) ? storeAnalysis.issues : [];
    const missing = Array.isArray(storeAnalysis?.missing) ? storeAnalysis.missing : [];

    const prompt = `You are a marketing advisor for SMB stores on Cardbey platform.
${localeInstruction(normalizedLocale)}

Based on this store analysis, suggest the 3 most impactful next actions the store owner should take.

Store: ${storeName} (${storeType})
Products: ${productCount} products
Issues found: ${issues.join(', ') || 'None'}
Missing: ${missing.join(', ') || 'None'}

Respond ONLY with valid JSON:
[{ "intentType": string, "reason": string, "priority": 1|2|3 }]

Allowed intentType only: rewrite_descriptions, generate_tags, create_offer, improve_hero, create_qr_for_offer.
priority: 1 = highest, 2 = medium, 3 = lowest.`;

    const { text } = await llmGateway.generate({
      purpose: 'infer_opportunities',
      prompt,
      tenantKey,
      responseFormat: 'json',
      maxTokens: 400,
    });

    let parsed;
    try {
      const raw = text ?? '';
      const cleaned = String(raw)
        .replace(/^```json\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/```\s*$/im, '')
        .trim();
      parsed = JSON.parse(cleaned || '[]');
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[inferOpportunities] Invalid JSON from LLM:', text?.slice(0, 200));
      }
      return { ok: true, reason: 'invalid_llm_json' };
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: true, reason: 'no_suggestions' };
    }

    const toCreate = [];
    for (const s of parsed) {
      if (!s || typeof s.intentType !== 'string' || typeof s.reason !== 'string') continue;
      const intentType = s.intentType.trim().toLowerCase().replace(/\s+/g, '_');
      if (!VALID_INTENT_TYPES.has(intentType)) continue;
      const priority = s.priority === 1 ? 1 : s.priority === 2 ? 2 : 3;
      toCreate.push({
        storeId,
        offerId: null,
        type: 'llm_next_action',
        severity: priorityToSeverity(priority),
        status: 'open',
        summary: String(s.reason).slice(0, 2000),
        evidence: { priority },
        recommendedIntentType: intentType,
        payload: null,
        source: 'llm_inference',
      });
    }

    if (toCreate.length === 0) {
      return { ok: true, reason: 'no_valid_suggestions' };
    }

    await prisma.intentOpportunity.deleteMany({
      where: { storeId, source: 'llm_inference' },
    });

    await prisma.intentOpportunity.createMany({
      data: toCreate.sort((a, b) => (a.evidence?.priority ?? 3) - (b.evidence?.priority ?? 3)),
    });

    return { ok: true, created: toCreate.length };
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      console.warn(
        '[inferOpportunities] IntentOpportunity table not found — run prisma migrate deploy. Skipping opportunity inference.',
      );
      return { ok: false, reason: 'table_missing' };
    }
    console.error('[inferOpportunities] failed:', err);
    return { ok: false, reason: 'unknown_error', error: err?.message || String(err) };
  }
}

/**
 * create_campaign_brief — Build structured campaign intent (Phase 2: in-memory only).
 */

import { randomUUID } from 'node:crypto';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {string} [input.objective]
 * @param {string} [input.targetAudience]
 * @param {string|null} [input.offer]
 * @param {string} [input.duration]
 * @param {string} [input.tone]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const brief = {
      id: randomUUID(),
      storeId,
      objective: String(input?.objective ?? '').trim() || 'promote my business',
      targetAudience: String(input?.targetAudience ?? 'local customers').trim() || 'local customers',
      offer: input?.offer != null ? String(input.offer).trim() || null : null,
      duration: String(input?.duration ?? '7 days').trim() || '7 days',
      tone: String(input?.tone ?? 'friendly').trim() || 'friendly',
      createdAt: new Date().toISOString(),
    };

    return {
      status: 'ok',
      output: { ok: true, brief },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'BRIEF_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;

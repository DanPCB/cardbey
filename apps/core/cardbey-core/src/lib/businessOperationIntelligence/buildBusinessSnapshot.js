/**
 * Phase B orchestrator — confirmed BusinessContext → free BusinessSnapshot.
 */

import { BUSINESS_CONTEXT_MODES, BUSINESS_CONTEXT_STATUS, validateBusinessContextShape } from './types.js';
import { buildExistingBusinessSnapshot } from './buildExistingSnapshot.js';
import { buildIntendedBusinessSnapshot } from './buildIntendedSnapshot.js';

/**
 * @param {{
 *   context: import('./types.js').BusinessContext,
 * }} input
 * @param {object} [deps]
 */
export async function buildBusinessSnapshot(input, deps = {}) {
  const context = input?.context;
  const shape = validateBusinessContextShape(context);
  if (!shape.ok) {
    return {
      ok: false,
      error: 'invalid_context',
      message: shape.errors.join('; '),
    };
  }

  if (context.status !== BUSINESS_CONTEXT_STATUS.CONFIRMED || !context.confirmation?.confirmed) {
    return {
      ok: false,
      error: 'context_not_confirmed',
      message: 'Confirm BusinessContext before requesting a snapshot.',
    };
  }

  if (!context.mode) {
    return {
      ok: false,
      error: 'mode_required',
      message: 'BusinessContext mode (EXISTING or INTENDED) is required.',
    };
  }

  const started = Date.now();
  let snapshot;

  if (context.mode === BUSINESS_CONTEXT_MODES.INTENDED) {
    snapshot = buildIntendedBusinessSnapshot(context);
  } else if (context.mode === BUSINESS_CONTEXT_MODES.EXISTING) {
    snapshot = await buildExistingBusinessSnapshot(context, deps);
  } else {
    return {
      ok: false,
      error: 'invalid_mode',
      message: 'Unsupported BusinessContext mode.',
    };
  }

  snapshot.timing = snapshot.timing || {};
  snapshot.timing.totalMs = snapshot.timing.totalMs || Date.now() - started;

  return {
    ok: true,
    nextStep: 'snapshot',
    message:
      context.mode === BUSINESS_CONTEXT_MODES.INTENDED
        ? 'Your business idea at a glance'
        : 'Your business at a glance',
    snapshot,
    contextId: context.contextId,
    // Provider-neutral summaries only — no raw HTML / prompts
    evidenceSummary: {
      knowledgeCount: (context.knowledge || []).length,
      offeringCount: snapshot.offerings?.count || 0,
      failureCodes: (snapshot.failures || []).map((f) => f.code),
      stages: snapshot.stages,
    },
    ui: {
      headline:
        context.mode === BUSINESS_CONTEXT_MODES.INTENDED
          ? 'Your business idea at a glance'
          : 'Your business at a glance',
      tone: context.mode === BUSINESS_CONTEXT_MODES.INTENDED ? 'intended' : 'existing',
      ctas:
        context.mode === BUSINESS_CONTEXT_MODES.INTENDED
          ? [{ id: 'create', label: 'Create this business on Cardbey', href: '/for-business' }]
          : [
              { id: 'mine', label: 'This is my business', href: '/for-business' },
              { id: 'claim', label: 'Create / claim on Cardbey', href: '/for-business' },
            ],
    },
  };
}

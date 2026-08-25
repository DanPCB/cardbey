/**
 * Adjust + confirm BusinessContext (Phase A).
 * User corrections are USER_DEFINED and must not be overwritten later by weaker inference.
 */

import { classifyBusiness } from '../../services/mi/classifyBusinessService.js';
import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { assessBusinessContextSufficiency, isGenericBusinessLabel } from './businessContextSufficiency.js';
import { parseBusinessInput } from './parseBusinessInput.js';
import {
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
  createKnowledgeItem,
  projectIdentityFromKnowledge,
  validateBusinessContextShape,
} from './types.js';
import { applyDiscoveredCandidate, upsertKnowledge } from './understandBusinessContext.js';

const ADJUSTABLE_FIELDS = new Set([
  'mode',
  'name',
  'businessType',
  'category',
  'location',
  'website',
  'operatingModel',
]);

/**
 * @param {import('./types.js').BusinessContext} draft
 * @param {Record<string, unknown>} adjustments
 * @returns {{ ok: boolean, context?: import('./types.js').BusinessContext, error?: string }}
 */
export function adjustBusinessContext(draft, adjustments = {}) {
  const shape = validateBusinessContextShape(draft);
  if (!shape.ok) {
    return { ok: false, error: shape.errors.join('; ') };
  }

  let ctx = {
    ...draft,
    identity: { ...draft.identity },
    knowledge: [...(draft.knowledge || [])],
    resolution: { ...draft.resolution, candidates: [...(draft.resolution?.candidates || [])] },
    confirmation: { ...draft.confirmation, confirmed: false, confirmedAt: null, confirmedBy: null },
    updatedAt: new Date().toISOString(),
  };

  for (const [field, raw] of Object.entries(adjustments || {})) {
    if (!ADJUSTABLE_FIELDS.has(field)) continue;
    if (raw === undefined) continue;

    if (field === 'mode') {
      if (raw !== 'EXISTING' && raw !== 'INTENDED') continue;
      ctx.knowledge = upsertKnowledge(
        ctx.knowledge,
        createKnowledgeItem({
          field: 'mode',
          value: raw,
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
          source: 'user_adjust',
          confidence: 1,
        }),
      );
      ctx.mode = raw;
      if (raw === BUSINESS_CONTEXT_MODES.INTENDED) {
        ctx.resolution = {
          status: 'skipped',
          candidates: [],
          selectedEntityId: null,
          notes: ['Mode adjusted to INTENDED — Places resolution cleared'],
          confidence: 0,
          requiresSelection: false,
        };
      }
      continue;
    }

    const value = raw == null || raw === '' ? null : String(raw).trim();
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field,
        value,
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'user_adjust',
        confidence: 1,
      }),
    );
  }

  ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
  ctx = projectIdentityFromKnowledge(ctx);
  return { ok: true, context: ctx };
}

/**
 * Select a resolution candidate (EXISTING ambiguous path).
 * @param {import('./types.js').BusinessContext} draft
 * @param {string} entityId
 */
export function selectResolutionCandidate(draft, entityId) {
  const shape = validateBusinessContextShape(draft);
  if (!shape.ok) return { ok: false, error: shape.errors.join('; ') };

  const candidates = draft.resolution?.candidates || [];
  const selected = candidates.find((c) => c.entityId === entityId);
  if (!selected) {
    return { ok: false, error: 'Unknown candidate' };
  }

  let ctx = {
    ...draft,
    identity: { ...draft.identity },
    knowledge: [...(draft.knowledge || [])],
    resolution: {
      ...draft.resolution,
      status: 'matched',
      selectedEntityId: selected.entityId,
      requiresSelection: false,
      candidates: [...candidates],
    },
    confirmation: { ...draft.confirmation, confirmed: false, confirmedAt: null, confirmedBy: null },
    updatedAt: new Date().toISOString(),
    status: BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION,
  };

  applyDiscoveredCandidate(ctx, selected);
  ctx = projectIdentityFromKnowledge(ctx);
  return { ok: true, context: ctx };
}

/**
 * Continue without Places match (description-only EXISTING).
 * @param {import('./types.js').BusinessContext} draft
 */
export function continueWithDescription(draft) {
  const shape = validateBusinessContextShape(draft);
  if (!shape.ok) return { ok: false, error: shape.errors.join('; ') };

  let ctx = {
    ...draft,
    resolution: {
      ...draft.resolution,
      status: 'unresolved',
      notes: [...(draft.resolution?.notes || []), 'User continued with description only'],
      requiresSelection: false,
    },
    status: BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION,
    confirmation: { confirmed: false, confirmedAt: null, confirmedBy: null, summary: null },
    updatedAt: new Date().toISOString(),
  };
  ctx = projectIdentityFromKnowledge(ctx);
  return { ok: true, context: ctx };
}

/**
 * Apply free-text type clarification (D7.1) and re-run classification/context logic.
 * @param {import('./types.js').BusinessContext} draft
 * @param {string} answerText
 * @param {{ classifyBusiness?: typeof classifyBusiness }} [deps]
 */
export async function applyTypeClarification(draft, answerText, deps = {}) {
  const shape = validateBusinessContextShape(draft);
  if (!shape.ok) return { ok: false, error: shape.errors.join('; ') };

  const answer = String(answerText || '').trim();
  if (answer.length < 3) {
    return { ok: false, error: 'Please describe what the business does or provides.' };
  }

  const classify = deps.classifyBusiness || classifyBusiness;
  const promptItem = (draft.knowledge || []).find((k) => k.field === 'typeClarificationPrompt');
  const question =
    (promptItem?.value != null ? String(promptItem.value) : null) ||
    assessBusinessContextSufficiency(draft).question ||
    'What kind of service or product does this business provide?';

  let ctx = {
    ...draft,
    identity: { ...draft.identity },
    knowledge: [...(draft.knowledge || [])],
    resolution: { ...draft.resolution, candidates: [...(draft.resolution?.candidates || [])] },
    confirmation: { ...draft.confirmation, confirmed: false, confirmedAt: null, confirmedBy: null },
    updatedAt: new Date().toISOString(),
  };

  ctx.knowledge = upsertKnowledge(
    ctx.knowledge,
    createKnowledgeItem({
      field: 'typeClarificationPrompt',
      value: question,
      knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
      source: 'type_clarification',
      confidence: 1,
    }),
  );
  ctx.knowledge = upsertKnowledge(
    ctx.knowledge,
    createKnowledgeItem({
      field: 'typeClarificationAnswer',
      value: answer,
      knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
      source: 'type_clarification',
      confidence: 1,
    }),
  );

  const reparsed = parseBusinessInput(`${ctx.sourceText}. ${answer}`, {
    modeHint: ctx.mode || undefined,
  });

  const businessType =
    reparsed.businessType && !isGenericBusinessLabel(reparsed.businessType)
      ? reparsed.businessType
      : answer.slice(0, 120);

  ctx.knowledge = upsertKnowledge(
    ctx.knowledge,
    createKnowledgeItem({
      field: 'businessType',
      value: businessType,
      knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
      source: 'type_clarification',
      confidence: 0.95,
    }),
  );

  ctx = projectIdentityFromKnowledge(ctx);
  const currentName = ctx.identity.name;
  if (isGenericBusinessLabel(currentName)) {
    const newName =
      reparsed.name && !isGenericBusinessLabel(reparsed.name)
        ? reparsed.name
        : titleCase(answer.split(/\s+/).slice(0, 5).join(' '));
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'name',
        value: newName,
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'type_clarification',
        confidence: 0.9,
      }),
    );
  }

  try {
    ctx = projectIdentityFromKnowledge(ctx);
    const classified = await classify({
      businessName: ctx.identity.name || '',
      businessType: ctx.identity.businessType || businessType,
      location: ctx.identity.location || '',
      notes: `${ctx.sourceText}. ${answer}`,
    });
    if (classified?.verticalGroup) {
      ctx.knowledge = upsertKnowledge(
        ctx.knowledge,
        createKnowledgeItem({
          field: 'category',
          value: mapCategoryLabel(classified.verticalGroup, classified.verticalSlug),
          knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
          source: 'classifyBusiness',
          confidence: classified.confidence,
        }),
      );
      ctx.knowledge = upsertKnowledge(
        ctx.knowledge,
        createKnowledgeItem({
          field: 'verticalSlug',
          value: classified.verticalSlug,
          knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
          source: 'classifyBusiness',
          confidence: classified.confidence,
        }),
      );
      ctx.knowledge = upsertKnowledge(
        ctx.knowledge,
        createKnowledgeItem({
          field: 'verticalGroup',
          value: classified.verticalGroup,
          knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
          source: 'classifyBusiness',
          confidence: classified.confidence,
        }),
      );
    }
  } catch {
    // classification is best-effort
  }

  ctx = projectIdentityFromKnowledge(ctx);
  const sufficiency = assessBusinessContextSufficiency(ctx);
  if (!sufficiency.sufficient) {
    return {
      ok: false,
      error: 'Please add more detail about what you sell or provide.',
    };
  }

  ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
  ctx.updatedAt = new Date().toISOString();
  return {
    ok: true,
    nextStep: 'confirm',
    message:
      ctx.mode === BUSINESS_CONTEXT_MODES.INTENDED
        ? "Here's how I understand your business idea"
        : 'We think this is your business',
    context: ctx,
    ui: {
      headline:
        ctx.mode === BUSINESS_CONTEXT_MODES.INTENDED
          ? "Here's how I understand your business idea"
          : 'We think this is your business',
      tone: ctx.mode === BUSINESS_CONTEXT_MODES.INTENDED ? 'intended' : 'existing',
      showFields: ['name', 'businessType', 'category', 'location', 'operatingModel'],
    },
  };
}

function mapCategoryLabel(group, slug) {
  const g = String(group || '').toLowerCase();
  const map = {
    food: 'Food & dining',
    beauty: 'Beauty services',
    fashion: 'Fashion & apparel',
    retail: 'Retail',
    services: 'Professional services',
    health: 'Health services',
    home: 'Home services',
    auto: 'Automotive services',
    education: 'Education',
    events: 'Events',
    entertainment: 'Entertainment',
  };
  if (map[g]) return map[g];
  if (slug && slug.includes('auto')) return 'Automotive services';
  return g ? titleCase(g) : 'General business';
}

function titleCase(s) {
  return String(s)
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Finalize confirmed BusinessContext — sole input contract for later orchestration.
 * @param {import('./types.js').BusinessContext} draft
 */
export function confirmBusinessContext(draft) {
  const shape = validateBusinessContextShape(draft);
  if (!shape.ok) {
    return { ok: false, error: shape.errors.join('; ') };
  }

  if (draft.resolution?.requiresSelection && !draft.resolution?.selectedEntityId) {
    return { ok: false, error: 'Select a matching business before confirming' };
  }

  if (!draft.mode) {
    return { ok: false, error: 'Mode (EXISTING or INTENDED) is required before confirmation' };
  }

  let ctx = projectIdentityFromKnowledge({
    ...draft,
    identity: { ...draft.identity },
    knowledge: [...(draft.knowledge || [])],
  });

  const now = new Date().toISOString();
  const summary =
    ctx.mode === BUSINESS_CONTEXT_MODES.INTENDED
      ? `Business idea: ${ctx.identity.name || ctx.identity.businessType || 'Untitled'} — ${ctx.identity.location || 'location TBD'}`
      : `Existing business: ${ctx.identity.name || ctx.identity.businessType || 'Untitled'} — ${ctx.identity.location || 'location TBD'}`;

  ctx = {
    ...ctx,
    status: BUSINESS_CONTEXT_STATUS.CONFIRMED,
    confirmation: {
      confirmed: true,
      confirmedAt: now,
      confirmedBy: 'user',
      summary,
    },
    updatedAt: now,
    phase: 'A',
  };

  // Freeze provenance: knowledge array is retained as-is (must survive confirmation)
  return {
    ok: true,
    nextStep: 'confirmed',
    message: 'Business context confirmed',
    context: ctx,
  };
}

/**
 * Understand BusinessContext from natural language (Phase A — UNDERSTAND only).
 * Reuses Places free-text via entity resolver for EXISTING; never Places-resolves INTENDED as "found".
 */

import { classifyBusiness } from '../../services/mi/classifyBusinessService.js';
import { resolveBusinessEntity } from '../storeResearch/businessEntityResolver.js';
import {
  assessBusinessContextSufficiency,
} from './businessContextSufficiency.js';
import { KNOWLEDGE_STATES, canOverwriteKnowledgeState } from './knowledgeStates.js';
import { parseBusinessInput } from './parseBusinessInput.js';
import {
  BUSINESS_CONTEXT_MODES,
  BUSINESS_CONTEXT_STATUS,
  createEmptyBusinessContext,
  createKnowledgeItem,
  projectIdentityFromKnowledge,
} from './types.js';

/**
 * Upsert knowledge respecting authority (never overwrite USER_DEFINED with weaker).
 * @param {import('./types.js').KnowledgeItem[]} list
 * @param {import('./types.js').KnowledgeItem} item
 */
export function upsertKnowledge(list, item) {
  const cleaned = list.filter((k) => {
    if (k.field !== item.field) return true;
    return !canOverwriteKnowledgeState(k.knowledgeState, item.knowledgeState);
  });
  cleaned.push(item);
  return cleaned;
}

/**
 * @param {{
 *   text: string,
 *   modeHint?: 'EXISTING' | 'INTENDED' | null,
 *   websiteHint?: string | null,
 *   skipResolution?: boolean,
 * }} input
 * @param {{
 *   resolveBusinessEntity?: typeof resolveBusinessEntity,
 *   classifyBusiness?: typeof classifyBusiness,
 * }} [deps]
 */
export async function understandBusinessContext(input, deps = {}) {
  const resolve = deps.resolveBusinessEntity || resolveBusinessEntity;
  const classify = deps.classifyBusiness || classifyBusiness;

  const parsed = parseBusinessInput(input.text, { modeHint: input.modeHint ?? null });
  let ctx = createEmptyBusinessContext({
    sourceText: parsed.sourceText,
    knowledge: [...parsed.knowledge],
    mode: parsed.mode,
    status: BUSINESS_CONTEXT_STATUS.DRAFT,
    missingCritical: parsed.missingCritical,
    confidence: parsed.modeConfidence || 0.4,
  });

  if (input.websiteHint && !parsed.website) {
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'website',
        value: String(input.websiteHint).trim(),
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'user_website_hint',
        confidence: 1,
      }),
    );
  }

  if (parsed.needsModeClarification && !parsed.mode) {
    ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_MODE;
    ctx = projectIdentityFromKnowledge(ctx);
    return {
      ok: true,
      nextStep: 'clarify_mode',
      message: "Is this an existing business or one you're planning to create?",
      clarification: {
        question: "Is this an existing business or one you're planning to create?",
        options: [
          { id: 'EXISTING', label: 'Existing business' },
          { id: 'INTENDED', label: 'Business idea' },
        ],
      },
      context: ctx,
      ui: {
        headline: 'Tell us a bit more',
        tone: 'clarify',
      },
    };
  }

  // Classification (reuse existing classifier; heuristic/AI — mark AI_INFERENCE)
  try {
    const classified = await classify({
      businessName: parsed.name || '',
      businessType: parsed.businessType || parsed.name || '',
      location: parsed.location || '',
      notes: parsed.sourceText,
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
      if (!parsed.businessType && classified.businessDescriptionShort) {
        ctx.knowledge = upsertKnowledge(
          ctx.knowledge,
          createKnowledgeItem({
            field: 'businessType',
            value: classified.businessDescriptionShort.slice(0, 80),
            knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
            source: 'classifyBusiness',
            confidence: classified.confidence,
          }),
        );
      }
      ctx.confidence = Math.max(ctx.confidence, classified.confidence || 0);
    }
  } catch {
    // Classification is best-effort in Phase A
  }

  ctx = projectIdentityFromKnowledge(ctx);

  if (ctx.mode === BUSINESS_CONTEXT_MODES.INTENDED) {
    ctx.resolution = {
      status: 'skipped',
      candidates: [],
      selectedEntityId: null,
      notes: ['Intended business — Places resolution skipped (concept understanding only)'],
      confidence: 0,
      requiresSelection: false,
    };
    ctx.missingCritical = computeMissing(ctx);
    return buildConfirmResponse(
      ctx,
      "Here's how I understand the business you want to create.",
      {
        headline: "Here's how I understand your business idea",
        tone: 'intended',
        showFields: ['name', 'businessType', 'category', 'location', 'operatingModel'],
      },
    );
  }

  // EXISTING — resolve via Places free-text + entity resolver (no deep crawl)
  if (input.skipResolution) {
    ctx.resolution = {
      status: 'unresolved',
      candidates: [],
      notes: ['Resolution skipped by caller'],
      requiresSelection: false,
      confidence: 0,
      selectedEntityId: null,
    };
    ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
    return buildConfirmResponse(ctx, 'We think this is your business', {
      headline: 'We think this is your business',
      tone: 'existing',
      showFields: ['name', 'businessType', 'location', 'website'],
      fallbacks: ['enter_website', 'adjust_details', 'continue_with_description'],
    });
  }

  const resolveName = ctx.identity.name || ctx.identity.businessType || parsed.sourceText;
  let resolution;
  try {
    resolution = await resolve({
      businessName: resolveName,
      location: ctx.identity.location || undefined,
      websiteHint: ctx.identity.website || input.websiteHint || undefined,
    });
  } catch (err) {
    resolution = {
      candidates: [],
      confidence: 0,
      requiresOwnerConfirmation: true,
      resolutionNotes: [`Entity resolution failed: ${err?.message || 'unknown'}`],
    };
  }

  const candidates = (resolution.candidates || []).map((c) => ({
    entityId: c.entityId,
    name: c.name,
    website: c.website ?? null,
    location: c.location ?? null,
    phone: c.phone ?? null,
    placeId: c.placeId ?? null,
    confidence: c.confidence,
    matchReasons: c.matchReasons || [],
    source: c.source || 'places',
  }));

  // Never invent website — only attach DISCOVERED_FACT from selected/strong candidate later
  const ambiguous =
    candidates.length > 1 &&
    (resolution.requiresOwnerConfirmation !== false) &&
    !(
      resolution.selectedCandidate &&
      candidates.length === 1
    );

  const multiPlausible =
    candidates.length > 1 &&
    candidates[0] &&
    candidates[1] &&
    candidates[0].confidence - candidates[1].confidence < 0.12;

  if (candidates.length === 0) {
    ctx.resolution = {
      status: 'unresolved',
      candidates: [],
      selectedEntityId: null,
      notes: resolution.resolutionNotes || ['No Places match'],
      confidence: 0,
      requiresSelection: false,
    };
    ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
    ctx.missingCritical = computeMissing(ctx);
    ctx = projectIdentityFromKnowledge(ctx);
    return {
      ok: true,
      nextStep: 'unresolved_fallbacks',
      message: "We couldn't find a matching listing. You can enter a website, adjust details, or continue with your description.",
      context: ctx,
      ui: {
        headline: 'We think this is your business',
        tone: 'existing_unresolved',
        showFields: ['name', 'businessType', 'location', 'website'],
        fallbacks: ['enter_website', 'adjust_details', 'continue_with_description'],
      },
    };
  }

  if (multiPlausible || (ambiguous && candidates.length > 1 && !resolution.selectedCandidate)) {
    ctx.resolution = {
      status: 'ambiguous',
      candidates,
      selectedEntityId: null,
      notes: resolution.resolutionNotes || ['Multiple plausible matches'],
      confidence: resolution.confidence || candidates[0]?.confidence || 0,
      requiresSelection: true,
    };
    ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_RESOLUTION;
    ctx = projectIdentityFromKnowledge(ctx);
    return {
      ok: true,
      nextStep: 'select_candidate',
      message: 'We found a few possible matches.',
      context: ctx,
      ui: {
        headline: 'We found a few possible matches.',
        tone: 'existing_ambiguous',
        showFields: ['name', 'location', 'website'],
      },
    };
  }

  // Strong / soft singleton — still require confirmation; never silent auto-select as confirmed
  const selected = resolution.selectedCandidate || candidates[0];
  if (selected) {
    applyDiscoveredCandidate(ctx, selected);
  }

  ctx.resolution = {
    status: 'matched',
    candidates,
    selectedEntityId: selected?.entityId || null,
    notes: resolution.resolutionNotes || [],
    confidence: selected?.confidence || resolution.confidence || 0,
    requiresSelection: false,
  };
  ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
  ctx.confidence = Math.max(ctx.confidence, selected?.confidence || 0);
  ctx.missingCritical = computeMissing(ctx);
  ctx = projectIdentityFromKnowledge(ctx);

  return buildConfirmResponse(ctx, 'We think this is your business', {
    headline: 'We think this is your business',
    tone: 'existing',
    showFields: ['name', 'businessType', 'location', 'website'],
  });
}

/**
 * Gate confirm path when business type/identity is too generic for useful analysis.
 * @param {import('./types.js').BusinessContext} ctx
 * @param {string} message
 * @param {Record<string, unknown>} ui
 */
function buildConfirmResponse(ctx, message, ui) {
  ctx = projectIdentityFromKnowledge(ctx);
  const sufficiency = assessBusinessContextSufficiency(ctx);
  if (!sufficiency.sufficient && sufficiency.question) {
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'typeClarificationPrompt',
        value: sufficiency.question,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        source: 'type_sufficiency_gate',
        confidence: 0.95,
      }),
    );
    ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_TYPE;
    ctx.missingCritical = computeMissing(ctx);
    return {
      ok: true,
      nextStep: 'clarify_type',
      message: sufficiency.question,
      clarification: {
        question: sufficiency.question,
        inputType: 'free_text',
        key: sufficiency.clarificationKey || 'business_type_specificity',
      },
      context: ctx,
      ui: {
        headline: 'Tell us a bit more',
        tone: 'clarify_type',
      },
    };
  }

  ctx.status = BUSINESS_CONTEXT_STATUS.AWAITING_CONFIRMATION;
  ctx.missingCritical = computeMissing(ctx);
  return {
    ok: true,
    nextStep: 'confirm',
    message,
    context: ctx,
    ui,
  };
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 * @param {import('./types.js').ResolutionCandidate} selected
 */
export function applyDiscoveredCandidate(ctx, selected) {
  if (selected.name) {
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'name',
        value: selected.name,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        source: selected.source || 'places',
        confidence: selected.confidence,
      }),
    );
  }
  if (selected.location) {
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'location',
        value: selected.location,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        source: selected.source || 'places',
        confidence: selected.confidence,
      }),
    );
  }
  if (selected.website) {
    ctx.knowledge = upsertKnowledge(
      ctx.knowledge,
      createKnowledgeItem({
        field: 'website',
        value: selected.website,
        knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
        source: selected.source || 'places',
        confidence: selected.confidence,
        note: 'Website from public listing — not invented',
      }),
    );
  }
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 */
function computeMissing(ctx) {
  const missing = [];
  if (!ctx.mode) missing.push('mode');
  if (!ctx.identity.businessType && !ctx.identity.name) missing.push('businessType');
  if (!ctx.identity.location) missing.push('location');
  return missing;
}

/**
 * @param {string} group
 * @param {string} [slug]
 */
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

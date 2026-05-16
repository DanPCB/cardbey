/**
 * Central intent resolution: classifier + ontology + extractors → structured result.
 * Does not execute tools or bypass validation/policy.
 */

import { CONFIDENCE_HIGH } from './intakeExecutionPolicy.js';
import { getToolEntry, isRegisteredTool } from './intakeToolRegistry.js';
import { INTENT_SUBTYPES, inferFamilyFromTool } from './intakeIntentOntology.js';
import { runIntentExtractors } from './intakeIntentExtractors.js';
import {
  isHeroImageChangeMessage,
  historyImpliesPriorHeroImageIntent,
  isHeroImageVisualFollowUpMessage,
} from './intakeHeroImageClarify.js';
import {
  persistedIntentRowValidForRequest,
  strongOntologyOverridesPersisted,
  STRONG_ONTOLOGY_SCORE,
} from './intakePersistedIntentStore.js';

const PCT_RE = /(\d+(?:\.\d+)?)\s*%/i;

/** Subtypes allowed for short referential follow-ups when persisted intent matches. */
const PERSISTED_REFINEMENT_SUBTYPES = new Set(['change_headline', 'set_discount', 'website_content']);

/**
 * Short / referential follow-up (works with persisted lane when ontology score is weak).
 * @param {string} userMessage
 */
function isGenericRefinementFollowUp(userMessage) {
  const s = String(userMessage ?? '').trim();
  if (!s || s.length > 140) return false;
  const lower = s.toLowerCase();
  if (/\b(run|execute)\s+(it|this|that)\b/i.test(lower)) return true;
  if (/\bchange\s+it\s+to\b/i.test(lower)) return true;
  if (/\bsame\s+(thing\s+)?(but\s+)?for\b/i.test(lower)) return true;
  if (/\bfor\s+facebook\b/i.test(lower) || /\bon\s+facebook\b/i.test(lower)) return true;
  if (/\bmake\s+it\s+(shorter|longer|better|clearer|simpler|modern)\b/i.test(lower)) return true;
  if (/\binstead\b/i.test(lower) && s.length < 90) return true;
  if (/\b(use|try)\s+a\b/i.test(lower) && s.length < 100) return true;
  if (/\b\d+\s*%\b/.test(s) && s.length < 120) return true;
  return false;
}

/**
 * @param {typeof INTENT_SUBTYPES[number]} st
 * @param {string} resolverReason
 * @param {number} [confBase]
 */
function buildOntologyLikeResult(st, userMessage, storeId, draftId, extractedBase, extractorsUsed, resolverReason, confBase = 0.85) {
  const candidates = st.candidateTools.filter((t) => isRegisteredTool(t));
  let defaultT = candidates.includes(st.defaultTool) ? st.defaultTool : candidates[0] ?? null;
  if (st.subtype === 'create_store_flow' && !storeId) {
    const greenfield = candidates.find((t) => {
      const e = getToolEntry(t);
      return Boolean(e && !e.requiresStore);
    });
    if (greenfield) defaultT = greenfield;
  }
  const missing = computeMissingContext(st.requiredContext, storeId, draftId);
  const extractedParameters = buildParamsForSubtype(st, userMessage, extractedBase);
  return {
    family: st.family,
    subtype: st.subtype,
    candidateTools: candidates,
    chosenTool: defaultT,
    extractedParameters,
    missingContext: missing,
    confidence: confBase,
    recovered: Boolean(defaultT),
    extractorsUsed,
    resolverReason,
  };
}

/**
 * @param {IntentResolutionResult} base
 * @param {{ used?: boolean, overridden?: boolean, loadedFamily?: string | null, loadedSubtype?: string | null }} ctx
 * @param {object | null} [persistedLoaded] row from get/set store (valid for request), for divergence telemetry
 */
function finalizeIntentResult(base, ctx, persistedLoaded = null) {
  let overridden = Boolean(ctx.overridden);
  if (
    persistedLoaded &&
    typeof persistedLoaded.subtype === 'string' &&
    persistedLoaded.subtype &&
    base.subtype &&
    String(base.subtype) !== String(persistedLoaded.subtype) &&
    !ctx.used
  ) {
    overridden = true;
  }
  return {
    ...base,
    persistedIntentUsed: Boolean(ctx.used),
    persistedIntentOverridden: overridden,
    persistedIntentFamily: ctx.loadedFamily ?? null,
    persistedIntentSubtype: ctx.loadedSubtype ?? null,
  };
}

/**
 * @typedef {object} IntentResolutionResult
 * @property {string | null} family
 * @property {string | null} subtype
 * @property {string[]} candidateTools
 * @property {string | null} chosenTool
 * @property {Record<string, unknown>} extractedParameters
 * @property {string[]} missingContext
 * @property {number} confidence
 * @property {boolean} recovered
 * @property {string[]} extractorsUsed
 * @property {string | null} resolverReason
 */

/**
 * @param {string[]} required
 * @param {string | null} storeId
 * @param {string | null} draftId
 */
function computeMissingContext(required, storeId, draftId) {
  const missing = [];
  for (const r of required) {
    if (r === 'store' && !storeId) missing.push('store');
    if (r === 'draft' && !draftId) missing.push('draft');
  }
  return missing;
}

/**
 * @param {typeof INTENT_SUBTYPES[number]} subtypeDef
 * @param {string} userMessage
 * @param {Record<string, unknown>} baseParams
 */
function buildParamsForSubtype(subtypeDef, userMessage, baseParams) {
  const out = { ...baseParams };
  const lower = userMessage.toLowerCase();

  if (subtypeDef.subtype === 'change_hero_image' && subtypeDef.defaultTool === 'improve_hero') {
    out.focus = userMessage;
    if (!String(out.description ?? '').trim()) out.description = userMessage;
  }

  if (subtypeDef.defaultTool === 'code_fix') {
    out.description = userMessage;
    if (baseParams.replacementValue && typeof baseParams.replacementValue === 'string') {
      out.description = `${userMessage} (target: ${baseParams.replacementValue})`;
    }
  }

  if (subtypeDef.defaultTool === 'create_offer') {
    out.description = userMessage;
    const pct = userMessage.match(PCT_RE);
    const highlight = pct ? `${userMessage} (highlight: ${pct[1]}% offer)` : userMessage;
    out.campaignContext = highlight;
  }

  if (subtypeDef.defaultTool === 'orders_report') {
    if (/\b(day|daily|today)\b/i.test(lower)) out.groupBy = 'day';
    if (/\b(week|weekly)\b/i.test(lower)) out.groupBy = 'week';
    if (baseParams.targetPercent && /\btarget\b/i.test(lower)) out.targetValue = baseParams.targetPercent;
  }

  return out;
}

/**
 * Score ontology subtypes against the user message.
 * @param {string} userMessage
 */
function rankSubtypes(userMessage) {
  const lower = userMessage.toLowerCase();
  const ranked = [];
  for (const st of INTENT_SUBTYPES) {
    let score = 0;
    for (const re of st.matchPatterns) {
      if (re.test(userMessage)) score += 2;
    }
    if (st.family === 'content_edit' && /\b(image|photo|picture|logo)\b/i.test(lower)) {
      score = Math.max(0, score - 3);
    }
    if (st.subtype === 'improve_store_general' && /\b(photo|image|picture|banner|hero|cover|background)\b/i.test(lower)) {
      score = Math.max(0, score - 4);
    }
    ranked.push({ st, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * @param {string} userMessage
 * @param {string | null} storeId
 * @param {string | null} draftId
 * @param {Record<string, unknown>} extractedBase
 * @param {string[]} extractorsUsed
 * @param {string} resolverReason
 */
function resolveChangeHeroImageSubtype(userMessage, storeId, draftId, extractedBase, extractorsUsed, resolverReason) {
  const st = INTENT_SUBTYPES.find((s) => s.subtype === 'change_hero_image');
  if (!st) return null;
  const candidates = st.candidateTools.filter((t) => isRegisteredTool(t));
  const defaultT = candidates.includes(st.defaultTool) ? st.defaultTool : candidates[0] ?? null;
  const missing = computeMissingContext(st.requiredContext, storeId, draftId);
  const extractedParameters = buildParamsForSubtype(st, userMessage, extractedBase);
  return {
    family: st.family,
    subtype: st.subtype,
    candidateTools: candidates,
    chosenTool: defaultT,
    extractedParameters,
    missingContext: missing,
    confidence: 0.88,
    recovered: Boolean(defaultT),
    extractorsUsed,
    resolverReason,
  };
}

/**
 * Legacy heuristics when ontology scores 0 (keeps parity with prior recovery).
 */
function legacyHeuristicResolution(userMessage, extractedParams, extractorsUsed) {
  const lower = userMessage.toLowerCase();

  const textFix =
    /\b(headline|hero|title|tagline|subtitle|wording|copy|text|rename|rewrite|fix\s+the\s+text|change\s+the\s+text)\b/i.test(
      userMessage,
    ) || /\bfix\s+headline\b/i.test(userMessage);
  if (textFix && !/\b(image|photo|picture|logo)\b/i.test(lower) && isRegisteredTool('code_fix')) {
    return {
      family: 'content_edit',
      subtype: 'change_headline',
      candidateTools: ['code_fix', 'improve_hero'],
      chosenTool: 'code_fix',
      extractedParameters: { ...extractedParams, description: userMessage },
      missingContext: [],
      confidence: 0.82,
      recovered: true,
      extractorsUsed,
      resolverReason: 'legacy_text_heuristic',
    };
  }

  const offerHints =
    /\b(sale|discount|offer|promo|coupon|%|percent|percentage|markdown|off\s+for)\b/i.test(userMessage) ||
    /\btarget\b.*\d/.test(lower);
  if (offerHints && isRegisteredTool('create_offer')) {
    const pct = userMessage.match(PCT_RE);
    const campaignContext = pct ? `${userMessage} (highlight: ${pct[1]}% offer)` : userMessage;
    return {
      family: 'promotion_campaign',
      subtype: 'set_discount',
      candidateTools: ['create_offer', 'create_promotion'],
      chosenTool: 'create_offer',
      extractedParameters: {
        ...extractedParams,
        description: userMessage,
        campaignContext,
      },
      missingContext: [],
      confidence: 0.82,
      recovered: true,
      extractorsUsed,
      resolverReason: 'legacy_offer_heuristic',
    };
  }

  const reportHints =
    /\b(report|reports|sales|revenue|orders|analytics|how\s+(many|much)|kpi|metric)\b/i.test(userMessage);
  if (reportHints && isRegisteredTool('orders_report')) {
    const parameters = { ...extractedParams };
    if (/\b(day|daily|today)\b/i.test(lower)) parameters.groupBy = 'day';
    if (/\b(week|weekly)\b/i.test(lower)) parameters.groupBy = 'week';
    const pct = userMessage.match(PCT_RE);
    if (pct && /\btarget\b/i.test(lower)) parameters.targetValue = `${pct[1]}%`;
    return {
      family: 'analytics_reporting',
      subtype: 'sales_orders_report',
      candidateTools: ['orders_report', 'analyze_store'],
      chosenTool: 'orders_report',
      extractedParameters: parameters,
      missingContext: [],
      confidence: 0.82,
      recovered: true,
      extractorsUsed,
      resolverReason: 'legacy_report_heuristic',
    };
  }

  return null;
}

function classifierStrong(classification) {
  const conf =
    typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
      ? classification.confidence
      : 0;
  const path = String(classification.executionPath ?? '');
  const tool = String(classification.tool ?? '').trim();
  return conf >= CONFIDENCE_HIGH && path !== 'clarify' && path !== 'chat' && isRegisteredTool(tool);
}

/**
 * @param {{
 *   userMessage: string,
 *   classification: object,
 *   storeId?: string | null,
 *   draftId?: string | null,
 *   conversationHistory?: Array<{ role?: string, content?: string }>,
 *   persistedIntentResolution?: object | null,
 * }} input
 * @returns {IntentResolutionResult}
 */
export function resolveIntent(input) {
  const userMessage = String(input?.userMessage ?? '').trim();
  const classification = input?.classification && typeof input.classification === 'object' ? input.classification : {};
  const storeId = input?.storeId ?? null;
  const draftId = input?.draftId ?? null;
  const conversationHistory = Array.isArray(input?.conversationHistory) ? input.conversationHistory : [];
  const rawPersisted = input?.persistedIntentResolution;
  const persistedLoaded =
    rawPersisted && typeof rawPersisted === 'object' && persistedIntentRowValidForRequest(rawPersisted, { storeId, draftId })
      ? rawPersisted
      : null;

  const { params: extractedBase, used: extractorsUsed } = runIntentExtractors(userMessage);

  const rankedEarly = rankSubtypes(userMessage);
  const topEarly = rankedEarly[0] || null;
  const strongNewTask = Boolean(topEarly && topEarly.score >= STRONG_ONTOLOGY_SCORE);

  const persistedCtx = {
    used: false,
    overridden: Boolean(persistedLoaded && strongOntologyOverridesPersisted(topEarly, persistedLoaded)),
    loadedFamily: persistedLoaded?.family ?? null,
    loadedSubtype: persistedLoaded?.subtype ?? null,
  };

  const priorSubtype = classification._intentResolution?.subtype;
  const historyHero = historyImpliesPriorHeroImageIntent(conversationHistory);
  const clsHero = priorSubtype === 'change_hero_image';
  const rowHero =
    Boolean(persistedLoaded) && String(persistedLoaded.subtype) === 'change_hero_image';
  const heroVisualOrExplicit =
    isHeroImageChangeMessage(userMessage) || isHeroImageVisualFollowUpMessage(userMessage);

  const priorHeroSession =
    !strongNewTask &&
    heroVisualOrExplicit &&
    (historyHero || clsHero || rowHero);

  if (priorHeroSession && rowHero && !historyHero && !clsHero) {
    persistedCtx.used = true;
  }

  if (priorHeroSession && heroVisualOrExplicit) {
    const continuity = resolveChangeHeroImageSubtype(
      userMessage,
      storeId,
      draftId,
      extractedBase,
      extractorsUsed,
      'continuity:change_hero_image',
    );
    if (continuity) return finalizeIntentResult(continuity, persistedCtx, persistedLoaded);
  }

  if (!userMessage) {
    return finalizeIntentResult(
      {
        family: null,
        subtype: null,
        candidateTools: [],
        chosenTool: null,
        extractedParameters: {},
        missingContext: [],
        confidence: 0,
        recovered: false,
        extractorsUsed,
        resolverReason: 'empty_message',
      },
      persistedCtx,
      persistedLoaded,
    );
  }

  if (
    !strongNewTask &&
    persistedLoaded &&
    isGenericRefinementFollowUp(userMessage) &&
    persistedLoaded.subtype &&
    PERSISTED_REFINEMENT_SUBTYPES.has(String(persistedLoaded.subtype))
  ) {
    const st = INTENT_SUBTYPES.find((s) => s.subtype === persistedLoaded.subtype);
    if (st) {
      persistedCtx.used = true;
      const r = buildOntologyLikeResult(
        st,
        userMessage,
        storeId,
        draftId,
        extractedBase,
        extractorsUsed,
        'continuity:persisted_subtype',
        0.86,
      );
      return finalizeIntentResult(r, persistedCtx, persistedLoaded);
    }
  }

  const createStoreFlowDef = INTENT_SUBTYPES.find((s) => s.subtype === 'create_store_flow');
  const createStorePatternHit = Boolean(
    createStoreFlowDef &&
      Array.isArray(createStoreFlowDef.matchPatterns) &&
      createStoreFlowDef.matchPatterns.some((re) => re.test(userMessage)),
  );
  const misappliedStoreImprovementTools = new Set([
    'analyze_store',
    'improve_hero',
    'rewrite_descriptions',
    'generate_tags',
  ]);

  if (
    classifierStrong(classification) &&
    !(
      createStorePatternHit &&
      misappliedStoreImprovementTools.has(String(classification.tool ?? '').trim())
    )
  ) {
    const tool = String(classification.tool ?? '').trim();

    const fe = getToolEntry(tool);
    const mergedParams = {
      ...(classification.parameters && typeof classification.parameters === 'object' ? classification.parameters : {}),
      ...extractedBase,
    };

    let family = inferFamilyFromTool(tool);
    let subtype = null;
    let resolverReason = 'classifier_strong';

    if (tool === 'improve_hero') {
      const topRanked = rankSubtypes(userMessage)[0];
      const heroOntologyWins =
        topRanked?.st?.subtype === 'change_hero_image' && topRanked.score > 0;
      const heroLaneHint =
        !strongNewTask &&
        (historyHero ||
          clsHero ||
          rowHero ||
          isHeroImageChangeMessage(userMessage) ||
          isHeroImageVisualFollowUpMessage(userMessage));
      if (heroOntologyWins || heroLaneHint) {
        family = 'website_edit';
        subtype = 'change_hero_image';
        resolverReason = 'classifier_strong:hero_image';
      }
    }

    return finalizeIntentResult(
      {
        family,
        subtype,
        candidateTools: [tool],
        chosenTool: tool,
        extractedParameters: mergedParams,
        missingContext: computeMissingContext(
          fe?.requiresStore ? ['store'] : [],
          storeId,
          draftId,
        ),
        confidence: classification.confidence,
        recovered: false,
        extractorsUsed,
        resolverReason,
      },
      persistedCtx,
      persistedLoaded,
    );
  }

  const ranked = rankSubtypes(userMessage);
  const best = ranked[0];
  if (best && best.score > 0) {
    const st = best.st;
    const candidates = st.candidateTools.filter((t) => isRegisteredTool(t));
    let defaultT = candidates.includes(st.defaultTool) ? st.defaultTool : candidates[0] ?? null;
    if (st.subtype === 'create_store_flow' && !storeId) {
      const greenfield = candidates.find((t) => {
        const e = getToolEntry(t);
        return Boolean(e && !e.requiresStore);
      });
      if (greenfield) defaultT = greenfield;
    }
    const missing = computeMissingContext(st.requiredContext, storeId, draftId);
    const extractedParameters = buildParamsForSubtype(st, userMessage, extractedBase);
    const recovered = Boolean(defaultT);

    return finalizeIntentResult(
      {
        family: st.family,
        subtype: st.subtype,
        candidateTools: candidates,
        chosenTool: defaultT,
        extractedParameters,
        missingContext: missing,
        confidence: 0.78 + Math.min(best.score * 0.02, 0.12),
        recovered,
        extractorsUsed,
        resolverReason: `ontology:${st.family}/${st.subtype}`,
      },
      persistedCtx,
      persistedLoaded,
    );
  }

  const legacy = legacyHeuristicResolution(userMessage, extractedBase, extractorsUsed);
  if (legacy) return finalizeIntentResult(legacy, persistedCtx, persistedLoaded);

  const help = INTENT_SUBTYPES.find((s) => s.family === 'general_help');
  const fallbackCandidates = help ? help.candidateTools.filter((t) => isRegisteredTool(t)) : [];

  return finalizeIntentResult(
    {
      family: null,
      subtype: null,
      candidateTools: fallbackCandidates,
      chosenTool: null,
      extractedParameters: extractedBase,
      missingContext: [],
      confidence: typeof classification.confidence === 'number' ? classification.confidence : 0,
      recovered: false,
      extractorsUsed,
      resolverReason: 'unresolved',
    },
    persistedCtx,
    persistedLoaded,
  );
}

/**
 * Merge resolver output into classification for validation/policy (recovery path).
 * @param {object} classification
 * @param {IntentResolutionResult} resolution
 */
export function mergeIntentResolutionIntoClassification(classification, resolution) {
  if (!resolution?.recovered || !resolution.chosenTool || !isRegisteredTool(resolution.chosenTool)) {
    return classification;
  }
  const fe = getToolEntry(resolution.chosenTool);
  if (!fe) return classification;
  const prevConf =
    typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
      ? classification.confidence
      : 0;
  return {
    ...classification,
    tool: resolution.chosenTool,
    parameters: {
      ...(classification.parameters && typeof classification.parameters === 'object' ? classification.parameters : {}),
      ...(resolution.extractedParameters && typeof resolution.extractedParameters === 'object'
        ? resolution.extractedParameters
        : {}),
    },
    executionPath: fe.executionPath,
    confidence: Math.max(prevConf, resolution.confidence ?? CONFIDENCE_HIGH),
    clarifyOptions: undefined,
    message: undefined,
    _intentResolution: {
      family: resolution.family,
      subtype: resolution.subtype,
      resolverReason: resolution.resolverReason,
    },
  };
}

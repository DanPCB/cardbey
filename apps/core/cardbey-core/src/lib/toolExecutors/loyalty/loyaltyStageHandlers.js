/**
 * Loyalty topology stage handlers — typed tools for deterministic loyalty spine.
 * Each returns { status: 'ok', output } or { status: 'needs_input', missingFields, message }.
 */

import { gatherLoyaltyProgramContext } from './loyaltyProgramContext.js';
import {
  buildLoyaltyProgramDraftData,
  planLoyaltyProgramDraft,
  applyCanonicalLoyaltyDraftFields,
} from './loyaltyProgramDraft.js';
import { persistLoyaltyProgramDraftToStore } from './persistLoyaltyProgramDraftToStore.js';
import {
  buildAttachmentAnalysis,
  detectLoyaltyCardVisualHints,
} from '../../intake/attachmentAnalysis.js';
import { ensureLoyaltyAttachmentAnalysisWithTopology } from '../../intake/intakeAttachmentBinding.js';
import {
  buildExecutionDraft,
  computeMissingFields,
  assertNoStaleMissingFields,
  computeLoyaltyPauseFields,
  requiresTopologyOwnerReview,
} from '../../mission/topologyExecutionDraft.js';
import { persistAndEmitLoyaltyProgramDraftArtifact } from './loyaltyProgramDraftArtifactService.js';
import { Features } from '../../../config/features.js';
import { asMissionEvidenceGraph } from '../../mission/missionEvidenceGraph.js';
import { validateGraphContractConsistency } from '../../mission/missionValidator.js';
import { readMetadata } from '../../persistence/metadataWriter.js';
import {
  loadLoyaltyEvidenceContext,
  mergeGraphPreseedIntoPriors,
  syncLoyaltyStageToGraph,
  graphToLegacyEvidenceView,
  normalizeToUnifiedGraph,
} from '../../evidence/missionEvidenceGraphService.js';
import { buildLoyaltyCreationContract, loyaltyCreationContractToDraft } from '../../loyalty/loyaltyCreationContract.js';
import { hasAuthoritativeLoyaltyTopology } from '../../loyalty/loyaltyContractDiagnostics.js';
import {
  emitLoyaltyProgressiveArtifact,
  progressivePartialFromDraft,
  progressivePartialFromStoreContext,
} from './loyaltyProgressiveArtifact.js';
import { writeMetadata } from '../../persistence/metadataWriter.js';
import { randomUUID } from 'node:crypto';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function priorOutputs(context) {
  const bag = context?.stepOutputs;
  return bag && typeof bag === 'object' && !Array.isArray(bag) ? bag : {};
}

function mergeFromPriors(toolOutputs, keys) {
  const out = {};
  for (const value of Object.values(toolOutputs)) {
    if (!value || typeof value !== 'object') continue;
    for (const key of keys) {
      if (value[key] != null && out[key] == null) out[key] = value[key];
    }
  }
  return out;
}

/**
 * Phase 1: prefer graph-backed evidence when legacy priors are absent.
 *
 * @param {string | undefined} missionId
 * @param {Record<string, unknown>} priors
 */
async function enrichPriorsFromGraph(missionId, priors = {}, context = {}) {
  if (!Features.phase1.graphWriteTarget) return priors;
  const mid = pickString(missionId);
  if (!mid) return priors;
  try {
    const memoryGraph =
      context.missionEvidenceGraph && typeof context.missionEvidenceGraph === 'object'
        ? graphToLegacyEvidenceView(normalizeToUnifiedGraph(context.missionEvidenceGraph))
        : null;
    const graphCtx = memoryGraph ?? (await loadLoyaltyEvidenceContext(mid));
    if (!graphCtx) return priors;
    return {
      ...priors,
      preseededDraft: mergeGraphPreseedIntoPriors(priors.preseededDraft, graphCtx.preseededDraft),
      attachmentAnalysis: (() => {
        const fromGraph = graphCtx.attachmentAnalysis;
        const fromPriors = priors.attachmentAnalysis;
        if (!fromGraph && !fromPriors) return null;
        if (!fromPriors) return fromGraph;
        if (!fromGraph) return fromPriors;
        return {
          ...fromPriors,
          ...fromGraph,
          preseededDraft: mergeGraphPreseedIntoPriors(
            fromPriors.preseededDraft,
            fromGraph.preseededDraft ?? graphCtx.preseededDraft,
          ),
        };
      })(),
      missionEvidenceGraph: graphCtx.graph ?? context.missionEvidenceGraph ?? null,
    };
  } catch {
    return priors;
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/**
 * Resolved topology store wins; ambient/session context is fallback only.
 *
 * Order:
 * 1. priors.storeContext.storeId
 * 2. missionContract.executionContext.storeId
 * 3. rawDraft.storeId
 * 4. input.storeId
 * 5. context.storeId
 *
 * @param {{
 *   priors?: Record<string, unknown>;
 *   input?: Record<string, unknown>;
 *   context?: Record<string, unknown>;
 *   rawDraft?: Record<string, unknown> | null;
 *   missionContract?: Record<string, unknown> | null;
 * }} args
 */
export function resolveLoyaltyTopologyStoreId(args = {}) {
  const priors = asRecord(args.priors) ?? {};
  const input = asRecord(args.input) ?? {};
  const context = asRecord(args.context) ?? {};
  const rawDraft = asRecord(args.rawDraft);
  const storeContext = asRecord(priors.storeContext) ?? asRecord(input.storeContext);
  const missionContract =
    asRecord(args.missionContract) ??
    asRecord(priors.missionContract) ??
    asRecord(context.missionContract) ??
    asRecord(input.missionContract);
  const contractExec = asRecord(missionContract?.executionContext);

  const topologyStoreId = pickString(
    storeContext?.storeId,
    contractExec?.storeId,
    missionContract?.storeId,
    rawDraft?.storeId,
    input.storeId,
  );
  const ambientStoreId = pickString(context.storeId);

  if (topologyStoreId && ambientStoreId && topologyStoreId !== ambientStoreId) {
    console.warn(
      `[loyalty.store_resolution] stale context.storeId ignored preferred=${topologyStoreId} ambient=${ambientStoreId}`,
    );
  }

  return topologyStoreId || ambientStoreId || '';
}

function listMissingOwnerFields(draftLike) {
  return computeLoyaltyPauseFields(draftLike);
}

/**
 * True when attachment analysis already confirmed reward + stamps (smart defaults).
 * Prefer confirmedFields; also accept a complete executionDraft with high confidence.
 */
function executionDraftHasAttachmentConfirmedFields(executionDraft, attachmentAnalysis) {
  if (requiresTopologyOwnerReview(executionDraft)) return false;

  const draft = executionDraft && typeof executionDraft === 'object' ? executionDraft : null;
  const analysis =
    attachmentAnalysis && typeof attachmentAnalysis === 'object' ? attachmentAnalysis : null;
  if (!draft) return false;

  const reward = pickString(draft.reward, draft.rewardRule);
  const stamps = Number(draft.requiredStamps ?? draft.stampThreshold);
  const hasFields = Boolean(reward) && Number.isFinite(stamps) && stamps > 0;
  if (!hasFields) return false;

  const confirmed =
    analysis?.confirmedFields && typeof analysis.confirmedFields === 'object'
      ? analysis.confirmedFields
      : null;
  if (confirmed) {
    const cReward = pickString(confirmed.reward);
    const cStamps = Number(confirmed.requiredStamps ?? confirmed.stampThreshold);
    if (cReward && Number.isFinite(cStamps) && cStamps > 0) return true;
  }

  const confidence = Number(analysis?.confidence);
  if (Number.isFinite(confidence) && confidence >= 0.75) return true;

  // Owner / preseed already filled both — treat as confirmed for generate_draft path.
  if (!analysis && hasFields) return true;

  return false;
}

/**
 * Resolve canonical execution draft for a loyalty stage (never reads attachment missingFields).
 */
function resolveExecutionDraft(input = {}, context = {}, priors = {}) {
  if (input.executionDraft && typeof input.executionDraft === 'object') {
    return input.executionDraft;
  }
  if (context.executionDraft && typeof context.executionDraft === 'object') {
    return context.executionDraft;
  }
  const ownerInput =
    (input.ownerInput && typeof input.ownerInput === 'object' ? input.ownerInput : null) ||
    (context.ownerInput && typeof context.ownerInput === 'object' ? context.ownerInput : null) ||
    (priors.ownerInput && typeof priors.ownerInput === 'object' ? priors.ownerInput : null);
  return buildExecutionDraft({
    attachmentAnalysis: input.attachmentAnalysis ?? priors.attachmentAnalysis ?? null,
    preseededDraft:
      input.preseededDraft ??
      priors.preseededDraft ??
      priors.attachmentAnalysis?.preseededDraft ??
      context.preseededDraft ??
      null,
    ownerInput,
    loyaltyRequirements: input.loyaltyRequirements ?? priors.loyaltyRequirements ?? null,
    runtimeUpdates: priors.loyaltyDraft ?? null,
  });
}

/**
 * @param {string[]} missingFields
 * @param {string} [fallback]
 */
function suggestOwnerQuestion(missingFields, fallback) {
  const missing = Array.isArray(missingFields) ? missingFields : [];
  if (missing.includes('topology_review')) {
    return 'Review the detected card structure and reward rule before we continue.';
  }
  if (missing.includes('reward') && missing.includes('stampThreshold')) {
    return 'What reward should customers receive, and after how many stamps?';
  }
  if (missing.includes('reward')) {
    return 'What reward should customers receive after completing the card?';
  }
  if (missing.includes('stampThreshold')) {
    return 'How many stamps should customers collect before earning the reward?';
  }
  if (missing.includes('programName')) {
    return 'What should we call this loyalty program?';
  }
  return fallback || 'I need a couple more details to continue.';
}

/**
 * @param {string[]} missingFields
 * @param {Record<string, unknown>} [seed]
 */
function buildNeedsInputExtras(missingFields, seed = {}) {
  const prefilledValues = {};
  if (typeof seed.reward === 'string' && seed.reward.trim()) prefilledValues.reward = seed.reward.trim();
  if (seed.stampThreshold != null || seed.requiredStamps != null) {
    const n = Number(seed.stampThreshold ?? seed.requiredStamps);
    if (Number.isFinite(n) && n > 0) prefilledValues.stampThreshold = n;
  }
  if (typeof seed.programName === 'string' && seed.programName.trim()) {
    prefilledValues.programName = seed.programName.trim();
  }
  if (seed.rule && typeof seed.rule === 'object') prefilledValues.rule = seed.rule;
  if (seed.cardTopology && typeof seed.cardTopology === 'object') {
    prefilledValues.cardTopology = seed.cardTopology;
  }
  if (typeof seed.cardFooterText === 'string' && seed.cardFooterText.trim()) {
    prefilledValues.cardFooterText = seed.cardFooterText.trim();
  }
  return {
    suggestedQuestion: suggestOwnerQuestion(missingFields),
    resumeNodeId: null,
    prefilledValues,
  };
}

/** loyalty.load_store_context */
export async function executeLoadStoreContext(input = {}, context = {}) {
  const storeId = pickString(input.storeId, context.storeId);
  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'MISSING_STORE', message: 'Store id is required.' },
    };
  }
  try {
    const ctx = await gatherLoyaltyProgramContext({
      storeId,
      userId: context.userId,
      tenantId: context.tenantId,
    });
    const storeContext = {
      storeId,
      name: ctx.storeName ?? null,
      category: ctx.businessCategory ?? null,
      catalogSummary: Array.isArray(ctx.products)
        ? ctx.products.slice(0, 8).map((p) => p?.name).filter(Boolean)
        : [],
      existingOffers: ctx.promoHistory ?? [],
      customerCount: ctx.customerCount ?? 0,
      products: ctx.products ?? [],
      existingProgram: ctx.existingProgram ?? null,
      ...ctx,
    };
    const missionId = pickString(context.missionId);
    if (missionId) {
      try {
        await emitLoyaltyProgressiveArtifact(
          missionId,
          'store_loaded',
          progressivePartialFromStoreContext(storeContext),
        );
      } catch {
        /* progressive preview is best-effort */
      }
    }
    return {
      status: 'ok',
      output: { storeContext },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: 'STORE_CONTEXT_FAILED',
        message: err instanceof Error ? err.message : 'Could not load store context.',
      },
    };
  }
}

/** loyalty.analyze_attachment */
export async function executeAnalyzeAttachment(input = {}, context = {}) {
  let priors = mergeFromPriors(priorOutputs(context), ['attachmentAnalysis', 'preseededDraft']);
  priors = await enrichPriorsFromGraph(pickString(context.missionId), priors, context);
  const missionId = pickString(context.missionId);
  const meta =
    context.metadata && typeof context.metadata === 'object' ? context.metadata : {};
  const intakeEvidence =
    meta.intakeEvidence && typeof meta.intakeEvidence === 'object' ? meta.intakeEvidence : null;

  let existing =
    (input.attachmentAnalysis && typeof input.attachmentAnalysis === 'object'
      ? input.attachmentAnalysis
      : null) ||
    priors.attachmentAnalysis ||
    (context.attachmentAnalysis && typeof context.attachmentAnalysis === 'object'
      ? context.attachmentAnalysis
      : null);

  existing = await ensureLoyaltyAttachmentAnalysisWithTopology(existing, {
    evidenceId: pickString(
      input.evidenceId,
      meta.evidenceId,
      intakeEvidence?.evidenceId,
      existing?.evidenceId,
      existing?.preseededDraft?.evidenceId,
      priors.preseededDraft?.evidenceId,
    ),
    missionId,
    storeId: pickString(context.storeId, meta.storeId, input.storeId),
    imageRef: pickString(
      input.imageUrl,
      input.imageDataUrl,
      existing?.imageUrl,
      existing?.imageDataUrl,
      existing?.preseededDraft?.imageAssetId,
      intakeEvidence?.imageRef,
      meta.imageRef,
    ),
    attachmentId: pickString(
      input.attachmentId,
      existing?.attachmentId,
      existing?.preseededDraft?.attachmentId,
    ),
  });

  if (existing) {
    const existingTopology =
      existing.preseededDraft?.cardTopology ?? existing.cardTopology ?? null;
    if (hasAuthoritativeLoyaltyTopology(existingTopology)) {
      if (missionId) {
        try {
          await syncLoyaltyStageToGraph(missionId, {
            attachmentAnalysis: existing,
            preseededDraft: existing.preseededDraft ?? priors.preseededDraft ?? null,
            stage: 'loyalty.analyze_attachment',
          });
        } catch {
          /* graph sync is best-effort */
        }
      }
      return {
        status: 'ok',
        output: {
          attachmentAnalysis: existing,
          visualLoyaltyHints:
            existing.visualHints ??
            detectLoyaltyCardVisualHints({
              filename: existing.filename,
              ocrText: existing.ocrText,
              userMessage: input.objective ?? context.goal,
            }),
        },
      };
    }
  }

  try {
    const analysis = await buildAttachmentAnalysis({
      filename: input.filename ?? input.name ?? null,
      ocrText: input.ocrText ?? input.extractedText ?? existing?.ocrText ?? null,
      userMessage: pickString(input.objective, context.goal, input.text),
      preseededDraft:
        input.preseededDraft ?? existing?.preseededDraft ?? priors.preseededDraft ?? context.preseededDraft ?? null,
      imageDataUrl: input.imageDataUrl ?? existing?.imageDataUrl ?? null,
      imageUrl: input.imageUrl ?? existing?.imageUrl ?? null,
      attachmentOnlyUpload: Boolean(input.attachmentOnlyUpload),
      missionId,
      storeId: pickString(context.storeId, input.storeId),
      evidenceId: pickString(input.evidenceId, existing?.evidenceId, meta.evidenceId),
    });
    if (missionId && analysis) {
      try {
        await syncLoyaltyStageToGraph(missionId, {
          attachmentAnalysis: analysis,
          preseededDraft: analysis.preseededDraft ?? priors.preseededDraft ?? null,
          stage: 'loyalty.analyze_attachment',
        });
      } catch {
        /* graph sync is best-effort */
      }
    }
    return {
      status: 'ok',
      output: {
        attachmentAnalysis: analysis ?? { artifactType: 'unknown', confidence: 0.2 },
        visualLoyaltyHints: analysis?.visualHints ?? [],
        ...(analysis?.artifactType === 'unknown'
          ? { warning: 'Uploaded card analysis was unavailable.' }
          : {}),
      },
    };
  } catch (err) {
    return {
      status: 'ok',
      output: {
        attachmentAnalysis: {
          artifactType: 'loyalty_card',
          confidence: 0.3,
          ocrWarning: err instanceof Error ? err.message : 'analysis unavailable',
        },
        visualLoyaltyHints: [],
        warning: 'Uploaded card analysis was unavailable.',
      },
    };
  }
}

/**
 * Merge owner answers over attachment/preseeded draft (owner wins).
 * @deprecated Prefer buildExecutionDraft from topologyExecutionDraft.js
 */
function mergeSeedWithOwnerInput(preseeded, ownerInput) {
  return buildExecutionDraft({ preseededDraft: preseeded, ownerInput });
}

/** loyalty.infer_requirements */
export async function executeInferRequirements(input = {}, context = {}) {
  let priors = mergeFromPriors(priorOutputs(context), [
    'storeContext',
    'attachmentAnalysis',
    'preseededDraft',
    'visualLoyaltyHints',
    'ownerInput',
    'executionDraft',
    'loyaltyRequirements',
  ]);
  priors = await enrichPriorsFromGraph(pickString(context.missionId), priors, context);
  const storeContext = input.storeContext ?? priors.storeContext ?? null;
  const attachmentAnalysis = input.attachmentAnalysis ?? priors.attachmentAnalysis ?? null;
  const executionDraft = resolveExecutionDraft(input, context, priors);

  if (!storeContext && !pickString(input.storeId, context.storeId)) {
    return {
      status: 'failed',
      error: { code: 'MISSING_STORE_CONTEXT', message: 'Store context is required.' },
    };
  }

  let missingFields = computeLoyaltyPauseFields(executionDraft);
  assertNoStaleMissingFields(executionDraft, missingFields);

  const loyaltyRequirements = {
    storeId: pickString(storeContext?.storeId, input.storeId, context.storeId),
    storeName: storeContext?.name ?? storeContext?.storeName ?? null,
    category: storeContext?.category ?? storeContext?.businessCategory ?? null,
    reward: executionDraft.reward ?? executionDraft.rewardRule ?? null,
    stampThreshold: executionDraft.requiredStamps ?? executionDraft.stampThreshold ?? null,
    programName: executionDraft.programName ?? executionDraft.name ?? null,
    source: 'loyalty.infer_requirements',
    attachmentArtifactType: attachmentAnalysis?.artifactType ?? null,
  };

  // Smart defaults: attachment already confirmed reward+stamps — do not pause for owner input.
  if (
    missingFields.length > 0 &&
    executionDraftHasAttachmentConfirmedFields(executionDraft, attachmentAnalysis)
  ) {
    missingFields = [];
  }

  if (missingFields.length > 0) {
    const extras = buildNeedsInputExtras(missingFields, executionDraft);
    const missionId = pickString(context.missionId);
    if (missionId) {
      try {
        await emitLoyaltyProgressiveArtifact(
          missionId,
          'awaiting_input',
          progressivePartialFromDraft(executionDraft, storeContext),
        );
      } catch {
        /* best-effort */
      }
    }
    return {
      status: 'needs_input',
      missingFields,
      message: extras.suggestedQuestion,
      suggestedQuestion: extras.suggestedQuestion,
      resumeNodeId: extras.resumeNodeId,
      prefilledValues: extras.prefilledValues,
      output: {
        executionDraft,
        loyaltyRequirements,
        missingFields,
        suggestedQuestion: extras.suggestedQuestion,
        prefilledValues: extras.prefilledValues,
      },
    };
  }

  return {
    status: 'ok',
    output: { executionDraft, loyaltyRequirements, missingFields: [] },
  };
}

/** loyalty.generate_draft */
export async function executeGenerateDraft(input = {}, context = {}) {
  let priors = mergeFromPriors(priorOutputs(context), [
    'storeContext',
    'loyaltyRequirements',
    'attachmentAnalysis',
    'preseededDraft',
    'ownerInput',
    'executionDraft',
  ]);
  priors = await enrichPriorsFromGraph(pickString(context.missionId), priors, context);
  const requirements = input.loyaltyRequirements ?? priors.loyaltyRequirements ?? {};
  const storeContext = input.storeContext ?? priors.storeContext ?? {};
  const executionDraft = resolveExecutionDraft(input, context, {
    ...priors,
    loyaltyRequirements: requirements,
  });

  let missing = computeLoyaltyPauseFields(executionDraft);
  assertNoStaleMissingFields(executionDraft, missing);
  const attachmentAnalysis = input.attachmentAnalysis ?? priors.attachmentAnalysis ?? null;
  if (
    missing.length > 0 &&
    executionDraftHasAttachmentConfirmedFields(executionDraft, attachmentAnalysis)
  ) {
    missing = [];
  }
  if (missing.length > 0) {
    const extras = buildNeedsInputExtras(missing, executionDraft);
    const missionId = pickString(context.missionId);
    if (missionId) {
      try {
        await emitLoyaltyProgressiveArtifact(
          missionId,
          'awaiting_input',
          progressivePartialFromDraft(executionDraft, storeContext),
        );
      } catch {
        /* best-effort */
      }
    }
    return {
      status: 'needs_input',
      missingFields: missing,
      message: extras.suggestedQuestion,
      suggestedQuestion: extras.suggestedQuestion,
      resumeNodeId: extras.resumeNodeId,
      prefilledValues: extras.prefilledValues,
      output: {
        missingFields: missing,
        loyaltyRequirements: requirements,
        suggestedQuestion: extras.suggestedQuestion,
        prefilledValues: extras.prefilledValues,
      },
    };
  }

  try {
    const storeId = pickString(requirements.storeId, storeContext.storeId, input.storeId, context.storeId);
    const mergedSeed = applyCanonicalLoyaltyDraftFields(
      {
        ...executionDraft,
        ...priors.ownerInput,
        reward: pickString(requirements.reward, executionDraft.reward),
        programName: pickString(requirements.programName, executionDraft.programName),
      },
      {
        ...executionDraft,
        ...requirements,
        ...(priors.ownerInput && typeof priors.ownerInput === 'object' ? priors.ownerInput : {}),
      },
    );
    const planned = planLoyaltyProgramDraft({
      store: {
        id: storeId,
        name: storeContext.name ?? storeContext.storeName ?? 'Your store',
        type: storeContext.category ?? storeContext.businessCategory ?? 'General',
      },
      context: {
        customerCount: storeContext.customerCount ?? 0,
        products: storeContext.products ?? [],
        existingProgram: storeContext.existingProgram ?? null,
      },
      pipeline: {},
      preseededDraft: mergedSeed,
      requirements: pickString(input.objective, context.goal),
      missionEvidenceGraph: priors.missionEvidenceGraph ?? null,
    });

    if (planned?.blocked) {
      const blockedMissing = Array.isArray(planned.missingFields)
        ? planned.missingFields.map((f) => (f === 'requiredStamps' ? 'stampThreshold' : f))
        : ['reward', 'stampThreshold'];
      const extras = buildNeedsInputExtras(blockedMissing, mergedSeed);
      const question =
        planned.blocker?.message || extras.suggestedQuestion;
      const missionId = pickString(context.missionId);
      if (missionId) {
        try {
          await emitLoyaltyProgressiveArtifact(
            missionId,
            'awaiting_input',
            progressivePartialFromDraft(mergedSeed, storeContext),
          );
        } catch {
          /* best-effort */
        }
      }
      return {
        status: 'needs_input',
        missingFields: blockedMissing,
        message: question,
        suggestedQuestion: question,
        resumeNodeId: extras.resumeNodeId,
        prefilledValues: extras.prefilledValues,
        output: {
          missingFields: blockedMissing,
          loyaltyRequirements: requirements,
          suggestedQuestion: question,
          prefilledValues: extras.prefilledValues,
        },
      };
    }

    const draft = applyCanonicalLoyaltyDraftFields(
      planned?.draft ??
        buildLoyaltyProgramDraftData({
          storeName: storeContext.name ?? storeContext.storeName,
          businessCategory: storeContext.category ?? storeContext.businessCategory,
          customerCount: storeContext.customerCount,
          products: storeContext.products,
          preseededDraft: mergedSeed,
          requirements: pickString(input.objective, context.goal),
        }),
      mergedSeed,
    );

    const missionId = pickString(context.missionId);
    if (missionId) {
      try {
        await syncLoyaltyStageToGraph(missionId, {
          preseededDraft: {
            cardTopology: draft.cardTopology ?? mergedSeed.cardTopology ?? null,
            rule: draft.rule ?? mergedSeed.rule ?? null,
          },
          stage: 'loyalty.generate_draft',
        });
        await emitLoyaltyProgressiveArtifact(
          missionId,
          'draft_ready',
          progressivePartialFromDraft(draft, storeContext),
        );
      } catch {
        /* best-effort */
      }
    }

    return { status: 'ok', output: { loyaltyDraft: draft } };
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: 'DRAFT_GENERATE_FAILED',
        message: err instanceof Error ? err.message : 'Could not generate loyalty draft.',
      },
    };
  }
}

/** loyalty.validate_draft */
export async function executeValidateDraft(input = {}, context = {}) {
  /* @pure-transform deterministic field check, no IO */
  const priors = mergeFromPriors(priorOutputs(context), ['loyaltyDraft']);
  const draft = input.loyaltyDraft ?? priors.loyaltyDraft ?? null;
  if (!draft || typeof draft !== 'object') {
    return {
      status: 'failed',
      error: {
        code: 'DRAFT_MISSING',
        message: 'Loyalty draft validation failed: draft is empty.',
      },
    };
  }

  const missing = listMissingOwnerFields(draft);
  if (missing.length > 0) {
    const extras = buildNeedsInputExtras(missing, draft);
    return {
      status: 'needs_input',
      missingFields: missing,
      message: extras.suggestedQuestion,
      suggestedQuestion: extras.suggestedQuestion,
      resumeNodeId: extras.resumeNodeId,
      prefilledValues: extras.prefilledValues,
      output: {
        validationResult: { ok: false, missingFields: missing },
        loyaltyDraft: draft,
        suggestedQuestion: extras.suggestedQuestion,
        prefilledValues: extras.prefilledValues,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      validationResult: { ok: true, missingFields: [] },
      loyaltyDraft: draft,
    },
  };
}

/** loyalty.persist_draft */
export async function executePersistDraft(input = {}, context = {}) {
  const priors = mergeFromPriors(priorOutputs(context), [
    'loyaltyDraft',
    'validationResult',
    'storeContext',
    'loyaltyRequirements',
    'executionDraft',
    'ownerInput',
  ]);
  const rawDraft = input.loyaltyDraft ?? priors.loyaltyDraft ?? null;
  const storeId = resolveLoyaltyTopologyStoreId({
    priors,
    input,
    context,
    rawDraft,
    missionContract:
      input.missionContract ?? priors.missionContract ?? context.missionContract ?? null,
  });
  const missionId = pickString(context.missionId);
  const userId = pickString(context.userId);
  const tenantId = pickString(context.tenantId, userId);
  if (!rawDraft) {
    return {
      status: 'failed',
      error: { code: 'DRAFT_MISSING', message: 'Loyalty draft validation failed: draft is empty.' },
    };
  }
  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'MISSING_STORE', message: 'Store id is required.' },
    };
  }

  let draft = applyCanonicalLoyaltyDraftFields(rawDraft, {
    ...(priors.executionDraft && typeof priors.executionDraft === 'object' ? priors.executionDraft : {}),
    ...(priors.ownerInput && typeof priors.ownerInput === 'object' ? priors.ownerInput : {}),
    ...(priors.loyaltyRequirements && typeof priors.loyaltyRequirements === 'object'
      ? priors.loyaltyRequirements
      : {}),
  });

  if (missionId) {
    try {
      const graphCtx = await loadLoyaltyEvidenceContext(missionId);
      if (graphCtx?.preseededDraft) {
        draft = mergeGraphPreseedIntoPriors(draft, graphCtx.preseededDraft);
        if (
          hasAuthoritativeLoyaltyTopology(draft.cardTopology) &&
          !hasAuthoritativeLoyaltyTopology(
            draft.creationContract && typeof draft.creationContract === 'object'
              ? draft.creationContract.cardTopology
              : null,
          )
        ) {
          const refreshed = buildLoyaltyCreationContract({
            storeId,
            preseededDraft: draft,
            hasAttachmentEvidence: true,
            missionEvidenceGraph: graphCtx.graph ?? null,
            storeContext: priors.storeContext ?? null,
          });
          const flattened = loyaltyCreationContractToDraft(refreshed);
          draft = { ...draft, ...flattened, creationContract: refreshed };
        }
      }
    } catch {
      /* graph refresh is best-effort */
    }
  }
  const draftId = pickString(draft.draftId, draft.artifactId) || `loyalty-draft-${randomUUID().slice(0, 8)}`;
  const storeName =
    pickString(priors.storeContext?.name, priors.storeContext?.storeName, draft.storeName) || null;
  let loyaltyProgramDraft = {
    ...draft,
    draftId,
    artifactId: draftId,
    storeId,
    storeName,
    missionId: missionId || null,
    persistedAt: new Date().toISOString(),
    phase: 'awaiting_owner_review',
    status: 'awaiting_owner_review',
  };

  let storePersist = null;
  if (Features.reasoningPhase0.graphContractInvariant && missionId) {
    const meta = await readMetadata(missionId);
    const missionContract =
      input.missionContract ?? priors.missionContract ?? context.missionContract ?? meta?.missionContract ?? null;
    const graph = asMissionEvidenceGraph(meta?.missionEvidenceGraph);
    if (missionContract && graph) {
      validateGraphContractConsistency(graph, missionContract);
    }
  }
  if (userId) {
    storePersist = await persistLoyaltyProgramDraftToStore({
      storeId,
      userId,
      tenantId,
      missionId,
      draft: loyaltyProgramDraft,
      activate: false,
      source: 'loyalty.persist_draft',
    });
    if (storePersist?.ok && storePersist.loyaltyProgramDraft) {
      loyaltyProgramDraft = {
        ...storePersist.loyaltyProgramDraft,
        draftId,
        artifactId: draftId,
        missionId: missionId || null,
      };
    }
  }

  if (missionId) {
    await writeMetadata(missionId, {
      loyaltyProgramDraft,
      loyaltyDraftId: draftId,
      storeId,
      ...(storePersist?.loyaltyProgramId
        ? { loyaltyProgramId: storePersist.loyaltyProgramId }
        : {}),
      ...(storeName ? { storeName } : {}),
    });
  }

  return {
    status: 'ok',
    output: {
      loyaltyProgramDraft,
      loyaltyDraftId: draftId,
      loyaltyProgramId: storePersist?.loyaltyProgramId ?? null,
      storePersist,
      draftRecord: {
        id: draftId,
        type: 'loyalty_program_draft',
        storeId,
        missionId: missionId || null,
        loyaltyProgramId: storePersist?.loyaltyProgramId ?? null,
        status: 'awaiting_owner_review',
      },
    },
  };
}

/** loyalty.present_review */
export async function executePresentReview(input = {}, context = {}) {
  const priors = mergeFromPriors(priorOutputs(context), [
    'loyaltyProgramDraft',
    'loyaltyDraft',
    'storeContext',
  ]);
  const draft = input.loyaltyProgramDraft ?? priors.loyaltyProgramDraft ?? priors.loyaltyDraft ?? null;
  const missionId = pickString(context.missionId);
  const storeId = resolveLoyaltyTopologyStoreId({
    priors,
    input,
    context,
    rawDraft: draft,
    missionContract:
      input.missionContract ?? priors.missionContract ?? context.missionContract ?? null,
  });
  const storeName =
    pickString(priors.storeContext?.name, priors.storeContext?.storeName, draft?.storeName) || null;

  if (!draft) {
    return {
      status: 'failed',
      error: {
        code: 'DRAFT_MISSING',
        message: 'Loyalty draft validation failed: draft is empty.',
      },
    };
  }
  if (!missionId) {
    return {
      status: 'failed',
      error: {
        code: 'MISSING_MISSION',
        message: 'Mission id is required to present loyalty draft review.',
      },
    };
  }

  const canonicalDraft = applyCanonicalLoyaltyDraftFields(
    {
      ...draft,
      storeId,
      storeName,
      missionId,
    },
    {
      ...(priors.executionDraft && typeof priors.executionDraft === 'object' ? priors.executionDraft : {}),
      ...(priors.ownerInput && typeof priors.ownerInput === 'object' ? priors.ownerInput : {}),
    },
  );
  const artifact = await persistAndEmitLoyaltyProgramDraftArtifact(missionId, {
    storeId,
    storeName,
    userId: pickString(context.userId, context.ownerId),
    draft: canonicalDraft,
  });

  try {
    await emitLoyaltyProgressiveArtifact(
      missionId,
      'complete',
      progressivePartialFromDraft(canonicalDraft, priors.storeContext),
    );
  } catch {
    /* best-effort — full artifact already emitted */
  }

  return {
    status: 'ok',
    output: {
      phase: 'awaiting_owner_review',
      status: 'awaiting_owner_review',
      artifactType: 'generated_loyalty_program',
      message: 'Loyalty program ready.',
      ownerReviewArtifact: artifact,
      artifact,
      artifacts: [artifact],
      loyaltyProgramDraft: artifact.data ?? draft,
      suggestedActions: artifact.suggestedActions,
    },
  };
}

export const LOYALTY_STAGE_EXECUTORS = {
  'loyalty.load_store_context': { execute: executeLoadStoreContext },
  'loyalty.analyze_attachment': { execute: executeAnalyzeAttachment },
  'loyalty.infer_requirements': { execute: executeInferRequirements },
  'loyalty.generate_draft': { execute: executeGenerateDraft },
  'loyalty.validate_draft': { execute: executeValidateDraft },
  'loyalty.persist_draft': { execute: executePersistDraft },
  'loyalty.present_review': { execute: executePresentReview },
};

export { listMissingOwnerFields };

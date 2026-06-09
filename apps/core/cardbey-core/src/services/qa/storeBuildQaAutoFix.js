/**
 * Week 1 store-build data auto-fix: patch draft preview + mission metadata before QA / completion.
 * Tier 1 fixes apply silently; Tier 2 catalog mutations require owner approval via agent message SSE.
 */

import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { effectiveVertical } from '../draftStore/draftGuards.js';
import {
  getDraft,
  isAbsoluteHttpUrl,
  resolveDraftItemImageUrl,
  resolveUsableDraftItemImageUrl,
} from '../draftStore/draftStoreService.js';
import { getSeedImageForCategory } from '../../lib/seedLibrary/getSeedImageForCategory.js';
import { auditDraftCatalogQa, applyDraftCatalogQaTier1AutoRepair, planDraftCatalogQaTier2Fixes, applyDraftCatalogQaTier2Fixes } from './draftCatalogQa.js';
import { runDraftQa } from './draftQaAgent.js';
import { mergeMissionContext } from '../../lib/mission.js';
import { hasUserUploadedLogo } from '../draftStore/logoUpdateService.js';

/** @typedef {'vertical' | 'tagline' | 'description' | 'imageUrl' | 'hero' | 'avatar' | 'product_description'} FixableIssueKey */

/** Tier 1 — safe additive fixes applied silently before completion. */
export const TIER_1_FIXES = [
  'imageUrl_seed',
  'tagline_generate',
  'vertical_infer',
  'hero_tags_seed',
  'schema_field_add',
];

/** Tier 2 — catalog mutations that require owner approval. */
export const TIER_2_FIXES = [
  'duplicate_removal',
  'category_reassign',
  'price_standardize',
  'description_rewrite',
  'catalog_regenerate',
  'bulk_catalog_repair',
  'product_rename',
  'product_description',
  'category_reassignment',
];

/**
 * @param {{ kind?: string, id?: string, type?: string }} fix
 * @returns {string}
 */
export function mapFixKindToTier2Type(fix) {
  const kind = String(fix?.kind ?? fix?.type ?? fix?.id ?? '').trim();
  if (kind === 'catalog_regenerate' || kind === 'bulk_catalog_repair') return 'duplicate_removal';
  if (kind === 'category_reassignment' || kind === 'category_reassign') return 'category_reassign';
  if (kind === 'product_description' || kind === 'description_rewrite') return 'description_rewrite';
  if (kind === 'product_rename') return 'duplicate_removal';
  if (kind === 'price_field_missing' || kind === 'price_standardize') return 'price_standardize';
  return kind || 'catalog_improvement';
}

/**
 * Plain-English label for approval cards.
 *
 * @param {{ type?: string, kind?: string, affectedCount?: number, humanDescription?: string }} fix
 * @returns {string}
 */
export function humanLabel(fix) {
  const count = fix?.affectedCount ?? 0;
  const type = mapFixKindToTier2Type(fix);
  const labels = {
    duplicate_removal: `Remove ${count} duplicate products from your catalog`,
    category_reassign: `Reassign ${count} products to more accurate categories`,
    price_standardize: `Standardise pricing format across ${count} products`,
    description_rewrite: `Improve descriptions for ${count} products`,
    catalog_regenerate: `Replace ${count} mismatched products with items that fit your business`,
    bulk_catalog_repair: `Apply catalog improvements affecting ${count} products`,
    product_rename: `Rename ${count} products that use generic placeholder names`,
    product_description: `Improve product descriptions for ${count} items`,
    category_reassignment: `Reassign ${count} products to more accurate categories`,
  };
  if (labels[type]) return labels[type];
  if (fix?.humanDescription) return String(fix.humanDescription);
  return `Fix ${type} (${count} items)`;
}

/**
 * @param {Array<{ id: string, kind: string, humanDescription: string, affectedCount: number }>} tier2Fixes
 * @returns {Array<{ id: string, label: string, impact: string, severity: string, type: string }>}
 */
export function formatTier2FixesForApproval(tier2Fixes) {
  return tier2Fixes.map((fix) => {
    const count = fix.affectedCount ?? 0;
    const type = mapFixKindToTier2Type(fix);
    const severity = count > 10 ? 'high' : count > 3 ? 'medium' : 'low';
    return {
      id: fix.id,
      type,
      label: humanLabel({ ...fix, type }),
      impact: `Affects ${count} product${count === 1 ? '' : 's'}`,
      severity,
    };
  });
}

/**
 * @param {object} preview
 * @param {object} input
 * @param {object} [metadata]
 * @returns {Set<FixableIssueKey>}
 */
export function detectFixableStoreBuildIssues(preview, input = {}, metadata = {}) {
  const issues = new Set();
  const p = preview && typeof preview === 'object' ? preview : {};
  const items = Array.isArray(p.items) ? p.items : Array.isArray(p.catalog?.products) ? p.catalog.products : [];

  const verticalSlug =
    (typeof metadata.businessVertical === 'string' && metadata.businessVertical.trim()) ||
    (typeof p.meta?.verticalSlug === 'string' && p.meta.verticalSlug.trim()) ||
    (typeof input.verticalSlug === 'string' && input.verticalSlug.trim()) ||
    '';
  if (!verticalSlug || !verticalSlug.includes('.')) {
    issues.add('vertical');
  }

  const tagline = String(p.tagline ?? p.slogan ?? '').trim();
  if (!tagline || tagline.length < 8) {
    issues.add('tagline');
  }

  const storeDesc = String(p.description ?? p.storeDescription ?? '').trim();
  if (!storeDesc || storeDesc.length < 20) {
    issues.add('description');
  }

  const heroUrl = p?.hero?.imageUrl ?? p?.heroImageUrl ?? p?.hero?.url;
  if (!heroUrl || !String(heroUrl).trim()) {
    issues.add('hero');
  }

  const userUploadedLogo = hasUserUploadedLogo(p);
  const avatarUrl =
    p?.avatar?.imageUrl ?? p?.avatarImageUrl ?? p?.avatar?.url ?? p?.brand?.logoUrl ?? p?.avatarUrl;
  if (!userUploadedLogo && (!avatarUrl || !String(avatarUrl).trim())) {
    issues.add('avatar');
  }

  if (items.length > 0) {
    const missingImages = items.filter((it) => !resolveUsableDraftItemImageUrl(it));
    if (missingImages.length > 0) {
      issues.add('imageUrl');
    }
    const weakDesc = items.filter(
      (it) => it && (!it.description || String(it.description).trim().length < 12),
    );
    if (weakDesc.length > 0) {
      issues.add('product_description');
    }
  }

  const catalogAudit = auditDraftCatalogQa(p, input);
  if (catalogAudit.issueCodes.includes('EMPTY_TAGLINE')) issues.add('tagline');
  if (catalogAudit.issueCodes.includes('EMPTY_STORE_DESCRIPTION')) issues.add('description');
  if (catalogAudit.issueCodes.includes('PRODUCT_WEAK_DESCRIPTION')) issues.add('product_description');

  return issues;
}

/**
 * @param {string} businessName
 * @param {string} businessType
 * @returns {{ slug: string, group: string }}
 */
export function inferVerticalFromBusinessName(businessName, businessType) {
  const r = resolveVertical({
    businessName: businessName || '',
    businessType: businessType || 'general',
  });
  return { slug: r.slug || 'services.generic', group: r.group || 'services' };
}

/**
 * @param {object[]} items
 * @param {string} verticalSlug
 * @param {string} storeType
 * @returns {Promise<string[]>}
 */
async function fixMissingProductImages(items, verticalSlug, storeType) {
  const fixed = [];
  const vertical =
    (verticalSlug && verticalSlug.split('.')[0]) ||
    effectiveVertical(storeType, storeType) ||
    null;
  const debugImages =
    process.env.IMAGEFIX_DEBUG === '1' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.LOG_IMAGEFIX === '1';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;

    const existing = resolveDraftItemImageUrl(item);
    const usable = resolveUsableDraftItemImageUrl(item);
    if (usable) continue;

    const categoryKey =
      (item.categoryName && String(item.categoryName).trim()) ||
      (item.category && String(item.category).trim()) ||
      storeType ||
      null;
    const stableId = item.id ?? item.productId ?? `item_${i}`;
    const resolved = await getSeedImageForCategory({
      vertical,
      categoryKey,
      orientation: 'landscape',
      stableId,
    });

    if (debugImages) {
      console.log('[imagefix-debug]', {
        productName: item.name,
        category: categoryKey,
        existing,
        resolved,
        isAbsoluteUrl: isAbsoluteHttpUrl(resolved),
      });
    }

    if (resolved && isAbsoluteHttpUrl(resolved)) {
      item.imageUrl = resolved;
      item.imageSource = item.imageSource || 'seed_library';
      fixed.push(`products[${i}].imageUrl`);
    }
  }
  return fixed;
}

/**
 * @param {string} missionId
 * @param {string} draftId
 * @param {string} [generationRunId]
 */
async function emitDraftUpdatedSse(missionId, draftId, generationRunId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  try {
    const { broadcastMissionArtifact } = await import('../../realtime/simpleSse.js');
    broadcastMissionArtifact({
      missionId: mid,
      subtype: 'draft_updated',
      payload: {
        draftId,
        reason: 'qa_auto_fix',
        ...(generationRunId ? { generationRunId: String(generationRunId).trim() } : {}),
      },
    });
  } catch (err) {
    console.warn('[storeBuildQaAutoFix] draft_updated SSE failed:', err?.message ?? err);
  }
}

/**
 * @param {string} draftId
 * @param {object} preview
 */
async function verifyDraftImagePersistence(draftId, preview) {
  const debugImages =
    process.env.IMAGEFIX_DEBUG === '1' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.LOG_IMAGEFIX === '1';
  if (!debugImages) return;

  const check = await getDraft(draftId);
  const checkItems = Array.isArray(check?.preview?.items)
    ? check.preview.items
    : Array.isArray(check?.preview?.catalog?.products)
      ? check.preview.catalog.products
      : [];
  const stillMissing = checkItems.filter((i) => !resolveUsableDraftItemImageUrl(i)).length;
  const inMemoryMissing = (Array.isArray(preview.items) ? preview.items : []).filter(
    (i) => !resolveUsableDraftItemImageUrl(i),
  ).length;
  console.log('[imagefix-verify] items still missing imageUrl after patch:', stillMissing, {
    draftId,
    inMemoryMissing,
    persistedItemCount: checkItems.length,
  });
}

/**
 * SSE: qa_approval_required | qa_fixes_applied (mission.artifact subtype).
 */
async function emitQaMissionArtifact(missionId, subtype, payload) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  try {
    const { broadcastMissionArtifact } = await import('../../realtime/simpleSse.js');
    broadcastMissionArtifact({ missionId: mid, subtype, payload });
  } catch (err) {
    console.warn('[storeBuildQaAutoFix] mission.artifact SSE failed:', err?.message ?? err);
  }
}

/**
 * Mark pipeline complete after Tier 2 decision (approve or skip).
 *
 * @param {string} missionId
 * @param {import('@prisma/client').PrismaClient} [prisma]
 */
export async function completeMissionPipelineAfterQaApproval(missionId, prisma) {
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const db = prisma || getPrismaClient();
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return { ok: false };

  const mission = await db.missionPipeline.findUnique({
    where: { id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!mission) return { ok: false, error: 'mission_not_found' };

  const now = new Date();
  const completedCount = (mission.steps ?? []).filter((s) => s.status === 'completed').length;
  const totalSteps = (mission.steps ?? []).length;

  await db.missionPipeline.update({
    where: { id },
    data: {
      status: 'completed',
      runState: 'done',
      completedAt: now,
      currentStepId: null,
      progressCompletedSteps: completedCount,
      progressTotalSteps: totalSteps,
    },
  });
  console.log('[QaCheckpointResume] checkpoint_marked_resolved', {
    missionId: id,
    status: 'completed',
    runState: 'done',
    completedCount,
    totalSteps,
  });

  const { runPostMissionCompletionSummary } = await import('../../lib/missionCompletion/postMissionSummary.js');
  void runPostMissionCompletionSummary({
    missionId: id,
    missionType: mission.type ?? null,
    metadataJson: mission.metadataJson,
    outputsJson:
      mission.outputsJson && typeof mission.outputsJson === 'object' ? mission.outputsJson : {},
  }).catch(() => {});

  return { ok: true };
}

/**
 * Ensure shadow Mission row exists so mergeMissionContext can persist QA approval flags.
 */
async function ensureMissionRowForQaContext(prisma, missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return false;
  try {
    const { ensureMissionRowForBlackboard } = await import('../../lib/missionBlackboard.js');
    return (await ensureMissionRowForBlackboard(prisma, mid)) != null;
  } catch (err) {
    console.warn('[storeBuildQaAutoFix] ensureMissionRowForQaContext failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Mirror QA pending flags on MissionPipeline.metadataJson (runner gate fallback).
 */
async function clearQaApprovalPendingOnPipeline(prisma, missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });
  const meta =
    row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? { ...row.metadataJson }
      : {};
  delete meta.qaApprovalPending;
  delete meta.pendingQaFixes;
  delete meta.storeBuildQaTier2Pending;
  await prisma.missionPipeline.update({
    where: { id: mid },
    data: { metadataJson: meta },
  });
}

async function persistQaApprovalPendingOnPipeline(prisma, missionId, draftId, tier2Fixes) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  const row = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: { metadataJson: true },
  });
  const meta =
    row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? { ...row.metadataJson }
      : {};
  await prisma.missionPipeline.update({
    where: { id: mid },
    data: {
      metadataJson: {
        ...meta,
        qaApprovalPending: true,
        pendingQaFixes: tier2Fixes,
        storeBuildQaTier2Pending: {
          draftId,
          fixes: tier2Fixes,
          requestedAt: new Date().toISOString(),
        },
      },
    },
  });
}

/**
 * Emit approval_required agent message + persist pending Tier 2 fix plan on mission context.
 */
async function emitStoreBuildQaTier2Approval(missionId, draftId, tier2Fixes, prisma) {
  const db = prisma || (await import('../../lib/prisma.js')).getPrismaClient();
  await ensureMissionRowForQaContext(db, missionId);

  const { createAgentMessage } = await import('../../orchestrator/lib/agentMessage.js');
  const approvalFixes = formatTier2FixesForApproval(tier2Fixes);
  const items = approvalFixes.map((fix) => ({
    label: fix.label,
    impact: fix.impact,
    fixId: fix.id,
    severity: fix.severity,
    type: fix.type,
  }));

  await emitQaMissionArtifact(missionId, 'qa_approval_required', { fixes: approvalFixes, draftId });

  await createAgentMessage({
    missionId,
    senderId: 'store-build-qa',
    senderType: 'system',
    channel: 'main',
    text: 'A few things need your input',
    messageType: 'approval_required',
    payload: {
      kind: 'store_build_qa_tier2',
      draftId,
      title: 'A few things need your input',
      items,
      prompt: 'Review these catalog improvements before we apply them to your store.',
      options: [
        { id: 'approve_all', label: 'Apply all' },
        { id: 'skip_all', label: 'Skip' },
      ],
    },
    visibleToUser: true,
  });

  const mergedCtx = await mergeMissionContext(
    missionId,
    {
      pendingQaFixes: tier2Fixes,
      qaApprovalPending: true,
      storeBuildQaTier2Pending: {
        draftId,
        fixes: tier2Fixes,
        requestedAt: new Date().toISOString(),
      },
    },
    { prisma: db },
  );

  await persistQaApprovalPendingOnPipeline(db, missionId, draftId, tier2Fixes);

  if (process.env.NODE_ENV !== 'production' || process.env.QA_AUTOFIX_DEBUG === '1') {
    console.log('[qa-autofix-debug] emitStoreBuildQaTier2Approval persisted', {
      missionId,
      draftId,
      tier2Count: tier2Fixes.length,
      contextMerged: mergedCtx != null,
      qaApprovalPending: true,
    });
  }
}

/**
 * Apply owner decision on pending Tier 2 fixes (POST agent-messages system decision).
 *
 * @param {object} opts
 * @param {string} opts.missionId
 * @param {'approve_all' | 'skip_all'} opts.decision
 * @param {import('@prisma/client').PrismaClient} [opts.prisma]
 */
export async function applyPendingStoreBuildQaTier2Fixes(opts = {}) {
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const prisma = opts.prisma || getPrismaClient();
  const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  const decision = opts.decision === 'approve_all' ? 'approve_all' : 'skip_all';
  if (!missionId) return { ok: false, skipped: true };

  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  });
  const ctx =
    mission?.context && typeof mission.context === 'object' && !Array.isArray(mission.context)
      ? mission.context
      : {};
  const pipeRow = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { metadataJson: true },
  });
  const pipeMeta =
    pipeRow?.metadataJson && typeof pipeRow.metadataJson === 'object' && !Array.isArray(pipeRow.metadataJson)
      ? pipeRow.metadataJson
      : {};
  const pending = ctx.storeBuildQaTier2Pending ?? pipeMeta.storeBuildQaTier2Pending ?? null;
  if (!pending || typeof pending !== 'object' || !pending.draftId) {
    return { ok: false, skipped: true, reason: 'no_pending_tier2' };
  }

  const draftId = String(pending.draftId).trim();
  const fixes = Array.isArray(pending.fixes) ? pending.fixes : [];

  if (decision === 'skip_all') {
    console.log('[QaCheckpointResume] qa_fixes_skipped', { missionId, draftId });
    await mergeMissionContext(
      missionId,
      {
        pendingQaFixes: [],
        qaApprovalPending: false,
        storeBuildQaTier2Pending: null,
        storeBuildQaTier2SkippedAt: new Date().toISOString(),
      },
      { prisma },
    );
    await emitQaMissionArtifact(missionId, 'qa_fixes_applied', {
      message: 'Skipped catalog improvements — your store is ready with the current catalog.',
      appliedCount: 0,
    });
    await clearQaApprovalPendingOnPipeline(prisma, missionId);
    const completeSkip = await completeMissionPipelineAfterQaApproval(missionId, prisma);
    console.log('[QaCheckpointResume] pipeline_completed_after_skip', { missionId, completeSkip });
    return { ok: true, applied: false, skipped: true };
  }

  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { preview: true, input: true },
  });
  if (!draft?.preview || typeof draft.preview !== 'object') {
    return { ok: false, error: 'draft_not_found' };
  }

  const input =
    draft.input && typeof draft.input === 'object' && !Array.isArray(draft.input)
      ? { ...draft.input }
      : {};
  let preview = JSON.parse(JSON.stringify(draft.preview));
  const catalogParams = {
    businessName:
      (typeof input.businessName === 'string' && input.businessName.trim()) ||
      preview.storeName ||
      'My store',
    businessType:
      (typeof input.businessType === 'string' && input.businessType.trim()) ||
      preview.storeType ||
      'general',
    verticalSlug:
      preview.meta?.verticalSlug ||
      input.verticalSlug ||
      ctx.businessVertical ||
      pipeMeta.businessVertical ||
      ctx.verticalSlug ||
      pipeMeta.verticalSlug ||
      '',
  };

  const fixIds = fixes.map((f) => f.id).filter(Boolean);
  const { preview: repaired, autoFixed } = applyDraftCatalogQaTier2Fixes(
    preview,
    input,
    catalogParams,
    { fixIds },
  );
  preview = repaired;

  const { patchDraftPreview, runWithCommittedDraftReopenedForCatalogPatch } = await import(
    '../draftStore/draftStoreService.js'
  );
  await runWithCommittedDraftReopenedForCatalogPatch(draftId, async () => {
    await patchDraftPreview(draftId, preview);
    await verifyDraftImagePersistence(draftId, preview);
  });
  if (missionId) {
    await emitDraftUpdatedSse(missionId, draftId, '');
  }

  const postAudit = auditDraftCatalogQa(preview, { ...input, verticalSlug: catalogParams.verticalSlug });
  const qaReport = runDraftQa({ preview, input });

  await mergeMissionContext(
    missionId,
    {
      pendingQaFixes: [],
      qaApprovalPending: false,
      storeBuildQaTier2Pending: null,
      storeBuildQaTier2AppliedAt: new Date().toISOString(),
      storeBuildQaTier2Applied: autoFixed,
      react_validation: {
        valid: postAudit.pass && (qaReport.itemsWithoutImages ?? 0) === 0,
        issues: [],
        reasoning: 'Store catalog improvements applied after owner approval',
        autoFixed,
      },
    },
    { prisma },
  );

  const appliedCount = fixes.length;
  await emitQaMissionArtifact(missionId, 'qa_fixes_applied', {
    message: `Applied ${appliedCount} improvement${appliedCount === 1 ? '' : 's'} to your store.`,
    appliedCount,
  });
  await clearQaApprovalPendingOnPipeline(prisma, missionId);
  const completeApprove = await completeMissionPipelineAfterQaApproval(missionId, prisma);
  console.log('[QaCheckpointResume] pipeline_completed_after_approve', {
    missionId,
    draftId,
    completeApprove,
    appliedCount: fixes.length,
  });

  return { ok: true, applied: true, autoFixed, catalogPass: postAudit.pass, qaReport };
}

/**
 * Apply deterministic data fixes, persist preview, refresh QA + optional mission validation state.
 *
 * @param {object} opts
 * @param {import('@prisma/client').PrismaClient} [opts.prisma]
 * @param {string} opts.draftId
 * @param {string} [opts.missionId]
 * @param {string} [opts.businessName]
 * @param {string} [opts.businessType]
 * @param {object} [opts.metadataJson] - mission pipeline metadata (mutated in memory for vertical patch)
 * @param {string} [opts.generationRunId] - for draft_updated SSE + preview refresh
 * @returns {Promise<{ autoFixed: string[], fixableIssues: string[], catalogPass: boolean, qaReport: object|null, skipped: boolean, tier1Applied?: boolean, tier2Pending?: object[] }>}
 */
export async function applyStoreBuildQaAutoFix(opts = {}) {
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const prisma = opts.prisma || getPrismaClient();
  const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
  if (!draftId) {
    return { autoFixed: [], fixableIssues: [], catalogPass: false, qaReport: null, skipped: true };
  }

  const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  const businessName =
    (typeof opts.businessName === 'string' && opts.businessName.trim()) || 'My store';
  const businessType =
    (typeof opts.businessType === 'string' && opts.businessType.trim()) || 'general';

  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { preview: true, input: true, status: true },
  });
  if (!draft?.preview || typeof draft.preview !== 'object') {
    return { autoFixed: [], fixableIssues: [], catalogPass: false, qaReport: null, skipped: true };
  }

  const input =
    draft.input && typeof draft.input === 'object' && !Array.isArray(draft.input)
      ? { ...draft.input }
      : {};
  const metadata =
    opts.metadataJson && typeof opts.metadataJson === 'object' && !Array.isArray(opts.metadataJson)
      ? { ...opts.metadataJson }
      : {};

  let preview =
    typeof draft.preview === 'object' && !Array.isArray(draft.preview)
      ? JSON.parse(JSON.stringify(draft.preview))
      : {};

  if (missionId) {
    await ensureMissionRowForQaContext(prisma, missionId);
  }

  const fixable = detectFixableStoreBuildIssues(preview, input, metadata);

  const catalogParamsEarly = {
    businessName,
    businessType,
    verticalSlug:
      preview.meta?.verticalSlug || input.verticalSlug || metadata.businessVertical || '',
  };

  const tier2FixesPlanned = planDraftCatalogQaTier2Fixes(preview, input, catalogParamsEarly);
  const tier1FixesPlanned = TIER_1_FIXES.filter((t) => {
    if (t === 'vertical_infer') return fixable.has('vertical');
    if (t === 'tagline_generate') return fixable.has('tagline');
    if (t === 'imageUrl_seed') return fixable.has('imageUrl');
    if (t === 'hero_tags_seed') return true;
    if (t === 'schema_field_add') return true;
    return false;
  });

  if (process.env.NODE_ENV !== 'production' || process.env.QA_AUTOFIX_DEBUG === '1') {
    console.log('[qa-autofix-debug] tier1Fixes:', tier1FixesPlanned);
    console.log(
      '[qa-autofix-debug] tier2Fixes:',
      tier2FixesPlanned.map((f) => mapFixKindToTier2Type(f)),
    );
    console.log('[qa-autofix-debug] tier2 count:', tier2FixesPlanned.length);
  }
  if (fixable.size === 0 && tier2FixesPlanned.length === 0) {
    const qaReport = runDraftQa({ preview, input });
    return {
      autoFixed: [],
      fixableIssues: [],
      catalogPass: true,
      qaReport,
      skipped: false,
      tier1Applied: false,
      tier2Pending: [],
    };
  }

  const autoFixed = [];

  if (fixable.has('vertical')) {
    const { slug, group } = inferVerticalFromBusinessName(businessName, businessType);
    preview.meta = {
      ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
      verticalSlug: slug,
      verticalGroup: group,
    };
    preview.storeType = preview.storeType || businessType || slug.split('.')[0];
    input.verticalSlug = slug;
    metadata.businessVertical = slug;
    metadata.verticalSlug = slug;
    autoFixed.push('vertical');
  }

  const verticalSlug =
    preview.meta?.verticalSlug || input.verticalSlug || metadata.businessVertical || '';

  const catalogParams = {
    businessName,
    businessType,
    verticalSlug,
  };

  const tier2Fixes = tier2FixesPlanned;

  const { preview: tier1Preview, autoFixed: tier1CatalogFixed } = applyDraftCatalogQaTier1AutoRepair(
    preview,
    input,
    catalogParams,
  );
  preview = tier1Preview;
  autoFixed.push(...tier1CatalogFixed);

  const items = Array.isArray(preview.items) ? preview.items : [];
  if (fixable.has('imageUrl') && items.length > 0) {
    const imgFixed = await fixMissingProductImages(
      items,
      verticalSlug,
      preview.storeType || businessType,
    );
    autoFixed.push(...imgFixed);
    preview.items = items;
    if (preview.catalog?.products) {
      preview.catalog = { ...preview.catalog, products: items };
    }
  }

  if (fixable.has('hero')) {
    const vertical =
      effectiveVertical(preview.storeType, preview.meta?.storeType) ||
      (verticalSlug && verticalSlug.split('.')[0]) ||
      null;
    const heroUrl = await getSeedImageForCategory({
      vertical,
      categoryKey: preview.storeType || businessType,
      businessName: preview.storeName || businessName,
      orientation: 'landscape',
    });
    if (heroUrl) {
      const { applyPipelineGeneratedHeroImage } = await import('../draftStore/draftPreviewHeroSync.js');
      if (applyPipelineGeneratedHeroImage(preview, heroUrl, { writer: 'storeBuildQaAutoFix', draftId })) {
        autoFixed.push('hero');
      }
    }
  }

  if (fixable.has('avatar') && !hasUserUploadedLogo(preview)) {
    const firstWithImage = items.find((it) => resolveDraftItemImageUrl(it));
    const av = firstWithImage ? resolveDraftItemImageUrl(firstWithImage) : preview.heroImageUrl;
    if (av) {
      preview.avatar = {
        ...(preview.avatar && typeof preview.avatar === 'object' ? preview.avatar : {}),
        imageUrl: av,
      };
      preview.avatarUrl = av;
      autoFixed.push('avatar');
    }
  }

  const { patchDraftPreview } = await import('../draftStore/draftStoreService.js');
  await patchDraftPreview(draftId, preview);
  await verifyDraftImagePersistence(draftId, preview);

  if (autoFixed.some((k) => k.includes('imageUrl') || k === 'hero' || k === 'avatar') && missionId) {
    const genRunId =
      (typeof opts.generationRunId === 'string' && opts.generationRunId.trim()) ||
      (typeof preview.generationRunId === 'string' && preview.generationRunId.trim()) ||
      (typeof input.generationRunId === 'string' && input.generationRunId.trim()) ||
      '';
    await emitDraftUpdatedSse(missionId, draftId, genRunId);
  }

  let tier2Pending = [];
  if (tier2Fixes.length > 0 && missionId) {
    tier2Pending = tier2Fixes;
    await emitStoreBuildQaTier2Approval(missionId, draftId, tier2Fixes, prisma);
  } else if (tier2Fixes.length > 0) {
    const { preview: tier2Preview, autoFixed: tier2Applied } = applyDraftCatalogQaTier2Fixes(
      preview,
      input,
      catalogParams,
      { fixIds: tier2Fixes.map((f) => f.id) },
    );
    preview = tier2Preview;
    autoFixed.push(...tier2Applied);
    await patchDraftPreview(draftId, preview);
    await verifyDraftImagePersistence(draftId, preview);
    if (missionId) {
      await emitDraftUpdatedSse(missionId, draftId, '');
    }
  }

  if (missionId && metadata.businessVertical) {
    const pipe = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { metadataJson: true },
    });
    const meta =
      pipe?.metadataJson && typeof pipe.metadataJson === 'object' && !Array.isArray(pipe.metadataJson)
        ? { ...pipe.metadataJson }
        : {};
    await prisma.missionPipeline.update({
      where: { id: missionId },
      data: {
        metadataJson: {
          ...meta,
          businessVertical: metadata.businessVertical,
          verticalSlug: metadata.verticalSlug ?? metadata.businessVertical,
        },
      },
    });
  }

  const postAudit = auditDraftCatalogQa(preview, { ...input, verticalSlug });
  const qaReport = runDraftQa({ preview, input });

  const uniqueFixed = [...new Set(autoFixed)];

  if (missionId && tier2Pending.length === 0) {
    const catalogOk = postAudit.pass;
    const imagesOk = (qaReport.itemsWithoutImages ?? 0) === 0 || (qaReport.totalItems ?? 0) === 0;
    const heroOk = qaReport.hasHero !== false;
    if (catalogOk && imagesOk && heroOk) {
      await mergeMissionContext(
        missionId,
        {
          react_validation: {
            valid: true,
            issues: [],
            reasoning: 'Store data auto-fixed before mission completion',
            autoFixed: uniqueFixed,
          },
        },
        { prisma },
      ).catch(() => {});
    }
  } else if (missionId && tier2Pending.length > 0) {
    await ensureMissionRowForQaContext(prisma, missionId);
    await mergeMissionContext(
      missionId,
      {
        pendingQaFixes: tier2Pending,
        qaApprovalPending: true,
        react_validation: {
          valid: false,
          issues: ['catalog_tier2_approval_pending'],
          reasoning: 'Catalog improvements need your approval before completion',
          autoFixed: uniqueFixed,
          tier2Pending: tier2Pending.map((f) => f.id),
        },
      },
      { prisma },
    ).catch(() => {});
    await persistQaApprovalPendingOnPipeline(prisma, missionId, draftId, tier2Pending).catch(() => {});
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[storeBuildQaAutoFix]', {
      draftId,
      missionId: missionId || null,
      fixable: [...fixable],
      autoFixed: uniqueFixed,
      tier2Pending: tier2Pending.map((f) => f.id),
      catalogPass: postAudit.pass,
      qaScore: qaReport.score,
    });
  }

  return {
    autoFixed: uniqueFixed,
    fixableIssues: [...fixable],
    catalogPass: postAudit.pass,
    qaReport,
    skipped: false,
    tier1Applied: uniqueFixed.length > 0,
    tier2Pending,
  };
}


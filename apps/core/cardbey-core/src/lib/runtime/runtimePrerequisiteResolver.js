/**
 * Runtime Prerequisite Resolution — central authority before proactive step execution.
 * Never auto-creates stores or mutates mission type when prerequisites are unmet.
 */

import { getPrismaClient } from '../prisma.js';
import { getTenantId } from '../missionAccess.js';
import { getToolEntry } from '../intake/intakeToolRegistry.js';
import { normalizeToolName } from './runtimeToolRegistry.js';
import { getRuntimeCapabilities } from './runtimeCapabilitiesService.js';
import { getMissionParentMissionId } from '../mission/missionParentLineage.js';

export function isRuntimePrerequisiteResolutionEnabled() {
  return getRuntimeCapabilities().runtimePrerequisiteResolution;
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Resolve storeId from mission row, target context, and parameters (explicit only — no inference).
 * @param {{ mission?: object|null; targetContext?: object|null; parameters?: object|null }} input
 */
export function resolveExplicitStoreId({ mission, targetContext, parameters }) {
  const ctx = asObj(targetContext);
  const params = asObj(parameters);
  const meta = asObj(mission?.metadataJson);
  const metaCtx = asObj(meta.context);

  const candidates = [
    str(ctx.storeId),
    str(params.storeId),
    str(meta.storeId),
    str(metaCtx.storeId),
    mission?.targetType === 'store' ? str(mission?.targetId) : '',
  ].filter(Boolean);

  return candidates[0] || null;
}

async function storeExistsForUser(storeId, userId) {
  const sid = str(storeId);
  const uid = str(userId);
  if (!sid || !uid) return false;
  const prisma = getPrismaClient();
  const row = await prisma.business.findFirst({
    where: { id: sid, userId: uid, isActive: true },
    select: { id: true, name: true, slug: true },
  });
  return row ?? null;
}

async function loadUserStoreCandidates(userId, limit = 20) {
  const uid = str(userId);
  if (!uid) return [];
  const prisma = getPrismaClient();
  const rows = await prisma.business.findMany({
    where: { userId: uid, isActive: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, slug: true, updatedAt: true },
  });
  return rows.map((b) => ({
    storeId: b.id,
    name: b.name ?? null,
    slug: b.slug ?? null,
    updatedAt: b.updatedAt ?? null,
  }));
}

function toolRequiresStore(toolName) {
  const canonical = normalizeToolName(toolName) || str(toolName).toLowerCase();
  const entry = getToolEntry(canonical);
  return Boolean(entry?.requiresStore);
}

function buildResumableIntent({ mission, requestedTool, stepNumber, continuationContract, parameters }) {
  const meta = asObj(mission?.metadataJson);
  return {
    originalTool: normalizeToolName(requestedTool) || str(requestedTool).toLowerCase(),
    originalMissionIntent:
      str(meta.intentText) ||
      str(meta.originalGoal) ||
      str(mission?.title) ||
      null,
    originalMissionId: str(mission?.id) || null,
    originalMissionType: str(mission?.type) || null,
    parentMissionId: getMissionParentMissionId(mission) || str(mission?.id) || null,
    stepNumber: Number.isFinite(stepNumber) ? stepNumber : null,
    continuationContract: continuationContract ?? null,
    parameters: asObj(parameters),
  };
}

/**
 * @param {{
 *   user: object;
 *   mission: object;
 *   requestedTool: string;
 *   targetContext?: object|null;
 *   continuationContract?: object|null;
 *   stepNumber?: number;
 *   parameters?: object|null;
 * }} input
 */
export async function resolveMissionPrerequisites(input) {
  const req = input && typeof input === 'object' ? input : {};
  const user = req.user ?? null;
  const mission = req.mission ?? null;
  const requestedTool = str(req.requestedTool).toLowerCase();
  const stepNumber = Math.floor(Number(req.stepNumber));

  if (!user?.id || !mission?.id || !requestedTool) {
    return {
      ok: false,
      requirementsMet: false,
      missingRequirements: [{ type: 'invalid_request', message: 'user, mission, and requestedTool are required.' }],
      suggestedActions: [],
      resumableIntent: null,
      blockingReason: 'invalid_request',
    };
  }

  const resumableIntent = buildResumableIntent({
    mission,
    requestedTool,
    stepNumber,
    continuationContract: req.continuationContract ?? null,
    parameters: req.parameters ?? null,
  });

  if (!toolRequiresStore(requestedTool)) {
    return {
      ok: true,
      requirementsMet: true,
      missingRequirements: [],
      suggestedActions: [],
      resumableIntent,
      blockingReason: null,
    };
  }

  const explicitStoreId = resolveExplicitStoreId({
    mission,
    targetContext: req.targetContext ?? null,
    parameters: req.parameters ?? null,
  });

  if (explicitStoreId) {
    const storeRow = await storeExistsForUser(explicitStoreId, user.id);
    if (storeRow) {
      return {
        ok: true,
        requirementsMet: true,
        missingRequirements: [],
        suggestedActions: [],
        resumableIntent,
        blockingReason: null,
        resolvedStoreId: storeRow.id,
      };
    }
    return {
      ok: true,
      requirementsMet: false,
      missingRequirements: [
        {
          type: 'store_required',
          message: 'This action requires a store.',
          detail: 'The provided store id is invalid or inaccessible.',
        },
      ],
      suggestedActions: ['select_existing_store', 'create_store'],
      resumableIntent,
      blockingReason: 'store_required',
      storeCandidates: await loadUserStoreCandidates(user.id),
    };
  }

  const storeCandidates = await loadUserStoreCandidates(user.id);
  /** @type {string[]} */
  const suggestedActions = [];
  if (storeCandidates.length > 0) {
    suggestedActions.push('select_existing_store');
  }
  suggestedActions.push('create_store');

  return {
    ok: true,
    requirementsMet: false,
    missingRequirements: [
      {
        type: 'store_required',
        message: 'This action requires a store.',
      },
    ],
    suggestedActions,
    resumableIntent,
    blockingReason: 'store_required',
    storeCandidates,
  };
}

export default {
  resolveMissionPrerequisites,
  isRuntimePrerequisiteResolutionEnabled,
  resolveExplicitStoreId,
};

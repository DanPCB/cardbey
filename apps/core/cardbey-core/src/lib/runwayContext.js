/**
 * Phase 2.x — RunwayContext
 *
 * The single authoritative active entity context.
 * All Performer surfaces resolve through this.
 *
 * RunwayContext is observational and read-only. It must not execute tools
 * or mutate missions/pipelines/artifacts.
 */

import { getPrismaClient } from './prisma.js';

export const PROVENANCE = {
  EXPLICIT: 'explicit',
  MISSION: 'mission',
  PREVIEW: 'preview',
  RECENT: 'recent',
  INFERRED: 'inferred',
};

const DEFAULT_LOCALE = 'en';
const RECOVERY_TIMEOUT_MS = 200;

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function uniq(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);
}

/**
 * Build RunwayContext from all available signals.
 * Never throws. Returns partial context on failure.
 *
 * @param {object} signals
 * @param {string|null|undefined} signals.missionId
 * @param {string|null|undefined} signals.storeId        - from request body
 * @param {string|null|undefined} signals.draftId
 * @param {string|null|undefined} signals.userId
 * @param {string|null|undefined} signals.locale
 * @param {object|null|undefined} signals.currentContext - from dashboard
 * @returns {Promise<object>}
 */
export async function buildRunwayContext(signals) {
  const ctx = {
    missionId: null,
    activeStoreId: null,
    activeDraftId: null,
    activeWebsiteId: null,
    activeArtifactIds: [],
    activeMissionStage: null,
    activeIntent: null,
    locale: DEFAULT_LOCALE,
    editableTargets: [],
    recentOutputs: [],
    provenance: {},
  };

  try {
    const missionId = str(signals?.missionId);
    const storeId = str(signals?.storeId);
    const draftId = str(signals?.draftId);
    const userId = str(signals?.userId);
    const locale = str(signals?.locale);
    const dc = asObj(signals?.currentContext) ?? {};

    // ── Layer 1: Explicit signals (highest trust) ────────
    if (storeId) {
      ctx.activeStoreId = storeId;
      ctx.provenance.activeStoreId = PROVENANCE.EXPLICIT;
    }
    if (missionId) {
      ctx.missionId = missionId;
      ctx.provenance.missionId = PROVENANCE.EXPLICIT;
    }
    if (draftId) {
      ctx.activeDraftId = draftId;
      ctx.provenance.activeDraftId = PROVENANCE.EXPLICIT;
    }
    if (locale) {
      ctx.locale = locale;
    }

    // ── Layer 2: currentContext from dashboard ───────────
    if (!ctx.activeStoreId && str(dc.activeStoreId)) {
      ctx.activeStoreId = str(dc.activeStoreId);
      ctx.provenance.activeStoreId = PROVENANCE.INFERRED;
    }
    if (!ctx.missionId && str(dc.activeMissionId)) {
      ctx.missionId = str(dc.activeMissionId);
      ctx.provenance.missionId = PROVENANCE.INFERRED;
    }
    if (!ctx.activeDraftId && str(dc.activeDraftId)) {
      ctx.activeDraftId = str(dc.activeDraftId);
      ctx.provenance.activeDraftId = PROVENANCE.INFERRED;
    }
    if (!ctx.activeWebsiteId && str(dc.activeWebsiteId)) {
      ctx.activeWebsiteId = str(dc.activeWebsiteId);
      ctx.provenance.activeWebsiteId = PROVENANCE.INFERRED;
    }
    if (!ctx.locale && str(dc.locale)) {
      ctx.locale = str(dc.locale);
    }

    // ── Layer 3: Recover from mission record ─────────────
    if (ctx.missionId && !ctx.activeStoreId) {
      const resolved = await withTimeout(recoverFromMission(ctx.missionId, { userId }), RECOVERY_TIMEOUT_MS);
      if (resolved?.storeId) {
        ctx.activeStoreId = resolved.storeId;
        ctx.activeDraftId = ctx.activeDraftId ?? resolved.draftId ?? null;
        ctx.activeWebsiteId = ctx.activeWebsiteId ?? resolved.websiteId ?? null;
        ctx.activeMissionStage = resolved.stage ?? null;
        ctx.recentOutputs = Array.isArray(resolved.recentOutputs) ? resolved.recentOutputs : [];
        ctx.provenance.activeStoreId = PROVENANCE.MISSION;
      }
    }

    // ── Layer 4: Recover from recent missions ────────────
    if (!ctx.activeStoreId && userId) {
      const recent = await withTimeout(recoverFromRecentMission(userId), RECOVERY_TIMEOUT_MS);
      if (recent?.storeId) {
        ctx.activeStoreId = recent.storeId;
        ctx.missionId = ctx.missionId ?? recent.missionId ?? null;
        ctx.provenance.activeStoreId = PROVENANCE.RECENT;
      }
    }

    // ── Layer 5: Build editable targets ─────────────────
    if (ctx.activeStoreId || ctx.activeDraftId) {
      ctx.editableTargets = buildEditableTargets(ctx);
    }

    return ctx;
  } catch (e) {
    // Never throw — return partial context.
    const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
    console.warn('[RunwayContext] build failed:', msg);
    return ctx;
  }
}

/**
 * Recover store context from MissionPipeline (read-only).
 *
 * @param {string} missionId
 * @param {{ userId?: string }} [opts]
 */
async function recoverFromMission(missionId, opts = {}) {
  const mid = str(missionId);
  if (!mid) return null;
  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id: mid },
    select: {
      id: true,
      status: true,
      targetId: true,
      createdBy: true,
      outputsJson: true,
      metadataJson: true,
      updatedAt: true,
    },
  });
  if (!mission) return null;

  // Never use another user's mission as context.
  const uid = str(opts.userId);
  if (uid && str(mission.createdBy) && str(mission.createdBy) !== uid) {
    return null;
  }

  const outputs = asObj(mission.outputsJson) ?? {};
  const meta = asObj(mission.metadataJson) ?? {};
  const metaCtx = asObj(meta.context) ?? {};

  const storeId =
    str(mission.targetId) ||
    str(metaCtx.storeId) ||
    str(meta.storeId) ||
    str(outputs.storeId);

  const draftId =
    str(metaCtx.draftId) ||
    str(outputs.draftId) ||
    str(outputs.createdDraftId);

  const websiteId =
    str(metaCtx.websiteId) ||
    str(outputs.websiteId);

  if (!storeId) return null;

  return {
    storeId,
    draftId: draftId || null,
    websiteId: websiteId || null,
    stage: str(mission.status) || null,
    recentOutputs: Object.keys(outputs).length ? [outputs] : [],
  };
}

/**
 * Recover store context from the user's most recent MissionPipeline with a targetId.
 *
 * @param {string} userId
 */
async function recoverFromRecentMission(userId) {
  const uid = str(userId);
  if (!uid) return null;
  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findFirst({
    where: {
      createdBy: uid,
      targetId: { not: null },
      status: { in: ['completed', 'executing', 'paused', 'requested', 'planned', 'queued', 'awaiting_confirmation'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, targetId: true },
  });
  if (!mission) return null;
  const storeId = str(mission.targetId);
  if (!storeId) return null;
  return { missionId: str(mission.id), storeId };
}

function buildEditableTargets(ctx) {
  const targets = [];

  if (ctx.activeStoreId) {
    targets.push({
      type: 'store',
      id: ctx.activeStoreId,
      editableFields: [
        'store_name',
        'tagline',
        'description',
        'hero_title',
        'cta_text',
        'contact_info',
      ],
    });
  }

  if (ctx.activeDraftId) {
    targets.push({
      type: 'draft',
      id: ctx.activeDraftId,
      editableFields: [
        'hero_image',
        'hero_text',
        'sections',
        'color_scheme',
        'font',
      ],
    });
  }

  return targets;
}

/**
 * Maps a user's natural reference to an editable target + field.
 *
 * @param {object} ctx
 * @param {string} userReference
 */
export function resolveEditableTarget(ctx, userReference) {
  const ref = str(userReference).toLowerCase();
  const editableTargets = Array.isArray(ctx?.editableTargets) ? ctx.editableTargets : [];

  const storeTarget = editableTargets.find((t) => t?.type === 'store');
  const draftTarget = editableTargets.find((t) => t?.type === 'draft');

  if (
    ref.includes('store name') ||
    ref.includes('tên cửa hàng') ||
    ref.includes('rename store') ||
    ref.includes('đổi tên') ||
    ref.includes('sửa tên')
  ) {
    if (storeTarget) {
      return { target: storeTarget, field: 'store_name', confidence: 0.95 };
    }
  }

  if (
    ref.includes('hero') ||
    ref.includes('title') ||
    ref.includes('tiêu đề') ||
    ref.includes('banner')
  ) {
    if (draftTarget) {
      return { target: draftTarget, field: 'hero_title', confidence: 0.85 };
    }
  }

  if (ref.includes('tagline') || ref.includes('slogan') || ref.includes('khẩu hiệu')) {
    if (storeTarget) {
      return { target: storeTarget, field: 'tagline', confidence: 0.9 };
    }
  }

  return null;
}

export function isRunwayContextSufficient(ctx, requiredFields = ['activeStoreId']) {
  const required = Array.isArray(requiredFields) ? requiredFields : ['activeStoreId'];
  return required.every((field) => Boolean(ctx && ctx[field]));
}

export function formatContextGapMessage(ctx, locale) {
  const loc = str(locale) || DEFAULT_LOCALE;
  const isVI = loc.toLowerCase().startsWith('vi');
  const hasMission = Boolean(str(ctx?.missionId));
  const hasStore = Boolean(str(ctx?.activeStoreId));

  if (hasMission && !hasStore) {
    return isVI
      ? 'Tôi thấy một nhiệm vụ đang hoạt động nhưng không thể xác định cửa hàng cần chỉnh sửa. Bạn có muốn sử dụng cửa hàng từ nhiệm vụ gần nhất không?'
      : "I can see an active mission but couldn't resolve which store to edit. Would you like to use the store from your most recent mission?";
  }

  return isVI
    ? 'Vui lòng chọn cửa hàng bạn muốn chỉnh sửa.'
    : "Please select the store you'd like to edit.";
}

export function formatSuggestedActionsForContextGap(ctx) {
  const hasMission = Boolean(str(ctx?.missionId));
  if (hasMission) {
    return ['use_mission_store', 'select_different_store'];
  }
  return ['create_store', 'select_store'];
}

/**
 * Read activeStoreId from an already-built RunwayContext or intake/planner signals.
 * Does not query the database — call buildRunwayContext() upstream for full recovery.
 *
 * @param {object} [signals]
 * @returns {string | null}
 */
export function recoverStoreId(signals) {
  const s = signals && typeof signals === 'object' ? signals : {};
  return (
    str(s.runwayContext?.activeStoreId) ||
    str(s.activeStoreId) ||
    str(s.storeId) ||
    str(s.hydratedContext?.entities?.store?.id) ||
    str(s.currentContext?.activeStoreId) ||
    null
  );
}

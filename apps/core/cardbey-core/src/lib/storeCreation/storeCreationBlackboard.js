/**
 * Phase 1 — Store creation MissionBlackboard visibility helpers.
 * Non-fatal only: never throw into the generateDraft happy path.
 *
 * Uses the same appendEvent path as reasoning_line (agentMemory), not only the
 * orchestration adapter — so events land on GET /api/missions/:id/blackboard.
 */

import { appendEvent, ensureMissionRowForBlackboard } from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';

/**
 * @param {string|null|undefined} missionId
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
export async function appendStoreCreationBlackboardEvent(missionId, eventType, payload = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const et = typeof eventType === 'string' ? eventType.trim() : '';
  if (!mid || !et) {
    console.warn('[storeCreationBlackboard] skip append — missing missionId or eventType', {
      missionId: mid || null,
      eventType: et || null,
    });
    return { ok: false, skipped: true };
  }
  try {
    await ensureMissionRowForBlackboard(mid).catch(() => {});
    const result = await appendEvent(
      mid,
      et,
      {
        ...payload,
        missionId: mid,
        source: 'store_creation_phase1',
        at: new Date().toISOString(),
      },
      { agentId: 'store_creation' },
    );
    if (!result?.ok) {
      console.warn('[storeCreationBlackboard] appendEvent returned not-ok', {
        missionId: mid,
        eventType: et,
        error: result?.error ?? null,
      });
    } else if (process.env.NODE_ENV !== 'production') {
      console.log('[storeCreationBlackboard] appended', {
        missionId: mid,
        eventType: et,
        seq: result?.seq ?? null,
        draftId: payload?.draftId ?? null,
      });
    }
    return result && typeof result === 'object' ? result : { ok: true };
  } catch (err) {
    console.warn(
      `[storeCreationBlackboard] append ${et} failed (non-fatal):`,
      err?.message ?? err,
    );
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Enrich catalog/media payloads from DraftStore without changing generation logic.
 * @param {string} draftId
 * @param {'research'|'catalog'|'media'|'copy'|string} tool
 */
async function enrichMilestonePayload(draftId, tool) {
  const base = { draftId };
  if (tool !== 'catalog' && tool !== 'media') return base;
  try {
    const prisma = getPrismaClient();
    const row = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { preview: true },
    });
    const preview =
      row?.preview && typeof row.preview === 'object' && !Array.isArray(row.preview)
        ? row.preview
        : {};
    if (tool === 'catalog') {
      const products = Array.isArray(preview.items)
        ? preview.items
        : Array.isArray(preview.catalog?.products)
          ? preview.catalog.products
          : Array.isArray(preview.products)
            ? preview.products
            : [];
      return { ...base, itemCount: products.length };
    }
    const heroUrl =
      (typeof preview.heroImageUrl === 'string' && preview.heroImageUrl.trim()) ||
      (typeof preview.heroUrl === 'string' && preview.heroUrl.trim()) ||
      (typeof preview.logoUrl === 'string' && preview.logoUrl.trim()) ||
      null;
    return { ...base, heroUrl };
  } catch {
    return tool === 'catalog' ? { ...base, itemCount: 0 } : { ...base, heroUrl: null };
  }
}

const MILESTONE_EVENT_BY_TOOL = {
  research: 'store:research_complete',
  catalog: 'store:catalog_complete',
  media: 'store:media_complete',
  copy: 'store:copy_complete',
};

/**
 * Wrap an existing stepReporter so completed research/catalog/media/copy
 * also emit MissionBlackboard events. Does not alter started/failed semantics.
 *
 * @param {{
 *   missionId?: string|null,
 *   draftId: string,
 *   stepReporter?: { started?: Function, completed?: Function, failed?: Function },
 * }} opts
 */
export function wrapStepReporterForStoreBlackboard(opts = {}) {
  const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
  const base = opts.stepReporter ?? {
    started: () => Promise.resolve(),
    completed: () => Promise.resolve(),
    failed: () => Promise.resolve(),
  };

  if (!missionId) {
    console.warn('[storeCreationBlackboard] wrapStepReporter: missionId missing — store:* events will not emit', {
      draftId: draftId || null,
    });
  }

  return {
    started: (...args) => Promise.resolve(base.started?.(...args)).catch(() => {}),
    completed: async (tool, extra) => {
      try {
        await base.completed?.(tool, extra);
      } catch {
        /* base reporter already non-fatal at call sites */
      }
      const toolKey = String(tool || '').trim();
      const eventType = MILESTONE_EVENT_BY_TOOL[toolKey];
      if (!eventType || !missionId || !draftId) return;
      const payload = await enrichMilestonePayload(draftId, toolKey);
      await appendStoreCreationBlackboardEvent(missionId, eventType, payload);
      // Phase 2: after catalog_complete with empty items → vertical seed (non-blocking).
      if (toolKey === 'catalog' && Number(payload.itemCount) === 0) {
        try {
          const { seedEmptyCatalogAfterComplete } = await import('./recoverEmptyStoreCatalog.js');
          await seedEmptyCatalogAfterComplete({ missionId, draftId });
        } catch (seedErr) {
          console.warn(
            '[storeCreationBlackboard] catalog seed after complete failed (non-fatal):',
            seedErr?.message ?? seedErr,
          );
        }
      }
    },
    failed: async (tool, reason) => {
      try {
        await base.failed?.(tool, reason);
      } catch {
        /* ignore */
      }
      if (!missionId || !draftId) return;
      await appendStoreCreationBlackboardEvent(missionId, 'store:draft_failed', {
        draftId,
        errorCode: typeof reason === 'string' ? reason : reason?.code ?? 'STEP_FAILED',
        tool: tool ?? null,
      });
    },
  };
}

/**
 * Soft / critical content evaluation for store drafts (Phase 2 verify).
 * @param {object|null|undefined} preview
 * @returns {{
 *   hasProducts: boolean,
 *   hasTagline: boolean,
 *   hasDescription: boolean,
 *   hasHero: boolean,
 *   hasName: boolean,
 *   sparseHonest: boolean,
 *   hasMinimumContent: boolean,
 *   criticalOk: boolean,
 *   issues: string[],
 * }}
 */
export function evaluateStoreDraftCriticalContent(preview) {
  const p =
    preview && typeof preview === 'object' && !Array.isArray(preview) ? preview : {};
  const products = Array.isArray(p.products)
    ? p.products
    : Array.isArray(p.items)
      ? p.items
      : Array.isArray(p.catalog?.products)
        ? p.catalog.products
        : [];
  const tagline = String(p.tagline ?? p.slogan ?? '').trim();
  const description = String(p.description ?? p.storeDescription ?? '').trim();
  const name = String(p.name ?? p.storeName ?? '').trim();
  const heroUrl =
    (typeof p.heroImageUrl === 'string' && p.heroImageUrl.trim()) ||
    (typeof p.hero?.imageUrl === 'string' && p.hero.imageUrl.trim()) ||
    (typeof p.hero?.url === 'string' && p.hero.url.trim()) ||
    '';
  const sparseHonest = p.meta?.catalogSource === 'sparse_honest';

  const hasProducts = products.length > 0;
  const hasTagline = tagline.length >= 3;
  const hasDescription = description.length >= 8;
  const hasHero = heroUrl.length > 0;
  const hasName = name.length > 0;
  const hasMinimumContent = hasProducts || hasName;

  /** @type {string[]} */
  const issues = [];
  if (!sparseHonest && !hasProducts) issues.push('products');
  if (!hasTagline) issues.push('tagline');
  if (!hasDescription) issues.push('description');
  if (!hasHero) issues.push('hero');

  const criticalOk =
    (sparseHonest || hasProducts) && hasTagline && hasDescription && hasHero;

  return {
    hasProducts,
    hasTagline,
    hasDescription,
    hasHero,
    hasName,
    sparseHonest,
    hasMinimumContent,
    criticalOk,
    issues,
  };
}

/**
 * Soft post-generateDraft verify — never throws into the generateDraft happy path.
 * Phase 2: richer critical-field payload; callers may soft-block auto-publish on !criticalOk.
 * @param {{ missionId?: string|null, draftId: string }} opts
 * @returns {Promise<{ ok?: boolean, skipped?: boolean, evaluation?: ReturnType<typeof evaluateStoreDraftCriticalContent> }>}
 */
export async function appendStoreCreationVerifyComplete(opts = {}) {
  const missionId = typeof opts.missionId === 'string' ? opts.missionId.trim() : '';
  const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
  if (!missionId || !draftId) return { ok: false, skipped: true };

  let evaluation = evaluateStoreDraftCriticalContent(null);
  try {
    const prisma = getPrismaClient();
    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    const preview =
      draft?.preview && typeof draft.preview === 'object' && !Array.isArray(draft.preview)
        ? draft.preview
        : {};
    evaluation = evaluateStoreDraftCriticalContent(preview);
  } catch (err) {
    console.warn(
      '[storeCreationBlackboard] verify draft read failed (non-fatal):',
      err?.message ?? err,
    );
  }

  console.log('[storeCreationBlackboard] store:verify_complete', {
    missionId,
    draftId,
    hasMinimumContent: evaluation.hasMinimumContent,
    criticalOk: evaluation.criticalOk,
    issues: evaluation.issues,
  });

  const appendResult = await appendStoreCreationBlackboardEvent(missionId, 'store:verify_complete', {
    draftId,
    hasMinimumContent: evaluation.hasMinimumContent,
    criticalOk: evaluation.criticalOk,
    hasProducts: evaluation.hasProducts,
    hasTagline: evaluation.hasTagline,
    hasDescription: evaluation.hasDescription,
    hasHero: evaluation.hasHero,
    issues: evaluation.issues,
  });

  // Phase 2 verify gate: block publish when products missing (mission continues to checkpoint).
  const productsMissing =
    evaluation.criticalOk === false && Array.isArray(evaluation.issues) && evaluation.issues.includes('products');
  if (productsMissing) {
    try {
      await setDraftPublishBlocked({
        draftId,
        blocked: true,
        issues: evaluation.issues,
        reason: 'no_products',
      });
      await appendStoreCreationBlackboardEvent(missionId, 'store:publish_blocked', {
        draftId,
        reason: 'no_products',
        issues: evaluation.issues,
      });
    } catch (blockErr) {
      console.warn(
        '[storeCreationBlackboard] publish_blocked flag failed (non-fatal):',
        blockErr?.message ?? blockErr,
      );
    }
  }

  return { ...appendResult, evaluation, publishBlocked: productsMissing };
}

/**
 * DraftStore has no metadataJson column — persist under input.metadataJson (no migration).
 * @param {{ draftId: string, blocked: boolean, issues?: string[], reason?: string }} opts
 */
export async function setDraftPublishBlocked(opts = {}) {
  const draftId = typeof opts.draftId === 'string' ? opts.draftId.trim() : '';
  if (!draftId) return { ok: false, skipped: true };
  try {
    const prisma = getPrismaClient();
    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { input: true },
    });
    const prevInput =
      draft?.input && typeof draft.input === 'object' && !Array.isArray(draft.input)
        ? draft.input
        : {};
    const prevMeta =
      prevInput.metadataJson && typeof prevInput.metadataJson === 'object' && !Array.isArray(prevInput.metadataJson)
        ? prevInput.metadataJson
        : {};
    await prisma.draftStore.update({
      where: { id: draftId },
      data: {
        input: {
          ...prevInput,
          metadataJson: {
            ...prevMeta,
            publishBlocked: opts.blocked === true,
            publishBlockedReason: opts.reason ?? (opts.blocked ? 'no_products' : null),
            publishBlockedIssues: Array.isArray(opts.issues) ? opts.issues : [],
          },
        },
      },
    });
    return { ok: true };
  } catch (err) {
    console.warn('[storeCreationBlackboard] setDraftPublishBlocked failed:', err?.message ?? err);
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * @param {object|null|undefined} draftRow - DraftStore row with input
 * @returns {{ blocked: boolean, reason: string|null, issues: string[] }}
 */
export function readDraftPublishBlocked(draftRow) {
  const input =
    draftRow?.input && typeof draftRow.input === 'object' && !Array.isArray(draftRow.input)
      ? draftRow.input
      : {};
  const meta =
    input.metadataJson && typeof input.metadataJson === 'object' && !Array.isArray(input.metadataJson)
      ? input.metadataJson
      : {};
  return {
    blocked: meta.publishBlocked === true,
    reason: typeof meta.publishBlockedReason === 'string' ? meta.publishBlockedReason : null,
    issues: Array.isArray(meta.publishBlockedIssues) ? meta.publishBlockedIssues : [],
  };
}

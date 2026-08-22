/**
 * Design adapter mutations (C2) — draft-only setTemplate / setHero.
 */

import Features from '../../config/features.js';
import { resolveWebsiteEditingContext } from './resolveWebsiteEditingContext.js';
import { buildDesignPresentationProjection } from './buildDesignPresentationProjection.js';
import { resolveCanonicalDesignPreset } from './designPresets.js';
import {
  buildDesignPresentationEnvelope,
  draftRevisionFingerprint,
  readDesignPresentationEnvelope,
} from './designPresentationEnvelope.js';
import { patchDraftPreview } from '../draftStore/draftStoreService.js';
import { updateHeroForStore } from '../draftStore/heroUpdateService.js';
import { DESIGN_READINESS } from './designAdapterContract.js';

function parsePreview(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseStylePrefs(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? { ...p } : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function writeDesignAudit(prisma, {
  draftId,
  storeId,
  actorId,
  actorRole,
  command,
  result,
  previousSafe,
  nextSafe,
  source,
  adminReason = null,
}) {
  try {
    if (!prisma?.auditEvent?.create) return;
    await prisma.auditEvent.create({
      data: {
        entityType: 'DraftStore',
        entityId: String(draftId || storeId || ''),
        action: `website_editing.design.${command}.${result}`,
        actorType: 'human',
        actorId: actorId ? String(actorId) : null,
        reason: adminReason
          ? String(adminReason).slice(0, 500)
          : `design_${command}`,
        metadata: {
          storeId: storeId || null,
          draftId: draftId || null,
          command,
          result,
          previous: previousSafe ?? null,
          next: nextSafe ?? null,
          source: source || null,
        },
      },
    });
  } catch (err) {
    console.warn('[designAdapterMutations] audit failed (non-fatal):', err?.message || err);
  }
}

/**
 * Mark composition/adoption stale on Business.stylePreferences (metadata only).
 * Does not rewrite theme/miniWebsite content.
 */
async function markCompositionStaleOnMaterialDesignChange(prisma, business, { command, actorId }) {
  if (!business?.id) return { marked: false };
  const prefs = parseStylePrefs(business.stylePreferences);
  let changed = false;
  for (const key of ['compositionAdoption', 'designAdoption', 'websiteDirection']) {
    const node = prefs[key];
    if (node && typeof node === 'object' && node.status && node.status !== 'stale') {
      prefs[key] = {
        ...node,
        status: 'stale',
        staleReason: `design_adapter_${command}`,
        staleAt: new Date().toISOString(),
        staleBy: actorId || null,
      };
      changed = true;
    }
  }
  if (!changed) return { marked: false };
  await prisma.business.update({
    where: { id: business.id },
    data: { stylePreferences: prefs },
  });
  return { marked: true, keys: ['compositionAdoption', 'designAdoption', 'websiteDirection'] };
}

function assertFlagEnabled() {
  if (!Features.websiteEditingDesignAdapter?.v1) {
    const err = new Error('Website Editing Design adapter is not enabled');
    err.statusCode = 403;
    err.code = 'NOT_ENABLED';
    err.readiness = DESIGN_READINESS.NOT_ENABLED;
    throw err;
  }
}

function assertOcc(draft, expectedFingerprint) {
  if (expectedFingerprint == null || String(expectedFingerprint).trim() === '') {
    return;
  }
  const current = draftRevisionFingerprint(draft);
  if (current !== String(expectedFingerprint).trim()) {
    const err = new Error('Draft revision conflict — refresh and retry');
    err.statusCode = 409;
    err.code = 'revision_conflict';
    err.currentFingerprint = current;
    throw err;
  }
}

function rejectUnsafeTokenBlob(body) {
  if (!body || typeof body !== 'object') return;
  if (body.css != null || body.stylesheet != null || body.script != null || body.tokensBlob != null) {
    const err = new Error('Arbitrary CSS/script/token blobs are not accepted');
    err.statusCode = 400;
    err.code = 'unsafe_payload';
    throw err;
  }
  if (body.designTokens && typeof body.designTokens === 'object') {
    const err = new Error('Raw design token blobs are not accepted in C2; use registered presets only');
    err.statusCode = 400;
    err.code = 'unsafe_payload';
    throw err;
  }
}

function inferBootstrapSource(preview, business) {
  const env = readDesignPresentationEnvelope(preview);
  if (env?.templateId) return null; // already explicit
  const theme = preview?.website?.theme;
  if (theme?.templateId) return 'draft_store_preview';
  const prefs = parseStylePrefs(business?.stylePreferences);
  if (prefs.compositionAdoption || prefs.designAdoption) return 'composition_adoption';
  if (prefs.miniWebsite?.theme?.templateId) return 'mini_website_legacy';
  if (prefs.templateId || prefs.stylePreset) return 'business_style_preferences';
  return 'defaults';
}

/**
 * @param {object} args
 */
export async function executeSetTemplate(prisma, args) {
  assertFlagEnabled();
  rejectUnsafeTokenBlob(args.body || args);

  const storeId = String(args.storeId || '').trim();
  const userId = args.userId;
  const adminSupport = Boolean(args.adminSupport);
  const adminReason = args.adminReason != null ? String(args.adminReason).trim() : null;
  if (adminSupport && !adminReason) {
    const err = new Error('Admin reason required');
    err.statusCode = 400;
    err.code = 'admin_reason_required';
    throw err;
  }

  const presetResult = resolveCanonicalDesignPreset(args.presetId ?? args.templateId ?? args.body?.presetId);
  if (!presetResult.ok) {
    const err = new Error(presetResult.error);
    err.statusCode = 400;
    err.code = presetResult.code;
    throw err;
  }
  const presetId = presetResult.presetId;

  const editingContext = await resolveWebsiteEditingContext(prisma, {
    storeId,
    draftId: args.draftId || null,
    userId,
    user: args.user,
    adminSupport,
    allowInit: true,
  });
  const draftId = editingContext.draftId;
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft) {
    const err = new Error('Draft not found');
    err.statusCode = 404;
    err.code = 'draft_not_found';
    throw err;
  }
  assertOcc(draft, args.expectedFingerprint ?? args.body?.expectedFingerprint);

  const preview = parsePreview(draft.preview);
  const website = preview.website && typeof preview.website === 'object' ? { ...preview.website } : {};
  const theme = website.theme && typeof website.theme === 'object' ? { ...website.theme } : {};
  const previousEnv = readDesignPresentationEnvelope(preview);
  const previousPreset = previousEnv?.templateId || theme.templateId || null;

  if (previousPreset === presetId && previousEnv?.templateId === presetId) {
    await writeDesignAudit(prisma, {
      draftId,
      storeId,
      actorId: userId,
      actorRole: adminSupport ? 'admin' : 'owner',
      command: 'setTemplate',
      result: 'idempotent',
      previousSafe: previousPreset,
      nextSafe: presetId,
      source: 'owner_mutation',
      adminReason,
    });
    const business = await prisma.business.findUnique({ where: { id: storeId } });
    const projection = buildDesignPresentationProjection({
      business,
      draft,
      editingContext,
      flagEnabled: true,
      mutationCapabilities: { setTemplate: true, setHero: true },
    });
    return {
      ok: true,
      idempotent: true,
      draftId,
      storeId,
      presetId,
      fingerprint: draftRevisionFingerprint(draft),
      projection,
    };
  }

  const business = await prisma.business.findUnique({ where: { id: storeId } });
  const bootstrapSource = inferBootstrapSource(preview, business);

  theme.templateId = presetId;
  website.theme = theme;
  website.designPresentationV1 = buildDesignPresentationEnvelope({
    previous: previousEnv,
    templateId: presetId,
    source: adminSupport ? 'admin_mutation' : 'owner_mutation',
    bootstrapSource: previousEnv?.templateId ? previousEnv.provenance?.bootstrapSource : bootstrapSource,
    actorId: userId,
    baseRevisionFingerprint: draftRevisionFingerprint(draft),
  });
  preview.website = website;

  await patchDraftPreview(draftId, { website: preview.website }, {
    writer: 'designAdapter.setTemplate',
    storeId,
    allowCommitted: draft.status === 'committed',
  });

  const stale = await markCompositionStaleOnMaterialDesignChange(prisma, business, {
    command: 'setTemplate',
    actorId: userId,
  });

  const fresh = await prisma.draftStore.findUnique({ where: { id: draftId } });
  await writeDesignAudit(prisma, {
    draftId,
    storeId,
    actorId: userId,
    actorRole: adminSupport ? 'admin' : 'owner',
    command: 'setTemplate',
    result: 'ok',
    previousSafe: previousPreset,
    nextSafe: presetId,
    source: bootstrapSource || 'owner_mutation',
    adminReason,
  });

  const businessAfter = await prisma.business.findUnique({ where: { id: storeId } });
  const projection = buildDesignPresentationProjection({
    business: businessAfter,
    draft: fresh,
    editingContext: { ...editingContext, draftId },
    flagEnabled: true,
    mutationCapabilities: { setTemplate: true, setHero: true },
  });

  return {
    ok: true,
    idempotent: false,
    draftId,
    storeId,
    presetId,
    fingerprint: draftRevisionFingerprint(fresh),
    compositionStaleMarked: stale.marked,
    projection,
  };
}

/**
 * setHero — reuses updateHeroForStore with draftOnly (no Business write).
 */
export async function executeSetHero(prisma, args) {
  assertFlagEnabled();
  rejectUnsafeTokenBlob(args.body || args);

  const storeId = String(args.storeId || '').trim();
  const userId = args.userId;
  const adminSupport = Boolean(args.adminSupport);
  const adminReason = args.adminReason != null ? String(args.adminReason).trim() : null;
  if (adminSupport && !adminReason) {
    const err = new Error('Admin reason required');
    err.statusCode = 400;
    err.code = 'admin_reason_required';
    throw err;
  }

  const body = args.body && typeof args.body === 'object' ? args.body : args;
  const previewPatch = body.previewPatch && typeof body.previewPatch === 'object'
    ? body.previewPatch
    : {
        ...(body.heroImageUrl != null ? { heroImageUrl: body.heroImageUrl } : {}),
        ...(body.heroVideoUrl != null ? { heroVideoUrl: body.heroVideoUrl } : {}),
        ...(body.heroMediaType != null ? { heroMediaType: body.heroMediaType } : {}),
        ...(body.hero != null ? { hero: body.hero } : {}),
        ...(body.heroPosterUrl != null ? { heroPosterUrl: body.heroPosterUrl } : {}),
      };

  if (!Object.keys(previewPatch).length) {
    const err = new Error('No hero fields to save');
    err.statusCode = 400;
    err.code = 'hero_patch_required';
    throw err;
  }

  const editingContext = await resolveWebsiteEditingContext(prisma, {
    storeId,
    draftId: args.draftId || body.draftId || null,
    userId,
    user: args.user,
    adminSupport,
    allowInit: true,
  });
  const draft = await prisma.draftStore.findUnique({ where: { id: editingContext.draftId } });
  if (!draft) {
    const err = new Error('Draft not found');
    err.statusCode = 404;
    err.code = 'draft_not_found';
    throw err;
  }
  assertOcc(draft, args.expectedFingerprint ?? body.expectedFingerprint);

  const beforePreview = parsePreview(draft.preview);
  const beforeHero = {
    image: beforePreview.heroImageUrl || beforePreview.hero?.imageUrl || null,
    video: beforePreview.heroVideoUrl || beforePreview.hero?.videoUrl || null,
  };

  const result = await updateHeroForStore({
    prisma,
    userId,
    storeId,
    draftId: editingContext.draftId,
    previewPatch,
    source: body.source || 'design_adapter',
    draftOnly: true,
  });

  const fresh = await prisma.draftStore.findUnique({ where: { id: editingContext.draftId } });
  const afterPreview = parsePreview(fresh?.preview);
  const website = afterPreview.website && typeof afterPreview.website === 'object' ? { ...afterPreview.website } : {};
  const previousEnv = readDesignPresentationEnvelope(afterPreview);
  website.designPresentationV1 = buildDesignPresentationEnvelope({
    previous: previousEnv,
    heroRef: {
      mediaType: result.heroMediaType,
      hasImage: Boolean(result.heroImageUrl),
      hasVideo: Boolean(result.heroVideoUrl),
    },
    source: adminSupport ? 'admin_mutation' : 'owner_mutation',
    actorId: userId,
    baseRevisionFingerprint: draftRevisionFingerprint(draft),
  });
  afterPreview.website = website;
  await patchDraftPreview(editingContext.draftId, { website }, {
    writer: 'designAdapter.setHero.envelope',
    storeId,
    allowCommitted: fresh?.status === 'committed',
  });

  const business = await prisma.business.findUnique({ where: { id: storeId } });
  const stale = await markCompositionStaleOnMaterialDesignChange(prisma, business, {
    command: 'setHero',
    actorId: userId,
  });

  const finalDraft = await prisma.draftStore.findUnique({ where: { id: editingContext.draftId } });
  await writeDesignAudit(prisma, {
    draftId: editingContext.draftId,
    storeId,
    actorId: userId,
    actorRole: adminSupport ? 'admin' : 'owner',
    command: 'setHero',
    result: 'ok',
    previousSafe: beforeHero,
    nextSafe: {
      mediaType: result.heroMediaType,
      hasImage: Boolean(result.heroImageUrl),
      hasVideo: Boolean(result.heroVideoUrl),
    },
    source: 'owner_mutation',
    adminReason,
  });

  const businessAfter = await prisma.business.findUnique({ where: { id: storeId } });
  const projection = buildDesignPresentationProjection({
    business: businessAfter,
    draft: finalDraft,
    editingContext,
    flagEnabled: true,
    mutationCapabilities: { setTemplate: true, setHero: true },
  });

  return {
    ok: true,
    draftId: editingContext.draftId,
    storeId,
    hero: {
      heroImageUrl: result.heroImageUrl,
      heroVideoUrl: result.heroVideoUrl,
      heroMediaType: result.heroMediaType,
    },
    businessUpdated: Boolean(result.businessUpdated),
    fingerprint: draftRevisionFingerprint(finalDraft),
    compositionStaleMarked: stale.marked,
    projection,
  };
}

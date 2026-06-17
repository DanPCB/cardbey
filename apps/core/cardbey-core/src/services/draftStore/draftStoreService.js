if (process.env.NODE_ENV !== 'production') {
  console.log('[LOAD] draftStoreService.js ownerTenantFix v3');
}
/**
 * Draft Store Service
 * Handles creation, generation, and commitment of draft stores
 */

import { prisma } from '../../lib/prisma.js';
import { runCriticalSqliteWriteWithP1008Retry } from '../../lib/sqliteCriticalWrite.js';
import { safeDraftStoreCreate } from '../../lib/safeDraftStoreCreate.js';
import { isShutdownRequested } from '../../lib/coreShutdown.js';
import { emitHealthProbe } from '../../lib/telemetry/healthProbes.js';
import { resolveContent } from '../../lib/contentResolution/contentResolver.js';
import {
  syncHeroFieldsIntoPreviewWebsite,
  applyPipelineGeneratedHeroImage,
  copyVideoHeroFieldsToPreview,
  protectVideoHeroFromImageOnlyOverwrite,
  getExistingVideoUrlFromPreview,
  readCanonicalHeroFromPreview,
} from './draftPreviewHeroSync.js';
import {
  normalizeHeroFieldsInPreview,
  normalizeHeroPreviewPatchForStorage,
} from './normalizeHeroMediaUrlsForStorage.js';
import {
  recomputeDraftCategoriesFromItems as recomputeCategoriesFromItemsImpl,
  sanitizeDraftCategoryList,
  validateCategoriesForPublish,
} from '../../lib/draftCategoryUtils.js';
import { resolveStoreCommerce, normalizeCatalogItem } from '../../lib/storeTransactionMode.js';

/** Store MissionPipeline id (same as Mission.id for pipeline missions) — cooperative cancel while finalizeDraft runs. */
async function isMissionPipelineCancelled(pipelineMissionId) {
  const id = pipelineMissionId != null ? String(pipelineMissionId).trim() : '';
  if (!id) return false;
  const row = await prisma.missionPipeline
    .findUnique({ where: { id }, select: { status: true } })
    .catch(() => null);
  return String(row?.status || '').toLowerCase() === 'cancelled';
}

/**
 * Normalize draft preview categories so "Other" exists and every item has a valid categoryId.
 * Deterministic contract: categories include { id: 'other', name: 'Other' }; invalid/missing item.categoryId → 'other'.
 * Non-breaking: if preview is null or shape unexpected, returns unchanged.
 */
export function normalizePreviewCategories(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  let categories = Array.isArray(preview.categories) ? [...preview.categories] : [];
  const items = Array.isArray(preview.items) ? preview.items : [];

  // Ensure "Other" category with stable id 'other'
  const hasOtherById = categories.some((c) => c && String(c.id).toLowerCase().trim() === 'other');
  const otherByName = categories.find((c) => c && String(c.name || c.label || '').trim().toLowerCase() === 'other');
  let otherId = 'other';
  if (otherByName && String(otherByName.id).toLowerCase().trim() !== 'other') {
    otherId = 'other';
    const oldId = String(otherByName.id).trim();
    categories = categories.map((c) => {
      if (c && String(c.id).trim() === oldId) return { id: 'other', name: 'Other' };
      return c;
    });
    items.forEach((it) => {
      if (it && String(it.categoryId || '').trim() === oldId) it.categoryId = 'other';
    });
  } else if (!hasOtherById && !otherByName) {
    categories.push({ id: 'other', name: 'Other' });
  } else if (otherByName && String(otherByName.id).trim() !== 'other') {
    categories = categories.map((c) => (c && String(c.id).trim() === (otherByName.id || '').trim() ? { id: 'other', name: 'Other' } : c));
  }

  const validCategoryIds = new Set(categories.map((c) => c && c.id && String(c.id).trim()).filter(Boolean));
  validCategoryIds.add('other');

  let reassignedCount = 0;
  items.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const cid = it.categoryId != null ? String(it.categoryId).trim() : '';
    if (!cid || !validCategoryIds.has(cid)) {
      it.categoryId = 'other';
      reassignedCount += 1;
    }
  });

  const categoryValidation = validateCategoriesForPublish(categories);
  if (!categoryValidation.ok && items.length > 0) {
    const recomputed = recomputeCategoriesFromItemsImpl(items);
    preview.categories = sanitizeDraftCategoryList(recomputed.categories);
    preview.items = recomputed.items;
  } else {
    preview.categories = sanitizeDraftCategoryList(categories);
  }
  if (reassignedCount > 0 && (process.env.NODE_ENV === 'development' || process.env.LOG_DRAFT_CATEGORIES === '1')) {
    console.log('[DraftStore] normalizePreviewCategories: reassigned items to other', { count: reassignedCount });
  }
  return preview;
}

/**
 * Map draft preview category ids to display names (same contract as publishDraftService).
 * @param {unknown[]} categories
 * @returns {Map<string, string>}
 */
export function buildCategoryIdToNameMap(categories) {
  const draftCatIdToName = new Map();
  for (const c of Array.isArray(categories) ? categories : []) {
    if (c && c.id != null && (c.name != null || c.label != null)) {
      draftCatIdToName.set(String(c.id).trim(), String(c.name ?? c.label ?? '').trim() || 'Other');
    }
  }
  if (!draftCatIdToName.has('other')) {
    draftCatIdToName.set('other', 'Other');
  }
  return draftCatIdToName;
}

/**
 * @param {object | null | undefined} item
 * @param {Map<string, string>} draftCatIdToName
 * @param {string} [otherDefault]
 */
export function resolveDraftProductCategoryName(item, draftCatIdToName, otherDefault = 'Other') {
  const map = draftCatIdToName instanceof Map ? draftCatIdToName : new Map();
  const draftCatId = item?.categoryId != null ? String(item.categoryId).trim() : null;
  const fromMap = draftCatId && map.get(draftCatId);
  if (fromMap) return fromMap;
  const direct = item?.category != null && String(item.category).trim();
  if (direct) return direct;
  return map.get('other') ?? otherDefault;
}

/**
 * First usable image URL from draft item shapes (preview.items / catalog.products).
 * @param {object | null | undefined} item
 * @returns {string | null}
 */
export function resolveDraftItemImageUrl(item) {
  if (!item || typeof item !== 'object') return null;
  const u =
    item.imageUrl ??
    (typeof item.image === 'string' ? item.image : null) ??
    (item.image && typeof item.image === 'object' ? item.image.url ?? item.image.imageUrl : null) ??
    item.primaryImageUrl ??
    null;
  if (u == null) return null;
  const s = String(u).trim();
  return s || null;
}

/** True for absolute http(s) URLs usable as product/hero images (rejects relative paths and bare tokens). */
export function isAbsoluteHttpUrl(url) {
  if (url == null) return false;
  const s = String(url).trim();
  return /^https?:\/\//i.test(s);
}

/** resolveDraftItemImageUrl when the value is an absolute http(s) URL. */
export function resolveUsableDraftItemImageUrl(item) {
  const raw = resolveDraftItemImageUrl(item);
  if (!raw) return null;
  return isAbsoluteHttpUrl(raw) ? raw : null;
}

/**
 * Parsed price for Product.price, or null when missing / invalid / non‑positive (avoid $0.00 placeholders).
 * @param {object | null | undefined} item
 * @returns {number | null}
 */
export function normalizeDraftProductPrice(item) {
  if (!item || typeof item !== 'object') return null;
  const raw = item.priceV1?.amount ?? item.price;
  if (raw == null || raw === '') return null;
  const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/**
 * Deterministic default CTA for draft preview / publish when none is set.
 * Matches coarse store kinds: service, product, food; everything else → visit.
 * @param {{ storeType?: string | null, businessType?: string | null }} context
 * @returns {{ label: string, action: string }}
 */
export function resolveGeneratedCTA(context) {
  const commerce = resolveStoreCommerce({
    storeType: context?.storeType,
    businessType: context?.businessType,
    items: context?.items,
  });
  return { label: commerce.ctaLabel, action: commerce.ctaAction };
}

/**
 * Apply commerceMode, transactionMode, item kinds, and default CTA from business type + items.
 * @param {object} preview
 * @returns {object}
 */
export function applyCommerceFieldsToPreview(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  const commerce = resolveStoreCommerce({
    storeType: preview.storeType,
    businessType: preview.meta?.storeType,
    commerceMode: preview.commerceMode,
    transactionMode: preview.transactionMode,
    items: preview.items,
    ctaLabel: preview.ctaLabel,
    catalogLabel: preview.catalogLabel,
    ctaAction: preview.storefront?.cta?.action,
  });
  preview.commerceMode = commerce.commerceMode;
  preview.transactionMode = commerce.transactionMode;
  preview.catalogLabel = commerce.catalogLabel;
  preview.ctaLabel = commerce.ctaLabel;
  if (Array.isArray(preview.items)) {
    const businessType = preview.storeType ?? preview.meta?.storeType ?? null;
    const businessName = preview.storeName ?? preview.name ?? null;
    preview.items = preview.items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const normalized = normalizeCatalogItem(it, {
        businessType,
        businessName,
        commerceMode: commerce.commerceMode,
      });
      return { ...it, ...normalized };
    });
  }
  const sf = preview.storefront && typeof preview.storefront === 'object' ? { ...preview.storefront } : {};
  if (!hasMeaningfulCta(sf.cta)) {
    preview.storefront = {
      ...sf,
      cta: { label: commerce.ctaLabel, action: commerce.ctaAction },
    };
  }
  return preview;
}

function hasMeaningfulCta(cta) {
  return (
    cta &&
    typeof cta === 'object' &&
    (String(cta.label || '').trim() || String(cta.action || '').trim())
  );
}

import { performMenuOcr } from '../../modules/menu/performMenuOcr.js';
import { generateUniqueStoreSlugForTx } from '../../utils/slug.js';
import { getMenuCategoriesAndAssignments, isFoodBusiness } from './menuCategories.js';
import { effectiveVertical, applyItemGuards, applyNameGuards, isDraftGuardsEnabled, isBlockedCandidateForFood } from './draftGuards.js';
import { transitionDraftStoreStatus } from '../../kernel/transitions/transitionService.js';

function tsModuleUnavailable(name) {
  const e = new Error(`${name} unavailable in plain Node runtime. Run server with tsx or add build step to compile TS.`);
  e.status = 501;
  e.code = 'TS_MODULE_UNAVAILABLE';
  return e;
}

import { loadBusinessProfileService } from './loadBusinessProfileService.js';

let _menuVisualAgentMod;
async function loadMenuVisualAgent() {
  try {
    return (_menuVisualAgentMod ??= await import('../menuVisualAgent/menuVisualAgent.ts'));
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

let _heroGenerationServiceMod;
async function loadHeroGenerationService() {
  try {
    return (_heroGenerationServiceMod ??= await import('../mi/heroGenerationService.ts'));
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

let _draftPreviewSchemaMod;
async function loadDraftPreviewSchema() {
  try {
    return (_draftPreviewSchemaMod ??= await import('./draftPreviewSchema.js'));
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}
import { generateVerticalLockedMenu } from './menuGenerationService.js';
import { generateToken } from '../../middleware/auth.js';
import bcrypt from 'bcryptjs';
import { resolveGenerationParams } from './resolveGenerationParams.js';
import { buildCatalog } from './buildCatalog.js';
import { getTemplateItems } from './templateItemsData.js';
import { resolveVerticalSlug } from './verticalResolver.js';
import { selectTemplateId } from './selectTemplateId.js';
import { CostSource } from '../billing/costPolicy.js';
import { withPaidAiBudget } from '../billing/withPaidAiBudget.js';
import { mapErrorToDraftFailure } from '../errors/mapErrorToDraftFailure.js';
import { mergeWebsiteIntoPreview } from './websiteSectionsGenerator.js';
import { DraftErrorCode, RecommendedAction } from '../errors/draftErrorCodes.js';
import { getTenantId } from '../../lib/tenant.js';
import { mergeMissionContext } from '../../lib/mission.js';
import { inferCurrencyFromLocationText } from './currencyInfer.js';

// Default expiry: 48 hours from now
const DEFAULT_EXPIRY_HOURS = 48;

const DEV = process.env.NODE_ENV !== 'production';

/** When true (default), use two-modes pipeline: resolveGenerationParams → buildCatalog → saveDraftBase → finalizeDraft. Set to 'false' to keep legacy path. */
const USE_QUICK_START_TWO_MODES = process.env.USE_QUICK_START_TWO_MODES !== 'false';

function buildStorePlannedStepsFromRegistry() {
  return [
    { tool: 'research', label: 'Analysing store input', priority: 'required' },
    { tool: 'catalog', label: 'Building product catalogue', priority: 'required' },
    { tool: 'web_scrape_store_images', label: 'Finding real store images', priority: 'required' },
    { tool: 'business_image_enrich', label: 'Enriching image keywords', priority: 'required' },
    { tool: 'media', label: 'Generating store visuals', priority: 'required' },
    { tool: 'copy', label: 'Writing product descriptions', priority: 'optional' },
  ];
}

function resolveMilestoneBusinessName(params, input) {
  const n = params?.businessName ?? input?.businessName ?? null;
  return n != null && String(n).trim() ? String(n).trim() : 'this business';
}

function resolveMilestoneBusinessType(params, input) {
  const t = params?.businessType ?? input?.businessType ?? input?.storeType ?? input?.vertical ?? null;
  return t != null && String(t).trim() ? String(t).trim() : null;
}

function resolveCatalogItemTarget(params) {
  const gp = params?.generationProfile;
  const probe =
    gp && typeof gp === 'object'
      ? gp.catalogSize ?? gp.itemTarget ?? gp.itemsTarget ?? gp.itemCountTarget
      : undefined;
  const n = typeof probe === 'number' && Number.isFinite(probe) ? probe : null;
  return n != null && n > 0 ? Math.floor(n) : null;
}

/**
 * Use Mission.context.preloadedCatalogItems, else draft.input.preloadedCatalogItems (set on POST /missions/:id/run),
 * else LLM/template catalog.
 */
async function buildCatalogForStoreReactStep(missionId, params, input) {
  const { buildCatalogFromPreloadedItems, sanitizePreloadedCatalogItems } = await import('./preloadedCatalogFromItems.js');
  let pre = null;
  if (missionId) {
    const mrow = await prisma.mission
      .findUnique({ where: { id: missionId }, select: { context: true } })
      .catch(() => null);
    const ctx = mrow?.context && typeof mrow.context === 'object' ? mrow.context : {};
    const fromMission = ctx.preloadedCatalogItems;
    if (Array.isArray(fromMission) && fromMission.length > 0) {
      pre = sanitizePreloadedCatalogItems(fromMission) ?? fromMission;
    }
  }
  if ((!Array.isArray(pre) || pre.length === 0) && Array.isArray(input?.preloadedCatalogItems) && input.preloadedCatalogItems.length > 0) {
    pre = sanitizePreloadedCatalogItems(input.preloadedCatalogItems) ?? input.preloadedCatalogItems;
  }
  if (Array.isArray(pre) && pre.length > 0) {
    const fromInputCur =
      (input?.currencyCode != null && String(input.currencyCode).trim() && String(input.currencyCode).trim().toUpperCase()) ||
      (input?.currency != null && String(input.currency).trim() && String(input.currency).trim().toUpperCase()) ||
      null;
    const fromParamsCur =
      (params?.currencyCode != null && String(params.currencyCode).trim() && String(params.currencyCode).trim().toUpperCase()) ||
      null;
    const inferredCur = inferCurrencyFromLocationText(params?.location ?? input?.location ?? '') || null;
    const currencyCode = fromInputCur || fromParamsCur || inferredCur || 'AUD';
    const catalog = buildCatalogFromPreloadedItems(pre, {
      businessName: params.businessName ?? input?.businessName ?? '',
      verticalSlug: params.verticalSlug ?? input?.vertical ?? null,
      currencyCode,
    });
    return { catalog, fromPreload: true };
  }
  const catalog = await buildCatalog(params);
  return { catalog, fromPreload: false };
}

/** Map generation profile → ImageFillProfile shape for BusinessImageEnricher. */
function classifierProfileFromParams(params) {
  const gen = params?.generationProfile ?? null;
  if (!gen || typeof gen !== 'object') return null;
  return {
    verticalSlug: gen.verticalSlug || '',
    verticalGroup: gen.verticalGroup,
    keywords: gen.keywords,
    forbiddenKeywords: gen.forbiddenKeywords,
    audience: gen.audience,
    categoryHints: gen.categoryHints,
  };
}

async function resolveStoreNameForImageEnrich(draftId, params, input) {
  const direct = params?.businessName ?? input?.businessName ?? null;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  if (!draftId) return null;
  const row = await prisma.draftStore.findUnique({ where: { id: draftId }, select: { preview: true } }).catch(() => null);
  const pv = row?.preview && typeof row.preview === 'object' ? row.preview : {};
  const sn = pv.storeName;
  return sn != null && String(sn).trim() ? String(sn).trim() : null;
}

async function appendReasoningLogLine(missionId, line, emitContextUpdate) {
  console.log('[appendReasoningLogLine] called', {
    missionId: missionId ?? 'MISSING',
    hasEmit: typeof emitContextUpdate === 'function',
    line,
  });
  if (line == null || !String(line).trim()) return;
  try {
    /** emitContextUpdate is already bound to the pipeline Mission id — do not require missionId here. */
    if (typeof emitContextUpdate === 'function') {
      await emitContextUpdate({
        reasoning_line: { line: String(line), timestamp: Date.now() },
      }).catch(() => {});
      emitHealthProbe('reasoning_line_written', {
        missionId,
        line: String(line),
        hasEmit: true,
      });
      return;
    }
    if (!missionId) return;
    let row = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } });
    if (!row) {
      const { ensureMissionRowForBlackboard } = await import('../../lib/missionBlackboard.js');
      await ensureMissionRowForBlackboard(prisma, missionId);
      row = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } });
    }
    if (!row) return;
    const ctx = row.context && typeof row.context === 'object' ? row.context : {};
    const prev = Array.isArray(ctx.reasoning_log) ? ctx.reasoning_log : [];
    await mergeMissionContext(missionId, { reasoning_log: [...prev, String(line)] }, { prisma });
    emitHealthProbe('reasoning_line_written', {
      missionId,
      line: String(line),
      hasEmit: false,
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Run content resolution for slogan, heroText, and tagline, then patch the draft's
 * storefront preview and emit Mission.context + telemetry.
 *
 * Never throws — all failures are swallowed to avoid blocking the pipeline.
 *
 * @param {string} draftId
 * @param {string|null} missionId
 * @param {{ profile: { tagline?: string, heroText?: string, name?: string, type?: string } }} catalog
 * @param {{ businessName?: string, businessType?: string, verticalSlug?: string }} params
 * @param {{ tenantId?: string }} input
 * @param {Function|undefined} emitContextUpdate
 */
async function runContentResolution(draftId, missionId, catalog, params, input, emitContextUpdate) {
  try {
    const profile = catalog?.profile ?? {};
    const businessName = params?.businessName ?? profile.name ?? '';
    const businessType = params?.businessType ?? profile.type ?? '';
    const verticalSlug = params?.verticalSlug ?? '';
    const tenantKey = input?.tenantId ?? 'content-resolver';
    const resolveOpts = { emitContextUpdate };

    const [sloganResult, heroTextResult, taglineResult] = await Promise.all([
      resolveContent(missionId, {
        type: 'slogan',
        businessName,
        businessType,
        verticalSlug,
        existingContent: profile.tagline,
        maxLength: 80,
        tenantKey,
      }, resolveOpts),
      resolveContent(missionId, {
        type: 'hero_text',
        businessName,
        businessType,
        verticalSlug,
        existingContent: profile.heroText,
        maxLength: 160,
        tenantKey,
      }, resolveOpts),
      resolveContent(missionId, {
        type: 'slogan',
        businessName,
        businessType,
        verticalSlug,
        existingContent: profile.tagline,
        maxLength: 80,
        tenantKey,
      }, resolveOpts),
    ]);

    // Merge copy fields into existing preview — never use Prisma JSON `{ update: ... }` (wipes items/categories).
    const row = await prisma.draftStore.findUnique({ where: { id: draftId }, select: { preview: true } }).catch(() => null);
    if (row) {
      const prev = parseDraftJsonField(row.preview);
      await prisma.draftStore.update({
        where: { id: draftId },
        data: {
          preview: {
            ...prev,
            slogan: sloganResult.content,
            heroText: heroTextResult.content,
            tagline: taglineResult.content,
          },
          updatedAt: new Date(),
        },
      }).catch(() => {});
    }

    // Emit content_resolution to Mission.context
    const contentResolution = {
      slogan: { source: sloganResult.source, length: sloganResult.content.length },
      heroText: { source: heroTextResult.source, length: heroTextResult.content.length },
      tagline: { source: taglineResult.source, length: taglineResult.content.length },
    };
    if (typeof emitContextUpdate === 'function') {
      await emitContextUpdate({ content_resolution: contentResolution }).catch(() => {});
    } else if (missionId) {
      await mergeMissionContext(missionId, { content_resolution: contentResolution }, { prisma }).catch(() => {});
    }

    // Telemetry probe
    emitHealthProbe('content_resolved', {
      missionId: missionId ?? undefined,
      fields: ['slogan', 'heroText', 'tagline'],
      sources: {
        slogan: sloganResult.source,
        heroText: heroTextResult.source,
        tagline: taglineResult.source,
      },
    });
  } catch {
    // Non-fatal — never block the pipeline
  }
}

/**
 * Create a DraftStore record with ownerUserId and input.tenantId set for the acting user.
 * Use for all orchestra/start and createBuildStoreJob draft creation so GET /api/draft-store/:id/summary returns 200 for the creator.
 * @param {import('../../lib/prismaClient.js').PrismaClient} prismaClient
 * @param {{ user?: { id: string, business?: { id: string } | null } | null, userId?: string | null, tenantKey?: string | null, input: object, [key: string]: any }} options - user or (userId + tenantKey), input, and rest as create data (expiresAt, mode, status, generationRunId, committedStoreId, ...)
 * @returns {Promise<import('../../lib/prismaClient.js').DraftStore>}
 */
/** Guest users are not in the User table; do not write guest id to ownerUserId (FK to User.id). */
function isGuestUserId(id) {
  return id != null && typeof id === 'string' && id.trim().toLowerCase().startsWith('guest_');
}

export async function createDraftStoreForUser(prismaClient, { user, userId, tenantKey, input, ...rest }) {
  let ownerUserId = user?.id ?? userId ?? null;
  // Never write guest id to ownerUserId — FK would fail (guest users are not in User table).
  if (isGuestUserId(ownerUserId)) ownerUserId = null;

  const resolvedTenantId =
    (input && typeof input === 'object' && input.tenantId != null)
      ? input.tenantId
      : (user ? getTenantId(user) : tenantKey) ?? null;
  const inputWithTenant =
    (input && typeof input === 'object')
      ? { ...input, tenantId: resolvedTenantId }
      : { tenantId: resolvedTenantId };

  if (process.env.NODE_ENV !== 'production') {
    console.log('[createDraftStoreForUser] input', {
      ownerUserIdCandidate: user?.id ?? userId ?? null,
      ownerUserIdForDb: ownerUserId,
      tenantIdCandidate: input?.tenantId ?? getTenantId(user) ?? tenantKey ?? null,
      mode: rest?.mode,
    });
  }

  const traceMissionId =
    (typeof rest?.missionId === 'string' && rest.missionId.trim()) ||
    (inputWithTenant && typeof inputWithTenant.missionId === 'string' ? inputWithTenant.missionId.trim() : '') ||
    null;

  const draft = await safeDraftStoreCreate(prismaClient, {
    data: {
      ...rest,
      ownerUserId,
      input: inputWithTenant,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    missionId: traceMissionId,
    operation: 'createDraftStoreForUser',
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[createDraftStoreForUser] created', {
      draftId: draft.id,
      ownerUserId: draft.ownerUserId,
      inputTenantId: draft.input?.tenantId,
      mode: draft.mode,
    });
  }

  if (DEV) {
    console.log('[DraftStore] createDraftStoreForUser', {
      createdDraftId: draft.id,
      ownerUserId: draft.ownerUserId ?? null,
      inputTenantId: (draft.input && typeof draft.input === 'object' ? draft.input.tenantId : undefined) ?? null,
    });
    const hadRealUser = (user?.id ?? userId) != null && !isGuestUserId(user?.id ?? userId);
    if (hadRealUser && (draft.ownerUserId == null || draft.ownerUserId === '')) {
      throw new Error('[DraftStore] createDraftStoreForUser: ownerUserId missing after create (dev assert)');
    }
    // Guest drafts may have template mode and null ownerUserId; do not assert.
    if ((draft.mode === 'template') && (draft.ownerUserId == null || draft.ownerUserId === '') && hadRealUser) {
      throw new Error('[DraftStore] createDraftStoreForUser: template mode must have ownerUserId (dev assert)');
    }
  }
  return draft;
}

/**
 * Create a new draft store
 */
export async function createDraft({ mode, input, meta = {} }) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);
  const inputObj = input || {};
  const generationRunId = inputObj.generationRunId || meta.generationRunId || null;

  const draft = await safeDraftStoreCreate(prisma, {
    data: {
      mode,
      status: 'generating',
      input: inputObj,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipHash: meta.ipHash || null,
      userAgent: meta.userAgent || null,
      guestSessionId: meta.guestSessionId || null,
      ownerUserId: meta.ownerUserId || null,
      ...(generationRunId ? { generationRunId } : {}),
    },
    missionId: typeof inputObj.missionId === 'string' ? inputObj.missionId.trim() : null,
    operation: 'createDraft',
  });

  console.log(`[DraftStore] Created draft ${draft.id} with mode: ${mode}`);
  return draft;
}

/**
 * Save catalog to draft preview (no hero/avatar/images). finalizeDraft handles those.
 * @param {string} draftId
 * @param {{ profile: object, categories: array, products: array, meta: { catalogSource: string, vertical?: string } }} catalog - CatalogBuildResult
 * @param {{ includeImages: boolean }} params - for preview.meta
 */
async function saveDraftBase(draftId, catalog, params) {
  const { profile, categories, products, meta } = catalog;
  const existingRow = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { preview: true },
  });
  let prevPreview = {};
  if (existingRow?.preview != null) {
    const p = existingRow.preview;
    prevPreview = typeof p === 'object' && !Array.isArray(p) ? p : {};
    if (typeof p === 'string') {
      try {
        const parsed = JSON.parse(p);
        prevPreview = typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
      } catch {
        prevPreview = {};
      }
    }
  }
  const prevStorefront =
    prevPreview.storefront && typeof prevPreview.storefront === 'object' ? { ...prevPreview.storefront } : {};
  const cta = hasMeaningfulCta(prevStorefront.cta)
    ? prevStorefront.cta
    : resolveGeneratedCTA({
        storeType: profile.type,
        businessType: params.businessType,
        items: products,
      });
  const preview = {
    storeName: profile.name,
    storeType: profile.type,
    slogan: profile.tagline,
    categories: Array.isArray(categories) ? categories : [],
    items: Array.isArray(products) ? products : [],
    images: [],
    brandColors: {
      primary: profile.primaryColor || '#1a1a2e',
      secondary: profile.secondaryColor || '#ffcc00',
    },
    tagline: profile.tagline,
    heroText: profile.heroText,
    stylePreferences: profile.stylePreferences,
    ...(prevPreview.hero && typeof prevPreview.hero === 'object' ? { hero: { ...prevPreview.hero } } : {}),
    ...(typeof prevPreview.heroImageUrl === 'string' && prevPreview.heroImageUrl.trim()
      ? { heroImageUrl: prevPreview.heroImageUrl.trim() }
      : {}),
    ...(prevPreview.avatar && typeof prevPreview.avatar === 'object' ? { avatar: { ...prevPreview.avatar } } : {}),
    ...(typeof prevPreview.avatarUrl === 'string' && prevPreview.avatarUrl.trim()
      ? { avatarUrl: prevPreview.avatarUrl.trim() }
      : {}),
    ...(prevPreview.contact && typeof prevPreview.contact === 'object' ? { contact: { ...prevPreview.contact } } : {}),
    meta: {
      ...(prevPreview.meta && typeof prevPreview.meta === 'object' ? prevPreview.meta : {}),
      ...(meta && typeof meta === 'object' ? meta : {}),
      catalogSource: meta.catalogSource || 'template',
      includeImages: params.includeImages !== false,
    },
    storefront: {
      ...prevStorefront,
      cta,
    },
  };
  if (isDraftGuardsEnabled()) {
    const effectiveVerticalType = effectiveVertical(profile.type, params.businessType);
    applyNameGuards(preview.items, effectiveVerticalType, preview.categories);
  }
  normalizePreviewCategories(preview);
  applyCommerceFieldsToPreview(preview);
  await prisma.draftStore.update({
    where: { id: draftId },
    data: { preview, updatedAt: new Date() },
  });
}

/**
 * Only place for images/hero/avatar/readiness. Fills missing product images, generates hero, sets avatar, then marks ready.
 */
async function finalizeDraft(draftId, {
  includeImages,
  generationProfile,
  reactEnrichedImageFillProfile,
  reactPreloadedImageUrls,
  reactImageEnrichmentStatus,
  reactPreloadedImageConfidence,
  pipelineMissionId = null,
}) {
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft || !draft.preview) throw new Error(`Draft ${draftId} not found or missing preview`);

  if (await isMissionPipelineCancelled(pipelineMissionId)) {
    await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'failed',
      fromStatus: 'generating',
      actorType: 'system',
      correlationId: (pipelineMissionId && String(pipelineMissionId).trim()) || draft.generationRunId || draftId,
      reason: 'MISSION_PIPELINE_CANCELLED',
      extraData: {
        error: 'Mission was cancelled',
        errorCode: 'MISSION_CANCELLED',
        recommendedAction: 'retry',
      },
    }).catch(() => {});
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DraftStore] finalizeDraft: aborted at start — mission pipeline cancelled', { draftId });
    }
    return false;
  }

  const preview = typeof draft.preview === 'object' ? { ...draft.preview } : {};
  const items = Array.isArray(preview.items) ? preview.items : [];
  const categories = Array.isArray(preview.categories) ? preview.categories : [];
  const profile = generationProfile ?? draft.input?.generationProfile ?? draft.input?.classificationProfile ?? null;
  const imageFillProfile = profile ? {
    verticalSlug: profile.verticalSlug || '',
    verticalGroup: profile.verticalGroup || (profile.verticalSlug || '').split('.')[0] || undefined,
    keywords: profile.keywords,
    forbiddenKeywords: profile.forbiddenKeywords,
    audience: profile.audience,
    categoryHints: profile.categoryHints,
  } : null;
  const guardsEnabled = isDraftGuardsEnabled();
  const effectiveVerticalType = guardsEnabled ? effectiveVertical(preview.storeType, preview.meta?.storeType) : null;

  const draftInput = draft.input && typeof draft.input === 'object' ? draft.input : {};
  const locationStr =
    draftInput.location != null && String(draftInput.location).trim()
      ? String(draftInput.location).trim()
      : null;
  let effectiveImageFillProfile = imageFillProfile;
  if (
    reactEnrichedImageFillProfile != null &&
    typeof reactEnrichedImageFillProfile === 'object' &&
    'verticalSlug' in reactEnrichedImageFillProfile
  ) {
    effectiveImageFillProfile = reactEnrichedImageFillProfile;
  } else {
    try {
      const { enrichImageFillProfileForBusiness } = await import('./businessImageEnricher.ts');
      const enriched = await enrichImageFillProfileForBusiness({
        profile: imageFillProfile,
        storeName: preview.storeName,
        businessType: preview.storeType,
        location: locationStr,
      });
      if (enriched.profile) effectiveImageFillProfile = enriched.profile;
    } catch (enrichErr) {
      console.warn('[DraftStore] BusinessImageEnricher skipped:', enrichErr?.message || enrichErr);
    }
  }

  let deriveItemCategoryHint = (itemName, verticalSlug, storeTypeHint) =>
    [itemName, verticalSlug, storeTypeHint].filter(Boolean).join(' ').trim();
  try {
    const mod = await import('../react/buildStoreReactTools.ts');
    deriveItemCategoryHint = mod.deriveItemCategoryHint;
  } catch (e) {
    console.warn('[DraftStore] deriveItemCategoryHint import failed:', e?.message || e);
  }
  const verticalForItem =
    effectiveImageFillProfile?.verticalSlug ?? imageFillProfile?.verticalSlug ?? preview.storeType ?? null;

  console.log('[DraftStore] finalizeDraft media', {
    draftId,
    includeImages: includeImages !== false,
    itemCount: items.length,
    hasPexelsKey: !!process.env.PEXELS_API_KEY,
    missionId: pipelineMissionId ?? null,
  });

  if (includeImages && items.length > 0) {
    console.log('[menuVisualAgent] START batch', {
      draftId,
      itemCount: items.length,
      enrichCount: Math.min(30, items.length),
      hasPexelsKey: !!process.env.PEXELS_API_KEY,
      missionId: pipelineMissionId ?? null,
    });
    const menuMod = await loadMenuVisualAgent();
    if (!menuMod) throw tsModuleUnavailable('menuVisualAgent');
    const generateImageForDraftItem = menuMod.generateImageForDraftItem ?? menuMod.default?.generateImageForDraftItem;
    if (typeof generateImageForDraftItem !== 'function') throw tsModuleUnavailable('menuVisualAgent');
    const businessType = (preview.storeType || '')
      .toString().toLowerCase().trim().replace(/\s+/g, '_');
    const businessTypeToStyle = {
      cafe: 'warm', 'coffee-shop': 'warm', coffee_shop: 'warm', restaurant: 'warm', bakery: 'warm',
      bar: 'warm', florist: 'vibrant', salon: 'modern', spa: 'modern', design: 'minimal', studio: 'minimal',
    };
    const styleName = businessTypeToStyle[businessType] || 'modern';
    const MAX_ITEMS = 30;
    const BATCH_SIZE = 5;
    const toEnrich = items.slice(0, MAX_ITEMS);
    const usedUrls = new Set();
    let billingLimitHit = false;
    itemImages: for (let offset = 0; offset < toEnrich.length && !billingLimitHit; offset += BATCH_SIZE) {
      if (isShutdownRequested()) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DraftStore] finalizeDraft: stopping item images (server shutdown)', { draftId });
        }
        break itemImages;
      }
      if (await isMissionPipelineCancelled(pipelineMissionId)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DraftStore] finalizeDraft: stopping item images (mission pipeline cancelled)', { draftId });
        }
        break itemImages;
      }
      const batch = toEnrich.slice(offset, offset + BATCH_SIZE);
      const settled = [];
      for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
        if (isShutdownRequested()) {
          break itemImages;
        }
        if (await isMissionPipelineCancelled(pipelineMissionId)) {
          break itemImages;
        }
        const p = batch[batchIdx];
        const existingImageUrl = resolveUsableDraftItemImageUrl(p);
        if (existingImageUrl) {
          settled.push({
            status: 'fulfilled',
            value: { url: existingImageUrl, source: p.imageSource || 'imported' },
          });
          continue;
        }
        if (guardsEnabled && effectiveVerticalType === 'food' && isBlockedCandidateForFood(p.name, p.description)) {
          settled.push({ status: 'fulfilled', value: null });
          continue;
        }
        const catalogCategoryHint = p.categoryId && categories.length ? categories.find((c) => c.id === p.categoryId)?.name : null;
        const derivedHint = deriveItemCategoryHint(p?.name, verticalForItem, preview.storeType);
        const categoryHint = [derivedHint, catalogCategoryHint].filter(Boolean).join(' ').trim() || null;
        const itemIndex = offset + batchIdx;
        const opts = effectiveImageFillProfile
          ? {
              profile: effectiveImageFillProfile,
              categoryHint,
              categoryName: categoryHint,
              businessType: preview.storeType || null,
              usedUrls,
              ...(locationStr ? { location: locationStr } : {}),
            }
          : {
              categoryName: categoryHint,
              businessType: preview.storeType || null,
              usedUrls,
              ...(locationStr ? { location: locationStr } : {}),
            };
        if (
          Array.isArray(reactPreloadedImageUrls) &&
          reactPreloadedImageUrls.length > 0 &&
          reactImageEnrichmentStatus === 'web_scrape'
        ) {
          opts.preloadedImageUrls = reactPreloadedImageUrls;
          opts.itemIndex = itemIndex;
          opts.imageEnrichmentStatus = reactImageEnrichmentStatus;
          if (typeof reactPreloadedImageConfidence === 'number' && Number.isFinite(reactPreloadedImageConfidence)) {
            opts.preloadedImageConfidence = reactPreloadedImageConfidence;
          }
        }
        try {
          const result = await generateImageForDraftItem(p.name, p.description, styleName, opts);
          settled.push({ status: 'fulfilled', value: result });
          if (result?.url) usedUrls.add(result.url);
        } catch (err) {
          if (err?.code === 'BILLING_HARD_LIMIT') {
            billingLimitHit = true;
            settled.push({ status: 'rejected', reason: err });
            break;
          }
          settled.push({ status: 'rejected', reason: err });
        }
      }
      batch.forEach((item, i) => {
        const result = settled[i];
        if (result?.status === 'fulfilled' && result.value && result.value.url && !item.imageUrl) {
          const img = result.value;
          item.imageUrl = img.url;
          item.imageSource = img.source;
          item.imageQuery = img.query;
          item.imageConfidence = img.confidence;
        }
        if (result?.status === 'rejected' && result.reason?.code === 'BILLING_HARD_LIMIT') {
          billingLimitHit = true;
        }
      });
      if (billingLimitHit) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DraftStore] finalizeDraft: billing hard limit — stopping image attempts early', { draftId });
        }
        break;
      }
    }
    if (guardsEnabled && effectiveVerticalType) {
      applyItemGuards(items, effectiveVerticalType);
    }
    const withImages = items.filter((p) => p.imageUrl).length;
    console.log(`[DraftStore] finalizeDraft: ${withImages}/${toEnrich.length} item images for draft ${draftId}`);
  } else if (!includeImages) {
    console.log('[DraftStore] finalizeDraft: images skipped (includeImages=false)', { draftId, itemCount: items.length });
  } else if (items.length === 0) {
    console.log('[DraftStore] finalizeDraft: images skipped (no catalog items)', { draftId });
  }

  let heroImageUrl = null;
  let avatarImageUrl = null;
  const canonicalHero = readCanonicalHeroFromPreview(preview);
  const importedHero =
    preview?.meta?.heroImageSource === 'imported' &&
    canonicalHero.heroImage &&
    !getExistingVideoUrlFromPreview(preview);
  const importedAvatarUrl =
    preview?.meta?.avatarImageSource === 'imported'
      ? preview.avatarUrl || preview.avatar?.imageUrl || null
      : null;

  if (importedHero) {
    heroImageUrl = canonicalHero.heroImage;
    console.log('[finalizeDraft] skipping hero gen — imported hero present:', heroImageUrl);
  } else if (includeImages) {
    if (await isMissionPipelineCancelled(pipelineMissionId)) {
      await transitionDraftStoreStatus({
        prisma,
        draftId,
        toStatus: 'failed',
        fromStatus: 'generating',
        actorType: 'system',
        correlationId: (pipelineMissionId && String(pipelineMissionId).trim()) || draft.generationRunId || draftId,
        reason: 'MISSION_PIPELINE_CANCELLED',
        extraData: {
          error: 'Mission was cancelled',
          errorCode: 'MISSION_CANCELLED',
          recommendedAction: 'retry',
        },
      }).catch(() => {});
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DraftStore] finalizeDraft: aborted before hero — mission pipeline cancelled', { draftId });
      }
      return false;
    }
    try {
      const heroMod = await loadHeroGenerationService();
      if (!heroMod) throw tsModuleUnavailable('heroGenerationService');
      const generateHeroForDraft = heroMod.generateHeroForDraft ?? heroMod.default?.generateHeroForDraft;
      if (typeof generateHeroForDraft !== 'function') throw tsModuleUnavailable('heroGenerationService');
      const { hero } = await generateHeroForDraft({
        storeName: preview.storeName,
        businessType: preview.storeType,
        storeType: preview.storeType,
        verticalSlug: profile?.verticalSlug ?? preview.meta?.verticalSlug ?? null,
        verticalGroup: profile?.verticalGroup ?? (profile?.verticalSlug || '').split('.')[0] ?? null,
      });
      heroImageUrl = hero?.imageUrl ?? null;
    } catch (heroErr) {
      if (heroErr?.code === 'TS_MODULE_UNAVAILABLE') throw heroErr;
      console.warn(`[DraftStore] Hero generation failed for draft ${draftId}:`, heroErr?.message || heroErr);
    }
    if (!heroImageUrl) {
      try {
        const { getSeedImageForCategory } = await import('../../lib/seedLibrary/getSeedImageForCategory.js');
        const vertical = effectiveVertical(preview.storeType, preview.meta?.storeType) || null;
        const fallback = await getSeedImageForCategory({
          vertical,
          categoryKey: preview.storeType || null,
          businessName: preview.storeName || null,
          orientation: 'landscape',
        });
        if (fallback) {
          heroImageUrl = fallback;
          if (process.env.cardbey_debugImageSource === '1' || process.env.CARDBEY_DEBUG_IMAGE_SOURCE === '1') {
            console.log('[DraftStore] hero fallback from Seed Library', { draftId, vertical, categoryKey: preview.storeType });
          }
        }
      } catch (e) {
        // non-blocking: leave hero null
      }
    }
    if (!importedAvatarUrl) {
      const firstWithImage = items.find((p) => p?.imageUrl);
      avatarImageUrl = firstWithImage?.imageUrl ?? null;
    }
  }
  if (importedAvatarUrl) {
    avatarImageUrl = importedAvatarUrl;
  }
  if (heroImageUrl) {
    applyPipelineGeneratedHeroImage(preview, heroImageUrl, { writer: 'finalizeDraft', draftId });
  }
  preview.avatar = { imageUrl: avatarImageUrl };
  preview.avatarUrl = avatarImageUrl ?? null;
  mergeWebsiteIntoPreview(preview, draft.input || {});

  normalizePreviewCategories(preview);
  applyCommerceFieldsToPreview(preview);
  const schemaMod = await loadDraftPreviewSchema();
  if (schemaMod) {
    const parseDraftPreview = schemaMod.parseDraftPreview ?? schemaMod.default?.parseDraftPreview;
    if (typeof parseDraftPreview === 'function' && !parseDraftPreview(preview)) {
      console.warn('[DraftStore] preview validation failed (soft)', { draftId });
    }
  }

  if (await isMissionPipelineCancelled(pipelineMissionId)) {
    await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'failed',
      fromStatus: 'generating',
      actorType: 'system',
      correlationId: (pipelineMissionId && String(pipelineMissionId).trim()) || draft.generationRunId || draftId,
      reason: 'MISSION_PIPELINE_CANCELLED',
      extraData: {
        error: 'Mission was cancelled',
        errorCode: 'MISSION_CANCELLED',
        recommendedAction: 'retry',
      },
    }).catch(() => {});
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DraftStore] finalizeDraft: aborted before ready — mission pipeline cancelled', { draftId });
    }
    return false;
  }

  // Phase 0: QA report before marking ready
  const { runDraftQa } = await import('../qa/draftQaAgent.js');
  const qaReport = runDraftQa({ preview, input: draft.input }, { logger: console.log.bind(console) });
  preview.meta = { ...(preview.meta || {}), qaReport };

  await transitionDraftStoreStatus({
    prisma,
    draftId,
    toStatus: 'ready',
    fromStatus: 'generating',
    actorType: 'automation',
    correlationId: null,
    reason: 'GENERATE_DRAFT_SUCCESS',
    extraData: { preview, error: null },
  });
  return true;
}

/**
 * Two-modes pipeline: resolveGenerationParams → buildCatalog → saveDraftBase → finalizeDraft.
 * Template mode uses zero LLM (getTemplateProfile + template items only).
 * Paid AI (mode === 'ai') uses withPaidAiBudget; draft preview / full-store generation skips credit charges (billing applies on publish and other paid actions).
 */
/** Best-effort: persist vertical-lock menu warnings on Mission for owner UX (non-blocking). */
async function mergeCatalogVerticalWarningsToMission(missionId, errors, verticalLabel) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) return;
  if (!Array.isArray(errors) || errors.length === 0) return;
  await mergeMissionContext(
    missionId.trim(),
    {
      catalog_vertical_warnings: {
        message: 'Some products may not match your category',
        details: errors.slice(0, 30),
        vertical: verticalLabel != null ? String(verticalLabel) : null,
        recordedAt: new Date().toISOString(),
      },
    },
    { prisma }
  ).catch(() => {});
}

/**
 * Persist image enrichment signals to Mission.context for draft-review UI — non-blocking (no owner wait).
 */
async function mergeImageEnrichmentSignalsToMission(missionId, bb) {
  if (!missionId || !bb || typeof bb.snapshot !== 'function') return;
  const snap = bb.snapshot();
  const kw = snap.uploadSuggestionKeywords;
  const rawScore = snap.imageConfidenceScore;
  const imageConfidenceScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? rawScore
      : rawScore != null && Number.isFinite(Number(rawScore))
        ? Number(rawScore)
        : null;
  const imageEnrichmentStatus =
    typeof snap.imageEnrichmentStatus === 'string' && snap.imageEnrichmentStatus.trim()
      ? String(snap.imageEnrichmentStatus).trim()
      : null;
  await mergeMissionContext(
    missionId,
    {
      imageConfidenceScore,
      imageEnrichmentStatus,
      uploadSuggestionNeeded: snap.uploadSuggestionNeeded === true,
      uploadSuggestionKeywords: Array.isArray(kw) ? kw.filter((x) => typeof x === 'string') : [],
    },
    { prisma },
  ).catch(() => {});
}

/**
 * Post-draft LLM validation. When ReAct (`USE_REACT_REFLECTION`) runs with `USE_OUTPUT_VALIDATION`,
 * {@link validateMissionOutput} already ran inside reactExecutor on the full blackboard — skipping here
 * avoids a second LLM call and duplicate "Issues found" / "Auto-fixed" blackboard lines.
 *
 * @param {{ skipBecauseReactValidated?: boolean }} [opts]
 */
async function maybeValidateDraftOutput(draftId, missionId, params, input, emitContextUpdate, opts = {}) {
  if (!missionId) return;
  if (opts.skipBecauseReactValidated === true) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[maybeValidateDraftOutput] skip duplicate validation (already ran in ReAct / reactExecutor)',
      );
    }
    return;
  }
  const disabledResult = {
    valid: true,
    issues: [],
    reasoning: 'Validation disabled (set USE_OUTPUT_VALIDATION=true to run LLM checks).',
    autoFixed: [],
  };
  try {
    const { validateMissionOutput } = await import('../react/outputValidator.ts');
    const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
    const { MissionReactBlackboard } = await import('../react/missionReactBlackboard.ts');
    const row = await prisma.draftStore.findUnique({ where: { id: draftId }, select: { preview: true } });
    const preview = row?.preview && typeof row.preview === 'object' ? row.preview : {};
    const items = Array.isArray(preview.items) ? preview.items : [];
    const bb = new MissionReactBlackboard(
      {
        generatedProducts: items,
        generatedProfile: {
          tagline: preview.tagline ?? preview.slogan ?? '',
          description: preview.storeName ?? '',
        },
        businessVertical: params.verticalSlug ?? input?.vertical ?? null,
        subcategory: input?.subcategory ?? null,
      },
      typeof emitContextUpdate === 'function' ? { emitContextUpdate } : undefined
    );
    const businessContext = {
      name: params.businessName ?? input?.businessName ?? null,
      vertical: params.verticalSlug ?? input?.vertical ?? null,
      subcategory: input?.subcategory ?? null,
      knownProducts: input?.knownProducts ?? [],
    };
    let result = disabledResult;
    if (process.env.USE_OUTPUT_VALIDATION === 'true') {
      result = await validateMissionOutput(businessContext, bb.snapshot(), llmGateway, {
        blackboardWriter: bb,
        reasoningLog: [],
      });
    } else {
      bb.write('react_validation', disabledResult);
      bb.appendReasoningLog('✓ Output validation skipped (USE_OUTPUT_VALIDATION off)');
    }
    await bb.flushReasoningEmits?.().catch(() => {});
    await mergeMissionContext(missionId, { react_validation: result }, { prisma }).catch(() => {});
    if (typeof emitContextUpdate !== 'function') {
      const lines = bb.snapshot().reasoning_log;
      if (Array.isArray(lines)) {
        for (const line of lines) {
          await appendReasoningLogLine(missionId, String(line));
        }
      }
    }
  } catch (e) {
    console.warn('[generateDraftTwoModes] output validation skipped:', e?.message || e);
  }
}

/** Throws with code MISSION_PIPELINE_CANCELLED when finalizeDraft aborted due to pipeline cancel. */
async function runFinalizeDraftChecked(draftId, finalizeOpts, stepReporter) {
  const ok = await finalizeDraft(draftId, finalizeOpts);
  if (ok === false) {
    await stepReporter.failed('media', 'cancelled').catch(() => {});
    const err = new Error('Mission cancelled');
    err.code = 'MISSION_PIPELINE_CANCELLED';
    throw err;
  }
}

async function generateDraftTwoModes(draftId, draft, input, options = {}) {
  const stepReporter = options.stepReporter ?? {
    started: () => Promise.resolve(),
    completed: () => Promise.resolve(),
    failed: () => Promise.resolve(),
  };

  const params = resolveGenerationParams(input, { draftMode: draft.mode });
  params.draftId = draftId;
  const userId = options.userId ?? draft.ownerUserId ?? null;
  const useReact = process.env.USE_REACT_REFLECTION === 'true';
  const missionId = options.reactMissionId ?? null;

  console.log('[generateDraftTwoModes] entry', {
    missionId: missionId ?? 'MISSING',
    hasEmitCtx: typeof options.emitContextUpdate === 'function',
  });

  if (process.env.NODE_ENV === 'development' || process.env.LOG_RESOLVE_PARAMS === '1') {
    console.log('[DraftStore] resolveGenerationParams', { draftId, mode: params.mode, includeImages: params.includeImages, templateId: params.templateId, businessName: params.businessName ?? '(none)', businessType: params.businessType ?? '(none)', verticalSlug: params.verticalSlug ?? '(none)' });
  }

  if (params.mode === 'ai') {
    if (!userId) {
      const err = new Error('Authentication required to use paid AI');
      err.code = 'AUTH_REQUIRED_FOR_AI';
      err.status = 401;
      throw err;
    }
    const estimatedImages = params.includeImages ? 32 : 0;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, welcomeFullStoreRemaining: true, aiCreditsBalance: true },
    });
    return withPaidAiBudget(
      {
        user,
        userId,
        costSource: CostSource.paid_ai,
        actionName: 'draft.generate.ai.full',
        estimate: { textUnits: 1, images: estimatedImages },
        refId: draftId,
        allowWelcomeBundle: true,
        skipCreditsForDraftPreview: true,
        isDraft: true,
        source: 'performer_draft',
        storeType: input?.storeType ?? input?.businessType ?? null,
      },
      async () => {
        if (!useReact) {
          const emitCtx = options.emitContextUpdate;
          await appendReasoningLogLine(missionId, '🧠 Cardbey is thinking…', emitCtx);
          await stepReporter.started('research').catch(() => {});
          await stepReporter.completed('research').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Store input reviewed', emitCtx);

          await stepReporter.started('catalog').catch(() => {});
          {
            const itemTarget = resolveCatalogItemTarget(params);
            await appendReasoningLogLine(
              missionId,
              `📦 Building catalog: ${itemTarget != null ? `${itemTarget}` : '?'} items`,
              emitCtx,
            );
          }
          const { catalog: catalogPaidNoReact } = await buildCatalogForStoreReactStep(missionId, params, input);
          await saveDraftBase(draftId, catalogPaidNoReact, params);
          const emitContextUpdate = options.emitContextUpdate;
          if (typeof emitContextUpdate === 'function' && catalogPaidNoReact?.products?.length) {
            const products = catalogPaidNoReact.products.map((p) => ({
              id: p.id,
              productId: p.productId,
              name: p?.name ?? p?.title ?? null,
            }));
            await emitContextUpdate({ entities: { products } }).catch(() => {});
          }
          await stepReporter.completed('catalog').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Profile generated', emitCtx);
          await appendReasoningLogLine(missionId, '✓ Product catalogue ready', emitCtx);

          await stepReporter.started('media').catch(() => {});
          await runFinalizeDraftChecked(
            draftId,
            {
              includeImages: params.includeImages,
              generationProfile: params.generationProfile,
              pipelineMissionId: missionId,
            },
            stepReporter,
          );
          await stepReporter.completed('media').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Store visuals generated', emitCtx);

          await stepReporter.started('copy').catch(() => {});
          await runContentResolution(draftId, missionId, catalogPaidNoReact, params, input, emitCtx);
          await stepReporter.completed('copy', { checkpoint: true }).catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Store copy refined', emitCtx);
        } else {
          const { MissionReactBlackboard } = await import('../react/missionReactBlackboard.ts');
          const { executeWithReAct } = await import('../react/reactExecutor.ts');
          const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
          const emitCtx = options.emitContextUpdate;
          const bb = new MissionReactBlackboard(
            {},
            typeof emitCtx === 'function' ? { emitContextUpdate: emitCtx } : undefined
          );
          const catalogState = { catalog: null };
          const businessContext = {
            name: params.businessName ?? input?.businessName ?? null,
            vertical: params.verticalSlug ?? input?.vertical ?? null,
            subcategory: input?.subcategory ?? null,
          };
          const reporter = {
            emit: (msg) => appendReasoningLogLine(missionId, msg, emitCtx),
          };
          let missionPlan = null;
          if (missionId) {
            const mrow = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }).catch(() => null);
            const ctx = mrow?.context && typeof mrow.context === 'object' ? mrow.context : {};
            missionPlan = ctx.react_plan ?? null;
          }
          await appendReasoningLogLine(missionId, '🧠 Cardbey is thinking…', emitCtx);
          await executeWithReAct(
            missionPlan,
            buildStorePlannedStepsFromRegistry(),
            bb,
            businessContext,
            async (tool, hint) => {
              if (hint && process.env.NODE_ENV === 'development') {
                console.log('[ReAct] hint', tool, hint);
              }
              const emitContextUpdate = options.emitContextUpdate;
              if (tool === 'research') {
                const bizName = resolveMilestoneBusinessName(params, input);
                const bizType = resolveMilestoneBusinessType(params, input);
                const bizSuffix = bizType ? ` (${bizType})` : '';
                await appendReasoningLogLine(missionId, `🔍 Analyzing business: ${bizName}${bizSuffix}`, emitCtx);
                await stepReporter.started('research').catch(() => {});
                await stepReporter.completed('research').catch(() => {});
                bb.write('react_step_research', true);
                await appendReasoningLogLine(missionId, '✓ Store input reviewed', emitCtx);
                return;
              }
              if (tool === 'catalog') {
                const itemTarget = resolveCatalogItemTarget(params);
                await appendReasoningLogLine(
                  missionId,
                  `📦 Building catalog: ${itemTarget != null ? `${itemTarget}` : '?'} items`,
                  emitCtx
                );
                await stepReporter.started('catalog').catch(() => {});
                const { catalog: builtCatalog, fromPreload } = await buildCatalogForStoreReactStep(
                  missionId,
                  params,
                  input,
                );
                catalogState.catalog = builtCatalog;
                await saveDraftBase(draftId, catalogState.catalog, params);
                if (typeof emitContextUpdate === 'function' && catalogState.catalog?.products?.length) {
                  const products = catalogState.catalog.products.map((p) => ({
                    id: p.id,
                    productId: p.productId,
                    name: p?.name ?? p?.title ?? null,
                  }));
                  await emitContextUpdate({ entities: { products } }).catch(() => {});
                }
                bb.write('generatedProducts', catalogState.catalog?.products ?? []);
                if (fromPreload) {
                  bb.write('catalogSource', 'user_upload');
                  bb.write('catalogItems', catalogState.catalog?.products ?? []);
                }
                await stepReporter.completed('catalog').catch(() => {});
                await appendReasoningLogLine(missionId, '✓ Profile generated', emitCtx);
                await appendReasoningLogLine(missionId, '✓ Product catalogue ready', emitCtx);
                return;
              }
              if (tool === 'web_scrape_store_images') {
                await appendReasoningLogLine(missionId, '🌐 Scraping web images...', emitCtx);
                await stepReporter.started('web_scrape_store_images').catch(() => {});
                const { executeWebScrapeForReact } = await import('../react/buildStoreReactTools.ts');
                const dr = await prisma.draftStore
                  .findUnique({ where: { id: draftId }, select: { preview: true, input: true } })
                  .catch(() => null);
                const previewScrape = dr?.preview && typeof dr.preview === 'object' ? dr.preview : {};
                const dinScrape = dr?.input && typeof dr.input === 'object' ? dr.input : {};
                const locScrape = params.location ?? input?.location ?? null;
                let suburbScrape = null;
                if (previewScrape.location != null && String(previewScrape.location).trim()) {
                  suburbScrape = String(previewScrape.location).split(',')[0]?.trim() || null;
                } else if (typeof locScrape === 'string' && locScrape.trim()) {
                  suburbScrape = locScrape.split(',')[0]?.trim() || null;
                }
                const scrapePayload = {
                  businessName:
                    previewScrape.storeName ?? params.businessName ?? input?.businessName ?? '',
                  businessType:
                    previewScrape.storeType ??
                    previewScrape.businessType ??
                    params.businessType ??
                    params.verticalSlug ??
                    input?.businessType ??
                    '',
                  suburb: suburbScrape,
                  websiteUrl: previewScrape.websiteUrl ?? dinScrape.websiteUrl ?? input?.websiteUrl ?? null,
                  facebookHandle: previewScrape.facebookHandle ?? dinScrape.facebookHandle ?? null,
                };
                await executeWebScrapeForReact(bb, scrapePayload);
                bb.write('react_step_web_scrape_store_images', true);
                await stepReporter.completed('web_scrape_store_images').catch(() => {});
                await appendReasoningLogLine(missionId, '✓ Web image scrape complete', emitCtx);
                return;
              }
              if (tool === 'business_image_enrich') {
                await appendReasoningLogLine(missionId, '✨ Enriching product images...', emitCtx);
                await stepReporter.started('business_image_enrich').catch(() => {});
                const { executeBusinessImageEnrichForReact } = await import('../react/buildStoreReactTools.ts');
                const classifierProfile = classifierProfileFromParams(params);
                const storeName = await resolveStoreNameForImageEnrich(draftId, params, input);
                await executeBusinessImageEnrichForReact(bb, {
                  profile: classifierProfile,
                  storeName,
                  businessType: params.businessType ?? params.verticalSlug ?? input?.businessType ?? null,
                  location: params.location ?? input?.location ?? null,
                });
                bb.write('react_step_business_image_enrich', true);
                await mergeImageEnrichmentSignalsToMission(missionId, bb);
                await stepReporter.completed('business_image_enrich').catch(() => {});
                await appendReasoningLogLine(missionId, '✓ Image keywords ready for visuals', emitCtx);
                return;
              }
              if (tool === 'media') {
                await stepReporter.started('media').catch(() => {});
                const snapMedia = bb.snapshot();
                const enrichedFromBb = snapMedia.enrichedImageFillProfile;
                const enrichedImages = Array.isArray(snapMedia.enrichedImages) ? snapMedia.enrichedImages : null;
                const imageSource =
                  typeof snapMedia.imageEnrichmentStatus === 'string' ? snapMedia.imageEnrichmentStatus : undefined;
                const preloadedUrls =
                  enrichedImages && enrichedImages.length > 0 && imageSource === 'web_scrape'
                    ? enrichedImages.map((i) => (i && typeof i.url === 'string' ? i.url.trim() : '')).filter(Boolean)
                    : undefined;
                const reactPreloadedImageConfidence =
                  typeof snapMedia.imageConfidenceScore === 'number' && Number.isFinite(snapMedia.imageConfidenceScore)
                    ? snapMedia.imageConfidenceScore
                    : undefined;
                await runFinalizeDraftChecked(
                  draftId,
                  {
                    includeImages: params.includeImages,
                    generationProfile: params.generationProfile,
                    pipelineMissionId: missionId,
                    reactEnrichedImageFillProfile:
                      enrichedFromBb != null &&
                      typeof enrichedFromBb === 'object' &&
                      'verticalSlug' in enrichedFromBb
                        ? enrichedFromBb
                        : undefined,
                    reactPreloadedImageUrls: preloadedUrls,
                    reactImageEnrichmentStatus: imageSource,
                    reactPreloadedImageConfidence,
                  },
                  stepReporter,
                );
                bb.write('react_step_media', true);
                await stepReporter.completed('media').catch(() => {});
                await appendReasoningLogLine(missionId, '✓ Store visuals generated', emitCtx);
                return;
              }
              if (tool === 'copy') {
                await stepReporter.started('copy').catch(() => {});
                bb.write('react_step_copy', true);
                await stepReporter.completed('copy', { checkpoint: true }).catch(() => {});
                await appendReasoningLogLine(missionId, '✓ Store copy refined', emitCtx);
                return;
              }
              console.warn('[ReAct] unknown tool step (no-op):', tool);
            },
            llmGateway,
            reporter
          );
          await bb.flushReasoningEmits?.().catch(() => {});
          if (missionId) {
            await mergeMissionContext(missionId, bb.snapshot(), { prisma }).catch(() => {});
          }
        }

        const updated = await prisma.draftStore.findUnique({ where: { id: draftId } });
        const preview = parseDraftJsonField(updated?.preview);
        await maybeValidateDraftOutput(draftId, missionId, params, input, options.emitContextUpdate, {
          skipBecauseReactValidated: useReact && process.env.USE_OUTPUT_VALIDATION === 'true',
        });
        console.log('[generateDraft] done (two-modes, paid_ai)', {
          draftId,
          status: 'ready',
          items: draftPreviewItemCount(updated?.preview),
          catalogSource: preview?.meta?.catalogSource,
        });
        return { draft: updated, preview };
      }
    );
  }

  if (!useReact) {
    const emitCtx = options.emitContextUpdate;
    await appendReasoningLogLine(missionId, '🧠 Cardbey is thinking…', emitCtx);
    {
      const bizName = resolveMilestoneBusinessName(params, input);
      const bizType = resolveMilestoneBusinessType(params, input);
      const bizSuffix = bizType ? ` (${bizType})` : '';
      await appendReasoningLogLine(missionId, `🔍 Analyzing business: ${bizName}${bizSuffix}`, emitCtx);
    }
    await stepReporter.started('research').catch(() => {});
    await stepReporter.completed('research').catch(() => {});
    await appendReasoningLogLine(missionId, '✓ Store input reviewed', emitCtx);

    await stepReporter.started('catalog').catch(() => {});
    {
      const itemTarget = resolveCatalogItemTarget(params);
      await appendReasoningLogLine(
        missionId,
        `📦 Building catalog: ${itemTarget != null ? `${itemTarget}` : '?'} items`,
        emitCtx
      );
    }
    const { catalog } = await buildCatalogForStoreReactStep(missionId, params, input);
    await saveDraftBase(draftId, catalog, params);
    const emitContextUpdate = options.emitContextUpdate;
    if (typeof emitContextUpdate === 'function' && catalog?.products?.length) {
      const products = catalog.products.map((p) => ({
        id: p.id,
        productId: p.productId,
        name: p?.name ?? p?.title ?? null,
      }));
      await emitContextUpdate({ entities: { products } }).catch(() => {});
    }
    await stepReporter.completed('catalog').catch(() => {});
    await appendReasoningLogLine(missionId, '✓ Profile generated', emitCtx);
    await appendReasoningLogLine(missionId, '✓ Product catalogue ready', emitCtx);

    await stepReporter.started('media').catch(() => {});
    await runFinalizeDraftChecked(
      draftId,
      {
        includeImages: params.includeImages,
        generationProfile: params.generationProfile,
        pipelineMissionId: missionId,
      },
      stepReporter,
    );
    await stepReporter.completed('media').catch(() => {});
    await appendReasoningLogLine(missionId, '✓ Store visuals generated', emitCtx);

    await stepReporter.started('copy').catch(() => {});
    await runContentResolution(draftId, missionId, catalog, params, input, emitCtx);
    await stepReporter.completed('copy', { checkpoint: true }).catch(() => {});
    await appendReasoningLogLine(missionId, '✓ Store copy refined', emitCtx);
    {
      const itemTarget = resolveCatalogItemTarget(params);
      const finalCount = Array.isArray(catalog?.products) ? catalog.products.length : null;
      await appendReasoningLogLine(
        missionId,
        `✅ Draft ready: ${finalCount != null ? finalCount : '?'}${itemTarget != null ? `/${itemTarget}` : ''} items`,
        emitCtx
      );
    }
  } else {
    const { MissionReactBlackboard } = await import('../react/missionReactBlackboard.ts');
    const { executeWithReAct } = await import('../react/reactExecutor.ts');
    const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
    const emitCtx = options.emitContextUpdate;
    const bb = new MissionReactBlackboard(
      {},
      typeof emitCtx === 'function' ? { emitContextUpdate: emitCtx } : undefined
    );
    const catalogState = { catalog: null };
    const businessContext = {
      name: params.businessName ?? input?.businessName ?? null,
      vertical: params.verticalSlug ?? input?.vertical ?? null,
      subcategory: input?.subcategory ?? null,
    };
    const reporter = {
      emit: (msg) => appendReasoningLogLine(missionId, msg, emitCtx),
    };
    let missionPlan = null;
    if (missionId) {
      const mrow = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }).catch(() => null);
      const ctx = mrow?.context && typeof mrow.context === 'object' ? mrow.context : {};
      missionPlan = ctx.react_plan ?? null;
    }
    await appendReasoningLogLine(missionId, '🧠 Cardbey is thinking…', emitCtx);
    await executeWithReAct(
      missionPlan,
      buildStorePlannedStepsFromRegistry(),
      bb,
      businessContext,
      async (tool, hint) => {
        if (hint && process.env.NODE_ENV === 'development') {
          console.log('[ReAct] hint', tool, hint);
        }
        const emitContextUpdate = options.emitContextUpdate;
        if (tool === 'research') {
          await stepReporter.started('research').catch(() => {});
          await stepReporter.completed('research').catch(() => {});
          bb.write('react_step_research', true);
          await appendReasoningLogLine(missionId, '✓ Store input reviewed', emitCtx);
          return;
        }
        if (tool === 'catalog') {
          await stepReporter.started('catalog').catch(() => {});
          const { catalog: builtCatalogOuter, fromPreload: fromPreloadOuter } = await buildCatalogForStoreReactStep(
            missionId,
            params,
            input,
          );
          catalogState.catalog = builtCatalogOuter;
          await saveDraftBase(draftId, catalogState.catalog, params);
          if (typeof emitContextUpdate === 'function' && catalogState.catalog?.products?.length) {
            const products = catalogState.catalog.products.map((p) => ({
              id: p.id,
              productId: p.productId,
              name: p?.name ?? p?.title ?? null,
            }));
            await emitContextUpdate({ entities: { products } }).catch(() => {});
          }
          bb.write('generatedProducts', catalogState.catalog?.products ?? []);
          if (fromPreloadOuter) {
            bb.write('catalogSource', 'user_upload');
            bb.write('catalogItems', catalogState.catalog?.products ?? []);
          }
          await stepReporter.completed('catalog').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Profile generated', emitCtx);
          await appendReasoningLogLine(missionId, '✓ Product catalogue ready', emitCtx);
          return;
        }
        if (tool === 'web_scrape_store_images') {
          await stepReporter.started('web_scrape_store_images').catch(() => {});
          const { executeWebScrapeForReact } = await import('../react/buildStoreReactTools.ts');
          const drOuter = await prisma.draftStore
            .findUnique({ where: { id: draftId }, select: { preview: true, input: true } })
            .catch(() => null);
          const previewScrapeOuter = drOuter?.preview && typeof drOuter.preview === 'object' ? drOuter.preview : {};
          const dinScrapeOuter = drOuter?.input && typeof drOuter.input === 'object' ? drOuter.input : {};
          const locScrapeOuter = params.location ?? input?.location ?? null;
          let suburbScrapeOuter = null;
          if (previewScrapeOuter.location != null && String(previewScrapeOuter.location).trim()) {
            suburbScrapeOuter = String(previewScrapeOuter.location).split(',')[0]?.trim() || null;
          } else if (typeof locScrapeOuter === 'string' && locScrapeOuter.trim()) {
            suburbScrapeOuter = locScrapeOuter.split(',')[0]?.trim() || null;
          }
          const scrapePayloadOuter = {
            businessName:
              previewScrapeOuter.storeName ?? params.businessName ?? input?.businessName ?? '',
            businessType:
              previewScrapeOuter.storeType ??
              previewScrapeOuter.businessType ??
              params.businessType ??
              params.verticalSlug ??
              input?.businessType ??
              '',
            suburb: suburbScrapeOuter,
            websiteUrl: previewScrapeOuter.websiteUrl ?? dinScrapeOuter.websiteUrl ?? input?.websiteUrl ?? null,
            facebookHandle: previewScrapeOuter.facebookHandle ?? dinScrapeOuter.facebookHandle ?? null,
          };
          await executeWebScrapeForReact(bb, scrapePayloadOuter);
          bb.write('react_step_web_scrape_store_images', true);
          await stepReporter.completed('web_scrape_store_images').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Web image scrape complete', emitCtx);
          return;
        }
        if (tool === 'business_image_enrich') {
          await stepReporter.started('business_image_enrich').catch(() => {});
          const { executeBusinessImageEnrichForReact } = await import('../react/buildStoreReactTools.ts');
          const classifierProfile = classifierProfileFromParams(params);
          const storeName = await resolveStoreNameForImageEnrich(draftId, params, input);
          await executeBusinessImageEnrichForReact(bb, {
            profile: classifierProfile,
            storeName,
            businessType: params.businessType ?? params.verticalSlug ?? input?.businessType ?? null,
            location: params.location ?? input?.location ?? null,
          });
          bb.write('react_step_business_image_enrich', true);
          await mergeImageEnrichmentSignalsToMission(missionId, bb);
          await stepReporter.completed('business_image_enrich').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Image keywords ready for visuals', emitCtx);
          return;
        }
        if (tool === 'media') {
          await stepReporter.started('media').catch(() => {});
          const snapMediaOuter = bb.snapshot();
          const enrichedFromBbOuter = snapMediaOuter.enrichedImageFillProfile;
          const enrichedImagesOuter = Array.isArray(snapMediaOuter.enrichedImages)
            ? snapMediaOuter.enrichedImages
            : null;
          const imageSourceOuter =
            typeof snapMediaOuter.imageEnrichmentStatus === 'string'
              ? snapMediaOuter.imageEnrichmentStatus
              : undefined;
          const preloadedUrlsOuter =
            enrichedImagesOuter && enrichedImagesOuter.length > 0 && imageSourceOuter === 'web_scrape'
              ? enrichedImagesOuter
                  .map((i) => (i && typeof i.url === 'string' ? i.url.trim() : ''))
                  .filter(Boolean)
              : undefined;
          const reactPreloadedImageConfidenceOuter =
            typeof snapMediaOuter.imageConfidenceScore === 'number' &&
            Number.isFinite(snapMediaOuter.imageConfidenceScore)
              ? snapMediaOuter.imageConfidenceScore
              : undefined;
          await runFinalizeDraftChecked(
            draftId,
            {
              includeImages: params.includeImages,
              generationProfile: params.generationProfile,
              pipelineMissionId: missionId,
              reactEnrichedImageFillProfile:
                enrichedFromBbOuter != null &&
                typeof enrichedFromBbOuter === 'object' &&
                'verticalSlug' in enrichedFromBbOuter
                  ? enrichedFromBbOuter
                  : undefined,
              reactPreloadedImageUrls: preloadedUrlsOuter,
              reactImageEnrichmentStatus: imageSourceOuter,
              reactPreloadedImageConfidence: reactPreloadedImageConfidenceOuter,
            },
            stepReporter,
          );
          bb.write('react_step_media', true);
          await stepReporter.completed('media').catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Store visuals generated', emitCtx);
          return;
        }
        if (tool === 'copy') {
          await stepReporter.started('copy').catch(() => {});
          bb.write('react_step_copy', true);
          await stepReporter.completed('copy', { checkpoint: true }).catch(() => {});
          await appendReasoningLogLine(missionId, '✓ Store copy refined', emitCtx);
          return;
        }
        console.warn('[ReAct] unknown tool step (no-op):', tool);
      },
      llmGateway,
      reporter
    );
    await bb.flushReasoningEmits?.().catch(() => {});
    if (missionId) {
      await mergeMissionContext(missionId, bb.snapshot(), { prisma }).catch(() => {});
    }
  }

  const updated = await prisma.draftStore.findUnique({ where: { id: draftId } });
  const preview = parseDraftJsonField(updated?.preview);
  await maybeValidateDraftOutput(draftId, missionId, params, input, options.emitContextUpdate, {
    skipBecauseReactValidated: useReact && process.env.USE_OUTPUT_VALIDATION === 'true',
  });
  console.log('[generateDraft] done (two-modes)', {
    draftId,
    status: 'ready',
    items: draftPreviewItemCount(updated?.preview),
    catalogSource: preview?.meta?.catalogSource,
  });
  return { draft: updated, preview };
}

/**
 * Generate preview for a draft store
 * Reuses existing generation logic (or two-modes pipeline when USE_QUICK_START_TWO_MODES is true)
 * @param {string} draftId
 * @param {{ userId?: string | null }} [options] - required for paid AI (mode 'ai'); optional for template/ocr
 */
export async function generateDraft(draftId, options = {}) {
  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  if (draft.status === 'committed') {
    throw new Error(`Draft ${draftId} has already been committed`);
  }

  // Check expiry
  if (new Date() > draft.expiresAt) {
    await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'failed',
      actorType: 'automation',
      correlationId: draft.generationRunId,
      reason: 'EXPIRE',
      extraData: {
        error: 'Draft expired',
        errorCode: DraftErrorCode.DRAFT_EXPIRED,
        recommendedAction: RecommendedAction.startOver,
      },
    });
    throw new Error(`Draft ${draftId} has expired`);
  }

  let statusUpdateDone = false;
  try {
    // Update status to generating (skip if already generating, e.g. orchestra-created draft)
    const currentStatus = (draft.status || '').toLowerCase();
    if (currentStatus !== 'generating') {
      await transitionDraftStoreStatus({
        prisma,
        draftId,
        toStatus: 'generating',
        fromStatus: currentStatus === 'draft' ? 'draft' : undefined,
        actorType: 'automation',
        correlationId: draft.generationRunId,
        reason: 'GENERATE_DRAFT_START',
      });
    }

    // Persisted input: includeImages, businessType/storeType, prompt, etc. (from generate route or orchestra start)
    const input = draft.input || {};

    if (USE_QUICK_START_TWO_MODES) {
      const result = await generateDraftTwoModes(draftId, draft, input, {
        ...options,
        missionContext: options.missionContext ?? null,
        emitContextUpdate: options.emitContextUpdate,
        stepReporter: options.stepReporter ?? null,
        reactMissionId: options.reactMissionId ?? null,
      });
      statusUpdateDone = true;
      return result;
    }
    let profile;
    let ocrText = null;

    // Step 1: Handle OCR mode
    if (draft.mode === 'ocr') {
      // For OCR, we expect the image to be uploaded and processed
      // The input should contain ocrRawText or a reference to uploaded media
      ocrText = input.ocrRawText || null;
      
      if (!ocrText && input.photoDataUrl) {
        // Process photo if provided
        try {
          ocrText = await performMenuOcr(input.photoDataUrl);
          if (!ocrText || ocrText.trim().length === 0) {
            throw new Error('OCR returned empty text');
          }
        } catch (ocrError) {
          console.error(`[DraftStore] OCR error for draft ${draftId}:`, ocrError);
          throw new Error(`OCR failed: ${ocrError.message || 'Unable to process image'}`);
        }
      }
    }

    // Step 2: Generate business profile
    const profileInput = {
      mode: draft.mode === 'ocr' ? 'ocr' : draft.mode === 'template' ? 'template' : 'ai_description',
      ocrRawText: ocrText,
      descriptionText: input.prompt || input.businessDescription,
      templateKey: input.templateId,
      explicitName: input.businessName,
      explicitType: input.businessType,
      regionCode: input.locale || 'en',
      ...(input.businessDescription && String(input.businessDescription).trim() ? { explicitTagline: String(input.businessDescription).trim() } : {}),
    };

    const profileMod = await loadBusinessProfileService();
    if (!profileMod) throw tsModuleUnavailable('businessProfileService');
    const generateBusinessProfile = profileMod.generateBusinessProfile ?? profileMod.default?.generateBusinessProfile;
    if (typeof generateBusinessProfile !== 'function') throw tsModuleUnavailable('businessProfileService');
    profile = await generateBusinessProfile(profileInput);
    console.log(`[DraftStore] Generated profile for draft ${draftId}: "${profile.name}" (${profile.type})`);

    const guardsEnabled = isDraftGuardsEnabled();
    const effectiveVerticalType = guardsEnabled ? effectiveVertical(profile.type, input.businessType || input.storeType) : null;

    const menuFirstMode = input.menuFirstMode === true || input.menuOnly === true || input.ignoreImages === true;
    let products = [];
    let categories;
    let itemsForPreview;

    if (menuFirstMode) {
      // Vertical-locked menu via LLM; no images. Menu is publish-ready without item images.
      const verticalForMenu = (input.vertical || input.businessType || input.storeType || profile.type || 'general').toString().trim();
      const currency =
        (input.currencyCode && String(input.currencyCode).trim().toUpperCase()) ||
        (input.currency && String(input.currency).trim().toUpperCase()) ||
        inferCurrencyFromLocationText(input.location) ||
        'AUD';
      const menuResult = await generateVerticalLockedMenu({
        businessName: profile.name || input.businessName || 'Store',
        businessType: String(input.businessType || input.storeType || profile.type || '').trim(),
        vertical: verticalForMenu,
        location: (input.location || '').toString().trim(),
        priceTier: (input.priceTier || '').toString().trim(),
        currency,
        draftId,
      });
      products = menuResult.items;
      categories = menuResult.categories;
      itemsForPreview = products;
      await mergeCatalogVerticalWarningsToMission(
        options.reactMissionId,
        menuResult.verticalLockValidationWarnings,
        verticalForMenu
      );
      console.log(`[DraftStore] MenuFirst: generated ${categories.length} categories, ${products.length} items for vertical "${verticalForMenu}"`);
    } else {
    // Step 3: Parse or generate products
    let usedAiMenuFallback = false; // set true when template missing and we use generateVerticalLockedMenu
    if (draft.mode === 'ocr' && ocrText) {
      // Simple product extraction from OCR text (cap at 30 items)
      const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
      products = lines.slice(0, 30).map((line, idx) => {
        // Try to extract price (look for $, €, £, numbers)
        const priceMatch = line.match(/[\$€£¥]\s*[\d,]+\.?\d*/);
        const price = priceMatch ? priceMatch[0] : null;
        const name = line.replace(/[\$€£¥]\s*[\d,]+\.?\d*/g, '').trim();
        
        return {
          name: name || `Item ${idx + 1}`,
          price: price || null,
          description: null,
        };
      });
    } else {
      // Template library: business-type templates with ~30 items each (used when mode is 'template' or for fallback)
      const templateItems = {
        cafe: [
          { name: 'Espresso', price: '$3.50', description: 'Rich and bold' },
          { name: 'Cappuccino', price: '$4.00', description: 'Smooth and creamy' },
          { name: 'Latte', price: '$4.50', description: 'Perfectly balanced' },
          { name: 'Americano', price: '$3.00', description: 'Classic black coffee' },
          { name: 'Mocha', price: '$4.75', description: 'Chocolate and espresso' },
          { name: 'Flat White', price: '$4.25', description: 'Velvety microfoam' },
          { name: 'Cold Brew', price: '$4.50', description: 'Smooth and refreshing' },
          { name: 'Iced Latte', price: '$5.00', description: 'Chilled and creamy' },
          { name: 'Chai Latte', price: '$4.50', description: 'Spiced tea and milk' },
          { name: 'Matcha Latte', price: '$5.25', description: 'Green tea and milk' },
          { name: 'Croissant', price: '$3.50', description: 'Buttery and flaky' },
          { name: 'Muffin', price: '$3.75', description: 'Freshly baked' },
          { name: 'Avocado Toast', price: '$9.00', description: 'Sourdough and avocado' },
          { name: 'Breakfast Wrap', price: '$8.50', description: 'Eggs and fixings' },
          { name: 'Granola Bowl', price: '$7.50', description: 'Yogurt and fruit' },
          { name: 'Smoothie', price: '$6.50', description: 'Fresh fruit blend' },
          { name: 'Fresh Juice', price: '$5.50', description: 'Cold-pressed' },
          { name: 'Hot Chocolate', price: '$4.25', description: 'Rich and sweet' },
          { name: 'Tea', price: '$3.00', description: 'Selection of teas' },
          { name: 'Bagel with Cream Cheese', price: '$4.50', description: 'Toasted to order' },
          { name: 'Quiche Slice', price: '$6.00', description: 'Daily special' },
          { name: 'Soup of the Day', price: '$5.50', description: 'Homemade' },
          { name: 'Sandwich', price: '$9.50', description: 'Build your own' },
          { name: 'Salad Bowl', price: '$10.00', description: 'Fresh greens' },
          { name: 'Cookie', price: '$2.50', description: 'House-made' },
          { name: 'Brownie', price: '$3.50', description: 'Chocolate fudge' },
          { name: 'Cake Slice', price: '$5.00', description: 'Daily selection' },
          { name: 'Energy Bar', price: '$3.25', description: 'Nutrient-packed' },
          { name: 'Bottled Water', price: '$2.50', description: 'Still or sparkling' },
          { name: 'Soft Drink', price: '$2.75', description: 'Various options' },
        ],
        restaurant: [
          { name: 'Signature Burger', price: '$15.00', description: 'Our house special' },
          { name: 'Caesar Salad', price: '$12.00', description: 'Fresh and crisp' },
          { name: 'Pasta Carbonara', price: '$18.00', description: 'Creamy and delicious' },
          { name: 'Margherita Pizza', price: '$14.00', description: 'Classic Italian' },
          { name: 'Grilled Salmon', price: '$22.00', description: 'With seasonal vegetables' },
          { name: 'Ribeye Steak', price: '$28.00', description: '12oz, cooked to order' },
          { name: 'Chicken Parmesan', price: '$16.00', description: 'Crispy and saucy' },
          { name: 'Fish and Chips', price: '$14.50', description: 'Beer-battered' },
          { name: 'Vegetable Stir Fry', price: '$13.00', description: 'Wok-tossed' },
          { name: 'Soup of the Day', price: '$7.00', description: 'Chef\'s choice' },
          { name: 'Garlic Bread', price: '$5.00', description: 'Toasted with herbs' },
          { name: 'Mozzarella Sticks', price: '$8.00', description: 'With marinara' },
          { name: 'Wings', price: '$11.00', description: 'Choice of sauce' },
          { name: 'Club Sandwich', price: '$12.00', description: 'Triple-decker' },
          { name: 'Club Salad', price: '$11.00', description: 'Grilled chicken' },
          { name: 'Kids Meal', price: '$8.00', description: 'Choice of entrée' },
          { name: 'Tiramisu', price: '$8.50', description: 'Classic dessert' },
          { name: 'Chocolate Lava Cake', price: '$9.00', description: 'Warm and gooey' },
          { name: 'Ice Cream', price: '$5.50', description: 'Two scoops' },
          { name: 'Cheesecake', price: '$8.00', description: 'New York style' },
          { name: 'Coffee', price: '$3.50', description: 'Regular or decaf' },
          { name: 'Iced Tea', price: '$3.00', description: 'Sweet or unsweet' },
          { name: 'Lemonade', price: '$3.50', description: 'Fresh squeezed' },
          { name: 'Wine', price: '$8.00', description: 'House selection' },
          { name: 'Beer', price: '$6.00', description: 'Draft or bottle' },
          { name: 'Cocktail', price: '$10.00', description: 'Classic or signature' },
          { name: 'Dessert Special', price: '$7.50', description: 'Ask your server' },
          { name: 'Side Salad', price: '$4.00', description: 'Garden fresh' },
          { name: 'French Fries', price: '$4.50', description: 'Crispy golden' },
          { name: 'Coleslaw', price: '$3.50', description: 'Creamy or vinegar' },
        ],
        bakery: [
          { name: 'Croissant', price: '$3.00', description: 'Buttery and flaky' },
          { name: 'Chocolate Cake', price: '$8.00', description: 'Rich and decadent' },
          { name: 'Sourdough Bread', price: '$6.00', description: 'Freshly baked daily' },
          { name: 'Apple Pie', price: '$5.00', description: 'Homemade with love' },
          { name: 'Cinnamon Roll', price: '$4.50', description: 'Cream cheese frosting' },
          { name: 'Muffin', price: '$3.50', description: 'Blueberry or chocolate' },
          { name: 'Bagel', price: '$2.75', description: 'Toasted with spread' },
          { name: 'Danish', price: '$4.00', description: 'Fruit or cheese' },
          { name: 'Scone', price: '$3.75', description: 'Plain or fruit' },
          { name: 'Brownie', price: '$3.25', description: 'Fudge or blondie' },
          { name: 'Cookie', price: '$2.50', description: 'Chocolate chip or oatmeal' },
          { name: 'Éclair', price: '$4.50', description: 'Chocolate or coffee' },
          { name: 'Macaron', price: '$2.00', description: 'Assorted flavours' },
          { name: 'Cupcake', price: '$3.50', description: 'Daily flavours' },
          { name: 'Loaf Cake', price: '$7.00', description: 'Banana or lemon' },
          { name: 'Tart', price: '$5.50', description: 'Fruit or custard' },
          { name: 'Baguette', price: '$4.00', description: 'Fresh daily' },
          { name: 'Focaccia', price: '$5.00', description: 'Herb or olive' },
          { name: 'Pie Slice', price: '$4.50', description: 'Seasonal selection' },
          { name: 'Cheese Danish', price: '$4.25', description: 'Cream cheese filled' },
          { name: 'Palmier', price: '$3.00', description: 'Crispy caramelized' },
          { name: 'Bread Pudding', price: '$5.00', description: 'Warm with sauce' },
          { name: 'Strudel', price: '$4.75', description: 'Apple or cherry' },
          { name: 'Donut', price: '$2.75', description: 'Glazed or filled' },
          { name: 'Biscotti', price: '$3.00', description: 'Almond or chocolate' },
          { name: 'Shortbread', price: '$3.25', description: 'Buttery and crisp' },
          { name: 'Bundt Cake Slice', price: '$4.00', description: 'Lemon or chocolate' },
          { name: 'Pavlova', price: '$6.00', description: 'Berry and cream' },
          { name: 'Bread Roll', price: '$1.50', description: 'White or whole grain' },
          { name: 'Coffee', price: '$3.00', description: 'To go with your pastry' },
        ],
        florist: [
          { name: 'Mixed Bouquet', price: '$35.00', description: 'Fresh seasonal flowers' },
          { name: 'Rose Arrangement', price: '$45.00', description: 'Classic red or mixed roses' },
          { name: 'Sympathy Wreath', price: '$55.00', description: 'Elegant tribute arrangement' },
          { name: 'Wedding Centerpiece', price: '$75.00', description: 'Custom table arrangement' },
          { name: 'Hand-tied Bouquet', price: '$40.00', description: 'Garden-style bouquet' },
          { name: 'Succulent Planter', price: '$25.00', description: 'Low-maintenance gift' },
          { name: 'Dried Flower Bundle', price: '$30.00', description: 'Long-lasting display' },
          { name: 'Seasonal Posy', price: '$28.00', description: 'Local seasonal blooms' },
          { name: 'Tulip Bouquet', price: '$32.00', description: 'Bright spring colours' },
          { name: 'Lily Arrangement', price: '$38.00', description: 'Elegant and fragrant' },
          { name: 'Sunflower Bundle', price: '$30.00', description: 'Cheerful and bold' },
          { name: 'Orchid Plant', price: '$45.00', description: 'Potted, easy care' },
          { name: 'Corsage', price: '$25.00', description: 'For special events' },
          { name: 'Boutonnière', price: '$15.00', description: 'Single stem' },
          { name: 'Table Centerpiece', price: '$65.00', description: 'Event styling' },
          { name: 'Baby Breath Bundle', price: '$20.00', description: 'Delicate filler' },
          { name: 'Hydrangea Bouquet', price: '$42.00', description: 'Full and lush' },
          { name: 'Peony Arrangement', price: '$50.00', description: 'Romantic blooms' },
          { name: 'Daisy Bouquet', price: '$22.00', description: 'Simple and fresh' },
          { name: 'Carnation Bundle', price: '$18.00', description: 'Long-lasting colour' },
          { name: 'Greenery Bundle', price: '$25.00', description: 'Eucalyptus and foliage' },
          { name: 'Vase', price: '$15.00', description: 'Glass or ceramic' },
          { name: 'Gift Card', price: '$25.00', description: 'Any amount' },
          { name: 'Delivery', price: '$12.00', description: 'Same-day available' },
          { name: 'Subscription', price: '$35.00', description: 'Weekly or monthly' },
          { name: 'Custom Arrangement', price: '$55.00', description: 'Consultation included' },
          { name: 'Single Stem Rose', price: '$8.00', description: 'Red, white, or mixed' },
          { name: 'Lavender Bundle', price: '$20.00', description: 'Dried, fragrant' },
          { name: 'Wildflower Bouquet', price: '$28.00', description: 'Local and seasonal' },
          { name: 'Jasmine Plant', price: '$32.00', description: 'Potted, fragrant' },
          { name: 'Herb Garden', price: '$28.00', description: 'Culinary herbs' },
          { name: 'Cactus Arrangement', price: '$35.00', description: 'Desert style' },
        ],
        nail_salon: [
          { name: 'Classic Manicure', price: '$42.00', description: 'Shape, cuticle care, polish' },
          { name: 'Gel Manicure', price: '$55.00', description: 'Long-lasting gel polish' },
          { name: 'Acrylic Full Set', price: '$65.00', description: 'Full set with tips' },
          { name: 'Classic Pedicure', price: '$52.00', description: 'Soak, exfoliate, polish' },
          { name: 'Gel Pedicure', price: '$65.00', description: 'Gel polish on toes' },
          { name: 'Spa Pedicure', price: '$75.00', description: 'Extended soak and massage' },
          { name: 'Nail Art', price: '$10.00', description: 'Design per nail' },
          { name: 'Nail Repair', price: '$8.00', description: 'Single nail repair' },
          { name: 'Lash Lift', price: '$65.00', description: 'Lash lift and tint' },
          { name: 'Brow Lamination', price: '$45.00', description: 'Brow shape and set' },
          { name: 'Waxing - Brows', price: '$18.00', description: 'Brow wax' },
          { name: 'Waxing - Lip', price: '$12.00', description: 'Lip wax' },
          { name: 'Waxing - Full Leg', price: '$45.00', description: 'Full leg wax' },
          { name: 'Gel Removal', price: '$15.00', description: 'Soak-off gel removal' },
          { name: 'Nail Shape & File', price: '$12.00', description: 'Shape and buff' },
          { name: 'Cuticle Oil Treatment', price: '$8.00', description: 'Nourishing cuticle oil' },
          { name: 'Paraffin Wax Hands', price: '$20.00', description: 'Hand moisturising treatment' },
          { name: 'Hand Massage', price: '$15.00', description: '10 min hand massage' },
          { name: 'Kids Manicure', price: '$25.00', description: 'Quick polish for kids' },
          { name: 'Bridal Package', price: '$120.00', description: 'Manicure and pedicure' },
          { name: 'Shellac Manicure', price: '$50.00', description: 'CND Shellac' },
          { name: 'French Manicure', price: '$48.00', description: 'Classic French tips' },
          { name: 'Ombre Nails', price: '$55.00', description: 'Ombre colour blend' },
          { name: 'Nail Extension', price: '$70.00', description: 'Single extension' },
          { name: 'Facial - Express', price: '$45.00', description: '30 min express facial' },
          { name: 'Facial - Full', price: '$85.00', description: '60 min full facial' },
          { name: 'Eyebrow Tint', price: '$15.00', description: 'Brow tint' },
          { name: 'Eyelash Tint', price: '$18.00', description: 'Lash tint' },
          { name: 'Gift Voucher', price: '$50.00', description: 'Any amount' },
          { name: 'Consultation', price: '$0.00', description: 'Free 15 min consult' },
        ],
        retail: [
          { name: 'Women\'s Blouse', price: '$45.00', description: 'Classic fit, multiple colours' },
          { name: 'High-Waist Trousers', price: '$65.00', description: 'Tailored, office-ready' },
          { name: 'Summer Dress', price: '$89.00', description: 'Light and breezy' },
          { name: 'Denim Jacket', price: '$75.00', description: 'Casual layering piece' },
          { name: 'Knit Sweater', price: '$55.00', description: 'Soft and warm' },
          { name: 'Leather Handbag', price: '$120.00', description: 'Everyday carry' },
          { name: 'Ankle Boots', price: '$95.00', description: 'Comfortable heel' },
          { name: 'Silk Scarf', price: '$35.00', description: 'Printed design' },
          { name: 'Statement Necklace', price: '$42.00', description: 'Handcrafted' },
          { name: 'Sunglasses', price: '$55.00', description: 'UV protection' },
          { name: 'Belts', price: '$28.00', description: 'Leather or fabric' },
          { name: 'T-Shirt', price: '$25.00', description: 'Premium cotton' },
          { name: 'Skirt', price: '$48.00', description: 'Mid-length, versatile' },
          { name: 'Cardigan', price: '$52.00', description: 'Button-front' },
          { name: 'Jumpsuit', price: '$78.00', description: 'One-piece style' },
          { name: 'Winter Coat', price: '$145.00', description: 'Warm and stylish' },
          { name: 'Earrings', price: '$22.00', description: 'Stud or drop' },
          { name: 'Watch', price: '$85.00', description: 'Classic or sport' },
          { name: 'Wallet', price: '$38.00', description: 'Compact and secure' },
          { name: 'Hair Accessories', price: '$15.00', description: 'Clips and bands' },
          { name: 'Leggings', price: '$32.00', description: 'High-waist, stretch' },
          { name: 'Shorts', price: '$35.00', description: 'Casual or tailored' },
          { name: 'Polo Shirt', price: '$30.00', description: 'Men\'s or women\'s' },
          { name: 'Hoodie', price: '$45.00', description: 'Cozy fleece' },
          { name: 'Trainers', price: '$72.00', description: 'Everyday sneakers' },
          { name: 'Sandals', price: '$42.00', description: 'Summer footwear' },
          { name: 'Pajama Set', price: '$48.00', description: 'Comfortable sleepwear' },
          { name: 'Swimwear', price: '$55.00', description: 'One or two piece' },
          { name: 'Gift Card', price: '$50.00', description: 'Any amount' },
          { name: 'Personal Styling', price: '$0.00', description: 'Free consultation' },
        ],
      };

      // Map profile types (e.g. coffee-shop from businessProfileService) to template keys (cafe, restaurant, etc.)
      const profileTypeToTemplateKey = {
        'coffee-shop': 'cafe',
        'coffee_shop': 'cafe',
        'cafe': 'cafe',
        'restaurant': 'restaurant',
        'bakery': 'bakery',
        'florist': 'florist',
        'flower': 'florist',
        'nail_salon': 'nail_salon',
        nails: 'nail_salon',
        beauty: 'nail_salon',
        salon: 'nail_salon',
        retail: 'retail',
        fashion: 'retail',
        'general': 'generic_store',
        generic_store: 'generic_store',
      };
      const rawType = (profile.type && String(profile.type).toLowerCase().trim()) || 'generic';
      const normalizedKey = rawType.replace(/\s+/g, '_');
      let fromProfile = profileTypeToTemplateKey[rawType] ?? profileTypeToTemplateKey[normalizedKey];
      // If profile type didn't map (e.g. "general"), infer from business name so "Union Road Cafe" -> cafe
      if (!fromProfile && (input.businessName || profile.name)) {
        const name = String((input.businessName || profile.name || '')).toLowerCase();
        if (/\bcafe\b|\bcoffee\b|\bespresso\b|\blatte\b/.test(name)) fromProfile = 'cafe';
        else if (/\brestaurant\b|\bbistro\b|\bgrill\b|\bkitchen\b/.test(name)) fromProfile = 'restaurant';
        else if (/\bbakery\b|\bbakehouse\b|\bpastry\b/.test(name)) fromProfile = 'bakery';
        else if (/\bflorist\b|\bflower\b|\bbouquet\b|\bbloom\b/.test(name)) fromProfile = 'florist';
        else if (/\bnail\b|\bbeauty\b|\bsalon\b/.test(name)) fromProfile = 'nail_salon';
        else if (/\bfashion\b|\bclothing\b|\bretail\b|\bwomen\b|\bapparel\b|\bwear\b/.test(name)) fromProfile = 'retail';
      }
      let templateKey = (input.templateId && String(input.templateId).toLowerCase().trim()) || fromProfile || normalizedKey;
      const btInput = (input.businessType || input.storeType || '').toString().toLowerCase();
      const isNailsOrBeautyInput = /\bnail|\bbeauty\b|\bsalon\b/.test(btInput) && !['cafe', 'restaurant', 'bakery', 'florist'].some((k) => btInput.includes(k));
      const isFashionRetailInput = /\bfashion\b|\bclothing\b|\bapparel\b|\bretail\b|\bwomen\b|\bmen\b|\bdress\b|\bwear\b/.test(btInput) && !['cafe', 'restaurant', 'bakery', 'florist'].some((k) => btInput.includes(k));
      if (isNailsOrBeautyInput && templateKey === 'cafe') {
        templateKey = 'nail_salon';
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DraftStore] template guard: businessType indicates nails/beauty but templateId was cafe; using nail_salon');
        }
      } else if (isFashionRetailInput && templateKey === 'cafe') {
        templateKey = 'retail';
        if (process.env.NODE_ENV !== 'production') {
          console.log('[DraftStore] template guard: businessType indicates fashion/retail but templateId was cafe; using retail');
        }
      }
      const verticalSlugInput = input.verticalSlug ?? (input.businessType || input.storeType ? resolveVerticalSlug(input.businessType, input.vertical) : null);
      if (verticalSlugInput && typeof verticalSlugInput === 'string' && verticalSlugInput.trim()) {
        const audience = (profile && typeof profile === 'object' && profile.audience) ? profile.audience : undefined;
        const resolved = selectTemplateId(verticalSlugInput.trim(), audience);
        if (resolved) templateKey = resolved;
      }
      let list = templateItems[templateKey] || templateItems[fromProfile] || templateItems[rawType] || templateItems[normalizedKey] || getTemplateItems(templateKey) || getTemplateItems('services_generic') || null;
      if (!list) {
        const verticalForMenu = (input.vertical || input.businessType || input.storeType || profile.type || 'general').toString().trim();
        const verticalNorm = verticalForMenu.toLowerCase().replace(/\s+/g, '_');
        const foodLikeVerticals = ['sweets_bakery', 'sweets_store', 'desserts', 'dessert_store', 'cafe', 'restaurant', 'bakery', 'florist', 'coffee_shop', 'flower', 'barber', 'nail_salon', 'real_estate'];
        const isFoodLike = foodLikeVerticals.some((v) => verticalNorm.includes(v) || v.includes(verticalNorm)) || ['cafe', 'restaurant', 'bakery', 'florist'].includes(verticalNorm);
        if (isFoodLike) {
          try {
            const currency =
              (input.currencyCode && String(input.currencyCode).trim().toUpperCase()) ||
              (input.currency && String(input.currency).trim().toUpperCase()) ||
              inferCurrencyFromLocationText(input.location) ||
              'AUD';
            const menuResult = await generateVerticalLockedMenu({
              businessName: profile.name || input.businessName || 'Store',
              businessType: String(input.businessType || input.storeType || profile.type || '').trim(),
              vertical: verticalNorm || 'general',
              location: (input.location || '').toString().trim(),
              priceTier: (input.priceTier || '').toString().trim(),
              currency,
              draftId,
            });
            products = menuResult.items;
            categories = menuResult.categories;
            itemsForPreview = products;
            await mergeCatalogVerticalWarningsToMission(
              options.reactMissionId,
              menuResult.verticalLockValidationWarnings,
              verticalNorm || 'general'
            );
            usedAiMenuFallback = true;
            console.log(`[DraftStore] Template missing for "${verticalNorm}": used AI menu fallback, ${products.length} items`);
          } catch (fallbackErr) {
            console.warn('[DraftStore] AI menu fallback failed, using generic list:', fallbackErr?.message || fallbackErr);
          }
        }
        if (!usedAiMenuFallback) {
          list = getTemplateItems('services_generic') || getTemplateItems('generic_store') || Array.from({ length: 30 }, (_, i) => ({
            name: `${profile.type || 'Product'} ${i + 1}`,
            price: `$${(19.99 + i).toFixed(2)}`,
            description: i % 3 === 0 ? 'Quality item' : i % 3 === 1 ? 'Popular choice' : 'Customer favourite',
          }));
        }
      }
      if (!usedAiMenuFallback) {
        products = (Array.isArray(list) ? list : []).slice(0, 30);
      }
    }

    // Stable IDs: item_${draftId}_${index} (underscore delimiter for frontend keying / parsing)
    products = products.map((p, i) => ({ ...p, id: p.id || `item_${draftId}_${i}` }));

    // includeImages from persisted draft.input (set by /api/draft-store/generate and orchestra start)
    const includeImages = input.includeImages !== false;
    const MAX_ITEMS_FOR_IMAGES = 30; // Cap so OCR/edge cases don't hammer Pexels/OpenAI
    const itemsToEnrich = products.slice(0, MAX_ITEMS_FOR_IMAGES);
    if (includeImages && itemsToEnrich.length > 0) {
      const menuModLegacy = await loadMenuVisualAgent();
      if (!menuModLegacy) throw tsModuleUnavailable('menuVisualAgent');
      const generateImageUrlForDraftItemLegacy = menuModLegacy.generateImageUrlForDraftItem ?? menuModLegacy.default?.generateImageUrlForDraftItem;
      if (typeof generateImageUrlForDraftItemLegacy !== 'function') throw tsModuleUnavailable('menuVisualAgent');
      const genProfile = input.generationProfile ?? input.classificationProfile ?? null;
      const imageFillProfileLegacy = genProfile ? {
        verticalSlug: genProfile.verticalSlug || '',
        keywords: genProfile.keywords,
        forbiddenKeywords: genProfile.forbiddenKeywords,
        audience: genProfile.audience,
        categoryHints: genProfile.categoryHints,
      } : null;
      const businessType = (input.businessType || input.storeType || profile.type || '')
        .toString().toLowerCase().trim().replace(/\s+/g, '_');
      const businessTypeToStyle = {
        cafe: 'warm',
        'coffee-shop': 'warm',
        coffee_shop: 'warm',
        restaurant: 'warm',
        bakery: 'warm',
        bar: 'warm',
        florist: 'vibrant',
        salon: 'modern',
        nail_salon: 'modern',
        nails: 'modern',
        beauty: 'modern',
        retail: 'minimal',
        fashion: 'minimal',
        spa: 'modern',
        design: 'minimal',
        studio: 'minimal',
      };
      const styleName = businessTypeToStyle[businessType] || 'modern';
      const BATCH_SIZE = 5;
      for (let offset = 0; offset < itemsToEnrich.length; offset += BATCH_SIZE) {
        const batch = itemsToEnrich.slice(offset, offset + BATCH_SIZE);
        const settled = await Promise.allSettled(
          batch.map((p) => {
            const existingImageUrl = resolveUsableDraftItemImageUrl(p);
            if (existingImageUrl) {
              return Promise.resolve(existingImageUrl);
            }
            if (guardsEnabled && effectiveVerticalType === 'food' && isBlockedCandidateForFood(p.name, p.description)) {
              return Promise.resolve(null);
            }
            const opts = imageFillProfileLegacy ? { profile: imageFillProfileLegacy, categoryHint: null } : undefined;
            return generateImageUrlForDraftItemLegacy(p.name, p.description, styleName, opts);
          })
        );
        batch.forEach((item, i) => {
          const result = settled[i];
          if (result.status === 'fulfilled' && result.value && !item.imageUrl) {
            item.imageUrl = result.value;
          }
        });
      }
      if (guardsEnabled && effectiveVerticalType) {
        applyItemGuards(products, effectiveVerticalType);
      }
      const withImages = products.filter((p) => p.imageUrl).length;
      console.log(`[DraftStore] Generated ${withImages}/${itemsToEnrich.length} item images for draft ${draftId}`);
    }

    // Step 4: Build preview data — canonical categories: [{ id, name }], products with categoryId
    // For food businesses: use menu sections (Entrees / Mains / Desserts / Drinks). Else: single category from profile.type.
    // Skip when we already have categories from AI menu fallback (template missing for food-like vertical).
    if (!usedAiMenuFallback) {
      const menuResult = getMenuCategoriesAndAssignments(products, profile.type || '');
      if (menuResult) {
        categories = menuResult.categories;
        itemsForPreview = menuResult.items;
      } else {
        const primaryCategoryId = `cat_${draftId}_0`;
        const primaryCategoryName = profile.type || 'General';
        categories = [{ id: primaryCategoryId, name: primaryCategoryName }];
        products.forEach((p) => {
          p.categoryId = primaryCategoryId;
        });
        itemsForPreview = products;
      }
    }
    if (guardsEnabled && effectiveVerticalType) {
      applyNameGuards(itemsForPreview, effectiveVerticalType, categories);
    }
    } // end else !menuFirstMode

    const preview = {
      storeName: profile.name,
      storeType: profile.type,
      slogan: profile.tagline,
      categories: Array.isArray(categories) ? categories : [],
      items: Array.isArray(itemsForPreview) ? itemsForPreview : [],
      images: [], // Legacy; item images are on each product.imageUrl
      brandColors: {
        primary: profile.primaryColor || '#1a1a2e',
        secondary: profile.secondaryColor || '#ffcc00',
      },
      tagline: profile.tagline,
      heroText: profile.heroText,
      stylePreferences: profile.stylePreferences,
    };
    if (menuFirstMode) {
      preview.meta = preview.meta || {};
      preview.meta.menuOnly = true;
    }

    // Canonical hero + avatar: write once so GET /draft returns them and UI shows immediately (and after refresh).
    // When menuFirstMode (AI-on): skip images unless includeImages is true; then run enrichment + hero/avatar.
    let heroImageUrl = null;
    let avatarImageUrl = null;
    const includeImagesForDraft = input.includeImages !== false;
    if (!menuFirstMode) {
      try {
        const heroMod2 = await loadHeroGenerationService();
        if (!heroMod2) throw tsModuleUnavailable('heroGenerationService');
        const generateHeroForDraftFn = heroMod2.generateHeroForDraft ?? heroMod2.default?.generateHeroForDraft;
        if (typeof generateHeroForDraftFn !== 'function') throw tsModuleUnavailable('heroGenerationService');
        const { hero } = await generateHeroForDraftFn({
          storeName: profile.name,
          businessType: profile.type,
          storeType: profile.type,
        });
        heroImageUrl = hero?.imageUrl ?? null;
      } catch (heroErr) {
        if (heroErr?.code === 'TS_MODULE_UNAVAILABLE') throw heroErr;
        console.warn(`[DraftStore] Hero generation failed for draft ${draftId}:`, heroErr?.message || heroErr);
      }
      const firstProductWithImage = (Array.isArray(itemsForPreview) ? itemsForPreview : []).find((p) => p?.imageUrl);
      avatarImageUrl = firstProductWithImage?.imageUrl ?? null;
    } else if (menuFirstMode && includeImagesForDraft && products.length > 0) {
      // AI-on mode with images: fetch item images (Pexels → OpenAI) and hero/avatar so draft is ready with visuals
      const menuModMenuFirst = await loadMenuVisualAgent();
      if (!menuModMenuFirst) throw tsModuleUnavailable('menuVisualAgent');
      const generateImageUrlForDraftItemMenuFirst = menuModMenuFirst.generateImageUrlForDraftItem ?? menuModMenuFirst.default?.generateImageUrlForDraftItem;
      if (typeof generateImageUrlForDraftItemMenuFirst !== 'function') throw tsModuleUnavailable('menuVisualAgent');
      const genProfileMenu = input.generationProfile ?? input.classificationProfile ?? null;
      const imageFillProfileMenu = genProfileMenu ? {
        verticalSlug: genProfileMenu.verticalSlug || '',
        keywords: genProfileMenu.keywords,
        forbiddenKeywords: genProfileMenu.forbiddenKeywords,
        audience: genProfileMenu.audience,
        categoryHints: genProfileMenu.categoryHints,
      } : null;
      const businessType = (input.businessType || input.storeType || profile.type || '')
        .toString().toLowerCase().trim().replace(/\s+/g, '_');
      const businessTypeToStyle = {
        cafe: 'warm', 'coffee-shop': 'warm', coffee_shop: 'warm', restaurant: 'warm', bakery: 'warm',
        bar: 'warm', florist: 'vibrant', salon: 'modern', spa: 'modern', design: 'minimal', studio: 'minimal',
      };
      const styleName = businessTypeToStyle[businessType] || 'modern';
      const MAX_ITEMS = 30;
      const BATCH_SIZE = 5;
      const toEnrich = products.slice(0, MAX_ITEMS);
      const categoriesForHint = Array.isArray(categories) ? categories : [];
      menuFirstImages: for (let offset = 0; offset < toEnrich.length; offset += BATCH_SIZE) {
        if (isShutdownRequested()) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[DraftStore] MenuFirst+images: stopping (server shutdown)', { draftId });
          }
          break menuFirstImages;
        }
        const batch = toEnrich.slice(offset, offset + BATCH_SIZE);
        const settled = await Promise.allSettled(
          batch.map((p) => {
            if (guardsEnabled && effectiveVerticalType === 'food' && isBlockedCandidateForFood(p.name, p.description)) {
              return Promise.resolve(null);
            }
            const categoryHint = p.categoryId && categoriesForHint.length ? categoriesForHint.find((c) => c.id === p.categoryId)?.name : null;
            const opts = imageFillProfileMenu ? { profile: imageFillProfileMenu, categoryHint } : undefined;
            return generateImageUrlForDraftItemMenuFirst(p.name, p.description, styleName, opts);
          })
        );
        batch.forEach((item, i) => {
          const result = settled[i];
          if (result.status === 'fulfilled' && result.value && !item.imageUrl) item.imageUrl = result.value;
        });
      }
      if (guardsEnabled && effectiveVerticalType) {
        applyItemGuards(products, effectiveVerticalType);
      }
      const withImages = products.filter((p) => p.imageUrl).length;
      console.log(`[DraftStore] MenuFirst+images: ${withImages}/${toEnrich.length} item images for draft ${draftId}`);
      try {
        const heroMod3 = await loadHeroGenerationService();
        if (!heroMod3) throw tsModuleUnavailable('heroGenerationService');
        const generateHeroForDraftFn3 = heroMod3.generateHeroForDraft ?? heroMod3.default?.generateHeroForDraft;
        if (typeof generateHeroForDraftFn3 !== 'function') throw tsModuleUnavailable('heroGenerationService');
        const { hero } = await generateHeroForDraftFn3({
          storeName: profile.name,
          businessType: profile.type,
          storeType: profile.type,
        });
        heroImageUrl = hero?.imageUrl ?? null;
      } catch (heroErr) {
        if (heroErr?.code === 'TS_MODULE_UNAVAILABLE') throw heroErr;
        console.warn(`[DraftStore] Hero generation failed for draft ${draftId}:`, heroErr?.message || heroErr);
      }
      const firstProductWithImage = (Array.isArray(itemsForPreview) ? itemsForPreview : []).find((p) => p?.imageUrl);
      avatarImageUrl = firstProductWithImage?.imageUrl ?? null;
    }
    const priorPreview =
      draft.preview && typeof draft.preview === 'object'
        ? draft.preview
        : typeof draft.preview === 'string'
          ? (() => {
              try {
                return JSON.parse(draft.preview) || {};
              } catch {
                return {};
              }
            })()
          : {};
    // Preserve user video from prior preview before pipeline still-hero (empty preview would bypass guard).
    copyVideoHeroFieldsToPreview(preview, priorPreview);
    if (heroImageUrl) {
      applyPipelineGeneratedHeroImage(preview, heroImageUrl, { writer: 'generateDraft', draftId });
    }
    const { hasUserUploadedLogo } = await import('./logoUpdateService.js');
    if (hasUserUploadedLogo(priorPreview)) {
      if (priorPreview.avatar && typeof priorPreview.avatar === 'object') {
        preview.avatar = { ...priorPreview.avatar };
      }
      preview.avatarUrl = priorPreview.avatarUrl ?? priorPreview.avatarImageUrl ?? preview.avatarUrl ?? null;
      preview.avatarImageUrl = priorPreview.avatarImageUrl ?? preview.avatarImageUrl ?? null;
      if (priorPreview.brand && typeof priorPreview.brand === 'object') {
        preview.brand = { ...(preview.brand && typeof preview.brand === 'object' ? preview.brand : {}), ...priorPreview.brand };
      }
      if (priorPreview.meta && typeof priorPreview.meta === 'object') {
        preview.meta = { ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}), ...priorPreview.meta };
      }
      if (priorPreview.store && typeof priorPreview.store === 'object') {
        preview.store = { ...(preview.store && typeof preview.store === 'object' ? preview.store : {}), ...priorPreview.store };
      }
    } else {
      preview.avatar = { imageUrl: avatarImageUrl };
      preview.avatarUrl = avatarImageUrl ?? null;
    }
    mergeWebsiteIntoPreview(preview, input);

    normalizePreviewCategories(preview);
    applyCommerceFieldsToPreview(preview);

    // Soft validation: log only; do not change behavior
    const schemaMod2 = await loadDraftPreviewSchema();
    if (schemaMod2) {
      const parseDraftPreviewFn = schemaMod2.parseDraftPreview ?? schemaMod2.default?.parseDraftPreview;
      if (typeof parseDraftPreviewFn === 'function' && !parseDraftPreviewFn(preview)) {
        console.warn('[DraftStore] preview validation failed (soft)', { draftId });
      }
    }

    // Update draft with preview and always set status to 'ready' on success
    await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'ready',
      fromStatus: 'generating',
      actorType: 'automation',
      correlationId: draft.generationRunId,
      reason: 'GENERATE_DRAFT_SUCCESS',
      extraData: { preview, error: null },
    });
    statusUpdateDone = true;

    console.log('[generateDraft] done', { draftId, status: 'ready', items: preview.items?.length ?? 0 });
    return { draft, preview };
  } catch (error) {
    console.error(`[DraftStore] Generation failed for draft ${draftId}:`, error);

    // Always set status to 'failed' on error (only if we didn't already set 'ready').
    // finalizeDraft may already have transitioned to failed on mission cancel.
    if (!statusUpdateDone && error?.code !== 'MISSION_PIPELINE_CANCELLED') {
      const failure = mapErrorToDraftFailure(error);
      await transitionDraftStoreStatus({
        prisma,
        draftId,
        toStatus: 'failed',
        fromStatus: 'generating',
        actorType: 'automation',
        correlationId: draft.generationRunId,
        reason: 'GENERATE_DRAFT_FAILED',
        extraData: {
          error: failure.errorMessage,
          errorCode: failure.errorCode,
          recommendedAction: failure.recommendedAction,
        },
      }).catch((updateErr) => {
        console.error(`[DraftStore] Failed to set draft ${draftId} status to 'failed':`, updateErr);
      });
    }

    throw error;
  }
}

function parseDraftJsonField(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Item count from draft preview JSON (handles string preview + catalog.products). */
function draftPreviewItemCount(rawPreview) {
  const preview = parseDraftJsonField(rawPreview);
  if (Array.isArray(preview.items) && preview.items.length > 0) return preview.items.length;
  if (Array.isArray(preview.catalog?.products) && preview.catalog.products.length > 0) {
    return preview.catalog.products.length;
  }
  return 0;
}

/**
 * Resolve display business name from draft preview/input. Never returns "Untitled Store".
 */
export function resolveDraftBusinessName(draft, preview, input) {
  const p = preview ?? (draft ? parseDraftJsonField(draft.preview) : {});
  const i = input ?? (draft ? parseDraftJsonField(draft.input) : {});
  const candidates = [
    p.storeName,
    p.meta?.storeName,
    i.businessName,
    i.storeName,
    i.metadata?.businessName,
    i.meta?.businessName,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c.trim() !== 'Untitled Store') {
      return c.trim();
    }
  }
  return null;
}

export function resolveDraftBusinessType(draft, preview, input) {
  const p = preview ?? (draft ? parseDraftJsonField(draft.preview) : {});
  const i = input ?? (draft ? parseDraftJsonField(draft.input) : {});
  const t =
    p.storeType ||
    p.meta?.storeType ||
    i.businessType ||
    i.storeType ||
    i.metadata?.businessType ||
    null;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export function resolveDraftLocation(draft, preview, input) {
  const p = preview ?? (draft ? parseDraftJsonField(draft.preview) : {});
  const i = input ?? (draft ? parseDraftJsonField(draft.input) : {});
  const loc = p.location || p.meta?.location || i.location || i.metadata?.location || null;
  return typeof loc === 'string' && loc.trim() ? loc.trim() : null;
}

/**
 * Get draft store by ID. Explicitly selects id, ownerUserId, input, generationRunId, committedStoreId (and all other fields)
 * so access checks and summary always have tenantId (input.tenantId) and ownership fields.
 */
export async function getDraft(draftId) {
  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      mode: true,
      status: true,
      generationRunId: true,
      input: true,
      preview: true,
      error: true,
      errorCode: true,
      recommendedAction: true,
      committedAt: true,
      committedStoreId: true,
      committedUserId: true,
      ownerUserId: true,
      guestSessionId: true,
      ipHash: true,
      userAgent: true,
    },
  });

  if (!draft) {
    return null;
  }

  // Check expiry
  if (new Date() > draft.expiresAt && draft.status !== 'committed') {
    await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'failed',
      actorType: 'automation',
      correlationId: draft.generationRunId,
      reason: 'EXPIRE',
      extraData: {
        error: 'Draft expired',
        errorCode: DraftErrorCode.DRAFT_EXPIRED,
        recommendedAction: RecommendedAction.startOver,
      },
    });
    draft.status = 'failed';
    draft.errorCode = DraftErrorCode.DRAFT_EXPIRED;
    draft.recommendedAction = RecommendedAction.startOver;
  }

  return draft;
}

const DRAFT_LOOKUP_LIMIT = 500;

/**
 * Get draft store by generationRunId (first-class lookup for MI job run).
 * Never throw; return null on error. No status filter. Match strictly input.generationRunId.
 * 1) Try column generationRunId (O(1)) when present.
 * 2) Fallback: scan last 500 by createdAt, match input.generationRunId so newly created drafts are never missed.
 */
export async function getDraftByGenerationRunId(generationRunId) {
  if (!generationRunId || typeof generationRunId !== 'string') return null;
  try {
    const byColumn = await prisma.draftStore.findFirst({
      where: { generationRunId },
    });
    if (byColumn) {
      const draft = await getDraft(byColumn.id).catch(() => null);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[getDraftByGenerationRunId]', { generationRunId, scanned: 1, found: !!draft, id: draft?.id ?? null, status: draft?.status ?? null });
      }
      return draft;
    }
  } catch (_) {
    // fall through to scan fallback
  }
  let drafts = [];
  try {
    drafts = await prisma.draftStore.findMany({
      orderBy: { createdAt: 'desc' },
      take: DRAFT_LOOKUP_LIMIT,
    });
  } catch (_) {
    return null;
  }
  const inputGenId = (d) => (d.input && typeof d.input === 'object' ? d.input.generationRunId : null);
  const picked = drafts.find((d) => inputGenId(d) === generationRunId) || null;
  const draft = picked ? (await getDraft(picked.id).catch(() => null)) : null;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[getDraftByGenerationRunId]', { generationRunId, scanned: drafts.length, found: !!draft, id: draft?.id ?? null, status: draft?.status ?? null });
  }
  return draft;
}

/**
 * Patch draft preview (items, categories, store meta). Used to persist user edits before publish.
 * Merges incoming preview with existing; only overwrites provided top-level keys.
 * When you pass { items }, preview.items is replaced entirely (preserves stable ids item_${draftId}_${index});
 * other preview fields (storeName, categories, brandColors, etc.) are kept.
 */
/** After commit, only Class A manual edits are allowed; full catalog edits stay blocked. */
/** Hero/avatar media (preview panel + profile uploads). */
const COMMITTED_PREVIEW_PATCH_KEYS = new Set([
  'hero',
  'heroImageUrl',
  'heroVideo',
  'heroVideoUrl',
  'heroMediaType',
  'heroPosterUrl',
  'heroPoster',
  'avatar',
  'avatarImageUrl',
]);

/** Logo upload patches (buildLogoPreviewPatchFromUrl). */
const COMMITTED_LOGO_PATCH_KEYS = new Set(['brand', 'meta', 'store', 'avatarUrl']);

/** Manual business profile text/contact fields (dashboard PATCH /api/stores/:id). */
const COMMITTED_BUSINESS_PROFILE_PATCH_KEYS = new Set([
  'storeName',
  'name',
  'tagline',
  'slogan',
  'description',
  'phone',
  'email',
  'contactEmail',
  'address',
  'suburb',
  'postcode',
  'country',
]);

/** True when incoming patch only touches post-commit editable hero/avatar/logo/profile fields. */
export function isCommittedHeroAvatarOnlyPatch(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  const keys = Object.keys(incoming);
  if (!keys.length) return false;
  return keys.every(
    (k) =>
      COMMITTED_PREVIEW_PATCH_KEYS.has(k) ||
      COMMITTED_LOGO_PATCH_KEYS.has(k) ||
      COMMITTED_BUSINESS_PROFILE_PATCH_KEYS.has(k),
  );
}

function parseStylePreferencesBlob(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Sync committed draft hero/avatar edits to Business + published projection (/s/:slug reads projection first).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {{ id: string; committedStoreId?: string | null; ownerUserId?: string | null; generationRunId?: string | null }} draft
 * @param {object} mergedPreview
 */
async function syncCommittedHeroAvatarToPublishedStore(prismaClient, draft, mergedPreview) {
  const businessId = draft.committedStoreId != null ? String(draft.committedStoreId).trim() : '';
  if (!businessId) return;

  const existing = await prismaClient.business.findUnique({
    where: { id: businessId },
    select: { stylePreferences: true, userId: true, publishedAt: true, isActive: true },
  });
  if (!existing) return;

  const isLivePublished = existing.publishedAt != null && existing.isActive === true;

  if (!isLivePublished) {
    const prefs = parseStylePreferencesBlob(existing.stylePreferences);
    const miniWebsite =
      mergedPreview?.stylePreferences?.miniWebsite ??
      mergedPreview?.website ??
      prefs.miniWebsite ??
      null;
    const { readCanonicalHeroFromPreview } = await import('./draftPreviewHeroSync.js');
    const { heroImage, heroVideo } = readCanonicalHeroFromPreview(mergedPreview);
    const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i;
    const heroColumnUrl = heroVideo
      ? heroImage && !VIDEO_EXT.test(heroImage)
        ? heroImage
        : heroVideo
      : heroImage || null;

    const stylePreferences = {
      ...prefs,
      ...(miniWebsite ? { miniWebsite } : {}),
      ...(heroVideo
        ? {
            heroVideo,
            ...(heroImage && !VIDEO_EXT.test(heroImage) ? { heroImage } : {}),
          }
        : heroImage
          ? { heroImage }
          : {}),
    };

    await prismaClient.business.update({
      where: { id: businessId },
      data: {
        ...(heroColumnUrl ? { heroImageUrl: heroColumnUrl } : {}),
        stylePreferences,
        updatedAt: new Date(),
      },
    });

    try {
      const { buildPersistAndApplyPublishedProjection } = await import(
        '../publishedArtifactProjection/publishProjectionHooks.js'
      );
      const freshDraft = await getDraft(draft.id);
      await buildPersistAndApplyPublishedProjection(prismaClient, {
        businessId,
        tenantId: draft.ownerUserId ?? existing.userId ?? null,
        draft: freshDraft,
        draftPreview: mergedPreview,
        publishRunId: draft.id,
        source: 'hero_avatar_patch',
      });
    } catch (projErr) {
      console.warn('[patchDraftPreview] published projection refresh failed (non-fatal):', projErr?.message || projErr);
    }
  }

  try {
    const { refreshPublishSnapshotFromCurrentPreview, isPublishSnapshotV1Enabled } = await import(
      './publishSnapshotService.js'
    );
    if (isPublishSnapshotV1Enabled()) {
      await refreshPublishSnapshotFromCurrentPreview(prismaClient, draft.id);
    }
  } catch (snapErr) {
    console.warn('[patchDraftPreview] publish snapshot sync failed (non-fatal):', snapErr?.message || snapErr);
  }
}

/**
 * Tier-2 store-build QA runs after publish/commit; catalog patches need a short edit window.
 * Temporarily sets committed → ready, runs fn, then restores status (direct update — not in transition rules).
 * @param {string} draftId
 * @param {() => Promise<void>} fn
 */
export async function runWithCommittedDraftReopenedForCatalogPatch(draftId, fn) {
  const id = String(draftId || '').trim();
  if (!id) throw new Error('draftId is required');
  const draft = await prisma.draftStore.findUnique({
    where: { id },
    select: { status: true, expiresAt: true },
  });
  if (!draft) throw new Error(`Draft not found: ${id}`);
  const priorStatus = draft.status;
  const wasCommitted = priorStatus === 'committed';
  if (wasCommitted) {
    const reopenData = { status: 'ready' };
    if (draft.expiresAt && new Date() > draft.expiresAt) {
      reopenData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    await runCriticalSqliteWriteWithP1008Retry(
      () =>
        prisma.draftStore.update({
          where: { id },
          data: reopenData,
        }),
      { label: 'draftStore.reopenForCatalogPatch' },
    );
  }
  try {
    await fn();
  } finally {
    if (wasCommitted) {
      await runCriticalSqliteWriteWithP1008Retry(
        () =>
          prisma.draftStore.update({
            where: { id },
            data: { status: priorStatus },
          }),
        { label: 'draftStore.restoreAfterCatalogPatch' },
      );
    }
  }
}

export async function patchDraftPreview(draftId, incomingPreview, options = {}) {
  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  let incoming = incomingPreview && typeof incomingPreview === 'object' ? incomingPreview : {};
  const allowCommitted = options && options.allowCommitted === true;
  const isCommitted = draft.status === 'committed';
  const committedHeroAvatarOnly = isCommitted && isCommittedHeroAvatarOnlyPatch(incoming);

  if (isCommitted && !allowCommitted && !committedHeroAvatarOnly) {
    const err = new Error(
      `Draft ${draftId} has already been committed. Create a new draft or use hero/avatar edits only.`,
    );
    err.statusCode = 409;
    err.code = 'draft_already_committed';
    throw err;
  }

  if (!isCommitted && new Date() > draft.expiresAt) {
    throw new Error(`Draft ${draftId} has expired`);
  }

  let existing = {};
  if (draft.preview && typeof draft.preview === 'object') {
    existing = { ...draft.preview };
  } else if (typeof draft.preview === 'string') {
    try {
      existing = JSON.parse(draft.preview) || {};
    } catch (_) { /* keep empty */ }
  }

  const heroPatchKeys = [
    'hero',
    'heroImageUrl',
    'heroVideo',
    'heroVideoUrl',
    'heroMediaType',
    'heroPosterUrl',
    'heroPoster',
  ];
  if (heroPatchKeys.some((k) => incoming[k] !== undefined)) {
    incoming = normalizeHeroPreviewPatchForStorage(incoming);
    const { incoming: safeIncoming } = protectVideoHeroFromImageOnlyOverwrite(existing, incoming, {
      writer: options.heroWriteIntent || options.writer || 'patchDraftPreview',
      draftId,
      storeId: options.storeId ?? draft.committedStoreId ?? null,
      allowReplaceVideoWithImage: options.allowReplaceVideoWithImage,
      heroWriteIntent: options.heroWriteIntent,
    });
    incoming = safeIncoming;
  }

  const merged = { ...existing, ...incoming };

  // When client sends partial items (e.g. Day2 autofill only filled items with imageUrl), merge by id
  // so we don't replace the entire catalog with a subset and lose other products/fields.
  const existingItems = Array.isArray(existing.items) ? existing.items : [];
  const incomingItems = Array.isArray(incoming.items) ? incoming.items : [];
  const looksLikeImageOnlyItemPatch = (it) => {
    if (!it || typeof it !== 'object') return false;
    // If any non-image catalog fields are present, treat as a full replacement payload.
    if (it.name !== undefined) return false;
    if (it.title !== undefined) return false;
    if (it.description !== undefined) return false;
    if (it.price !== undefined) return false;
    if (it.currency !== undefined) return false;
    if (it.category !== undefined) return false;
    if (it.categoryId !== undefined) return false;
    return (
      it.imageUrl !== undefined ||
      it.imageSource !== undefined ||
      it.imageQuery !== undefined ||
      it.imageConfidence !== undefined
    );
  };
  const isPartialItemUpdate =
    incomingItems.length > 0 &&
    existingItems.length > 0 &&
    incomingItems.every((it) => looksLikeImageOnlyItemPatch(it));
  if (isPartialItemUpdate) {
    const incomingById = new Map(incomingItems.map((it) => [String(it?.id ?? it?.productId ?? ''), it]));
    merged.items = existingItems.map((item) => {
      const id = String(item?.id ?? item?.productId ?? '');
      const patch = incomingById.get(id);
      if (!patch) return item;
      const out = { ...item };
      if (patch.imageUrl !== undefined) out.imageUrl = patch.imageUrl;
      if (patch.imageSource !== undefined) out.imageSource = patch.imageSource;
      if (patch.imageQuery !== undefined) out.imageQuery = patch.imageQuery;
      if (patch.imageConfidence !== undefined) out.imageConfidence = patch.imageConfidence;
      return out;
    });
  }

  // Regression guard: preserve hero/avatar when patching only items/categories (don't overwrite with undefined)
  if (merged.hero === undefined && existing.hero != null) merged.hero = existing.hero;
  if (merged.avatar === undefined && existing.avatar != null) merged.avatar = existing.avatar;
  // Mini-website draft: mirror hero image/video into website.sections hero so preview + publish stay aligned.
  if (
    incoming.hero !== undefined ||
    incoming.heroImageUrl !== undefined ||
    incoming.heroVideo !== undefined ||
    incoming.heroVideoUrl !== undefined
  ) {
    syncHeroFieldsIntoPreviewWebsite(merged);
    normalizeHeroFieldsInPreview(merged);
  }
  if (merged.brand == null && existing.brand != null) merged.brand = existing.brand;
  else if (merged.brand != null && existing.brand != null && typeof merged.brand === 'object' && typeof existing.brand === 'object') {
    merged.brand = { ...existing.brand, ...merged.brand };
  }
  // Normalize: ensure items array exists (backend publish reads items or catalog.products)
  if (Array.isArray(merged.items) && !merged.catalog) {
    merged.catalog = { products: merged.items, categories: merged.categories || [] };
  }
  if (Array.isArray(merged.catalog?.products) && !merged.items) {
    merged.items = merged.catalog.products;
  }

  normalizePreviewCategories(merged);

  // Full catalog replacement (e.g. menu upload) assigns new item ids; website.sections.featured.productIds
  // still pointed at old ids → storefront FeaturedSection resolves zero products and hides. Regenerate sections
  // from current items (same helper as initial draft website build). Skip partial image-only patches — ids unchanged.
  if (incoming.items !== undefined && !isPartialItemUpdate) {
    try {
      const { mergeWebsiteIntoPreview } = await import('./websiteSectionsGenerator.js');
      const input =
        draft.input && typeof draft.input === 'object' && !Array.isArray(draft.input) ? draft.input : {};
      mergeWebsiteIntoPreview(merged, input);
    } catch (e) {
      console.warn('[patchDraftPreview] mergeWebsiteIntoPreview failed (non-fatal):', e?.message || e);
    }
  }

  // Phase 0: recompute qaReport only when items/hero/avatar/catalog changed (avoid noisy QA on storeName typos)
  const qaRelevant =
    incoming.items !== undefined ||
    incoming.hero !== undefined ||
    incoming.avatar !== undefined ||
    incoming.catalog !== undefined;
  if (qaRelevant) {
    const { runDraftQa } = await import('../qa/draftQaAgent.js');
    const qaReport = runDraftQa({ preview: merged, input: draft.input });
    merged.meta = { ...(merged.meta || {}), qaReport };
  } else {
    merged.meta = { ...(merged.meta || {}), qaReport: existing.meta?.qaReport ?? merged.meta?.qaReport };
  }

  // Debug: log what preview we're saving (hero/avatar so we can confirm PATCH persists them)
  if (process.env.NODE_ENV === 'development' || process.env.LOG_DRAFT_PREVIEW === '1') {
    const mergedKeys = Object.keys(merged);
    const heroSet = !!(merged.hero?.imageUrl ?? merged.heroImageUrl ?? merged.hero?.url);
    const avatarSet = !!(merged.avatar?.imageUrl ?? merged.avatarImageUrl ?? merged.brand?.logoUrl);
    console.log('[patchDraftPreview] saving preview', { draftId, mergedKeys, heroSet, avatarSet });
  }

  if (committedHeroAvatarOnly && draft.committedStoreId) {
    const committedBusiness = await prisma.business.findUnique({
      where: { id: draft.committedStoreId },
      select: { publishedAt: true, isActive: true, stylePreferences: true },
    });
    const isLivePublished =
      committedBusiness?.publishedAt != null && committedBusiness?.isActive === true;

    const bizData = {};
    let heroVideoUrl = null;
    if (!isLivePublished && (incoming.hero !== undefined || incoming.heroImageUrl !== undefined || incoming.heroVideo !== undefined)) {
      let heroUrl = null;
      if (typeof merged.heroImageUrl === 'string' && merged.heroImageUrl.trim()) heroUrl = merged.heroImageUrl.trim();
      else if (merged.hero && typeof merged.hero === 'object') {
        const h = merged.hero;
        const fromHero = h.imageUrl ?? h.url;
        if (typeof fromHero === 'string' && fromHero.trim()) heroUrl = fromHero.trim();
        if (h.type === 'video') {
          const vid = h.videoUrl ?? h.url;
          if (typeof vid === 'string' && vid.trim()) heroVideoUrl = vid.trim();
        }
      }
      if (typeof merged.heroVideo === 'string' && merged.heroVideo.trim()) heroVideoUrl = merged.heroVideo.trim();
      if (heroUrl) bizData.heroImageUrl = heroUrl;
    }
    if (!isLivePublished && (incoming.avatar !== undefined || incoming.avatarImageUrl !== undefined)) {
      let avUrl = null;
      if (typeof merged.avatarImageUrl === 'string' && merged.avatarImageUrl.trim()) avUrl = merged.avatarImageUrl.trim();
      else if (merged.avatar && typeof merged.avatar === 'object') {
        const a = merged.avatar.imageUrl ?? merged.avatar.url;
        if (typeof a === 'string' && a.trim()) avUrl = a.trim();
      }
      if (avUrl) bizData.avatarImageUrl = avUrl;
    }
    if (!isLivePublished && (Object.keys(bizData).length > 0 || heroVideoUrl)) {
      if (heroVideoUrl) {
        let prefs = {};
        const raw = committedBusiness?.stylePreferences;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) prefs = { ...raw };
        else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prefs = parsed;
          } catch {
            /* ignore */
          }
        }
        bizData.stylePreferences = { ...prefs, heroVideo: heroVideoUrl };
      }
      await prisma.business.update({
        where: { id: draft.committedStoreId },
        data: bizData,
      });
    }
    const meta =
      merged.meta && typeof merged.meta === 'object' && !Array.isArray(merged.meta)
        ? { ...merged.meta }
        : {};
    if (isLivePublished) {
      meta.hasUnpublishedHeroChanges = true;
      meta.previewDirtyAt = new Date().toISOString();
    }
    merged.meta = meta;

    await prisma.draftStore.update({
      where: { id: draftId },
      data: { preview: merged, updatedAt: new Date() },
    });
    await syncCommittedHeroAvatarToPublishedStore(prisma, draft, merged);
    return getDraft(draftId);
  }

  const newStatus = draft.status === 'generating' ? draft.status : 'ready';
  if (newStatus === 'ready') {
    const transition = await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'ready',
      actorType: 'automation',
      correlationId: draft.generationRunId,
      reason: 'PATCH_PREVIEW',
      extraData: { preview: merged },
    });
    // When the transition is applied (e.g. draft/generating -> ready) it already persists
    // `preview: merged` via extraData. A second update here would write the (large) preview
    // blob again back-to-back, which trips SQLite's single-writer socket timeout (P1008).
    // Only persist separately when the transition was a no-op (e.g. ready->ready is not an
    // allowed transition) so the draft.preview column still reflects the patch.
    if (!transition?.ok) {
      await runCriticalSqliteWriteWithP1008Retry(
        () =>
          prisma.draftStore.update({
            where: { id: draftId },
            data: { preview: merged, updatedAt: new Date() },
          }),
        { label: 'draftStore.patchPreviewFallback' },
      );
    }
  } else {
    await runCriticalSqliteWriteWithP1008Retry(
      () =>
        prisma.draftStore.update({
          where: { id: draftId },
          data: { preview: merged, updatedAt: new Date() },
        }),
      { label: 'draftStore.patchPreviewGenerating' },
    );
  }

  try {
    const { refreshPublishSnapshotFromCurrentPreview, isPublishSnapshotV1Enabled } = await import(
      './publishSnapshotService.js'
    );
    if (isPublishSnapshotV1Enabled()) {
      await refreshPublishSnapshotFromCurrentPreview(prisma, draftId);
    }
  } catch (snapErr) {
    console.warn('[patchDraftPreview] publish snapshot sync failed (non-fatal):', snapErr?.message || snapErr);
  }

  return getDraft(draftId);
}

const MIN_ITEMS_AFTER_REPAIR = 5;

/**
 * Repair catalog: remove items whose titles match fashion/template keywords (template leakage).
 * Only removes; does not add. If removal leaves fewer than MIN_ITEMS_AFTER_REPAIR, returns needRegeneration.
 * Logs action in qaReport.issues.
 *
 * @param {string} draftId
 * @returns {{ ok: boolean, removedCount?: number, remainingCount?: number, needRegeneration?: boolean, draft?: object }}
 */
export async function repairCatalog(draftId) {
  const { FASHION_KEYWORDS } = await import('../qa/draftQaAgent.js');
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  if (draft.status === 'committed') throw new Error(`Draft ${draftId} has already been committed`);

  const preview = typeof draft.preview === 'object' ? draft.preview : (typeof draft.preview === 'string' ? JSON.parse(draft.preview || '{}') : {});
  const items = Array.isArray(preview.items) ? [...preview.items] : (Array.isArray(preview.catalog?.products) ? [...preview.catalog.products] : []);
  const kept = items.filter((it) => !FASHION_KEYWORDS.test(it?.name || ''));
  const removedCount = items.length - kept.length;

  if (removedCount === 0) {
    return { ok: true, removedCount: 0, remainingCount: items.length, draft: await getDraft(draftId) };
  }

  if (kept.length < MIN_ITEMS_AFTER_REPAIR) {
    return {
      ok: false,
      needRegeneration: true,
      removedCount,
      remainingCount: kept.length,
      message: `Removing template items would leave only ${kept.length} items. Add OCR upload or template selection to regenerate.`,
    };
  }

  const { categories, items: itemsWithCat } = recomputeDraftCategoriesFromItems(kept);
  const existingMeta = preview.meta && typeof preview.meta === 'object' ? { ...preview.meta } : {};
  await patchDraftPreview(draftId, {
    items: itemsWithCat,
    categories,
    meta: { ...existingMeta, repairCatalogAt: new Date().toISOString(), repairCatalogRemoved: removedCount },
  });
  return { ok: true, removedCount, remainingCount: kept.length, draft: await getDraft(draftId) };
}

/**
 * Detect store image/catalog mismatch: count products that would be removed by repairCatalog (template/fashion keywords).
 * Read-only; does not mutate. Used by Store UI to show "X product image mismatches" and one-click fix.
 *
 * @param {object} prisma - Prisma client
 * @param {string} storeId - Business id
 * @param {string|null} [generationRunId] - Optional; passed to resolveDraftForStore
 * @returns {Promise<{ hasIssue: boolean, affectedCount: number }>}
 */
export async function detectStoreImageMismatch(prisma, storeId, generationRunId = null) {
  const { resolveDraftForStore } = await import('../../lib/draftResolver.js');
  const { FASHION_KEYWORDS } = await import('../../services/qa/draftQaAgent.js');
  const resolved = await resolveDraftForStore(prisma, storeId, generationRunId);
  if (resolved.status !== 'ready' || !resolved.draft) {
    return { hasIssue: false, affectedCount: 0 };
  }
  const preview = typeof resolved.draft.preview === 'object'
    ? resolved.draft.preview
    : (typeof resolved.draft.preview === 'string' ? JSON.parse(resolved.draft.preview || '{}') : {});
  const items = Array.isArray(preview.items) ? preview.items : (Array.isArray(preview.catalog?.products) ? preview.catalog.products : []);
  const affectedCount = items.filter((it) => FASHION_KEYWORDS.test(it?.name || '')).length;
  return { hasIssue: affectedCount > 0, affectedCount };
}

/**
 * Recompute draft.preview.categories from current items (group by product.category / categoryName).
 * Returns { categories: [{ id, name }], items } with each item.categoryId set.
 * Used by auto-categorize endpoint; does not persist — caller must patchDraftPreview.
 */
export function recomputeDraftCategoriesFromItems(items) {
  return recomputeCategoriesFromItemsImpl(items);
}

/**
 * Auto-categorize: recompute categories from draft items and persist to draft.preview.
 * Resolves draft by draftId. Returns updated draft.
 */
export async function autoCategorizeDraft(draftId) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  if (draft.status === 'committed') throw new Error(`Draft ${draftId} has already been committed`);
  const preview = typeof draft.preview === 'object' ? draft.preview : (typeof draft.preview === 'string' ? JSON.parse(draft.preview || '{}') : {});
  const items = Array.isArray(preview.items) ? preview.items : (Array.isArray(preview.catalog?.products) ? preview.catalog.products : []);
  const storeType = preview.storeType || preview.store?.type || '';
  let categories;
  let itemsWithCategoryId;
  if (isFoodBusiness(storeType)) {
    const menuResult = getMenuCategoriesAndAssignments(items, storeType);
    categories = menuResult.categories;
    itemsWithCategoryId = menuResult.items;
  } else {
    const result = recomputeDraftCategoriesFromItems(items);
    categories = result.categories;
    itemsWithCategoryId = result.items;
  }
  await patchDraftPreview(draftId, { categories, items: itemsWithCategoryId });
  return getDraft(draftId);
}

/**
 * Commit draft store to real store with user account.
 * @param {string} draftId
 * @param {{ userId?: string, email?: string, password?: string, name?: string, acceptTerms: boolean, businessFields?: object }} options
 * - When userId is provided: use existing user (auth flow); email/password/name ignored.
 * - When userId is not provided: create user from email/password/name (legacy flow).
 */
export async function commitDraft(draftId, { userId: existingUserId, email, password, name, acceptTerms, businessFields = {} }) {
  const { warnLegacyPublishBypass } = await import('./publishRunway.js');
  warnLegacyPublishBypass('draftStoreService.commitDraft', {
    draftId,
    hint: 'Use publishDraft() for canonical projection + homepage/slug parity',
  });

  if (!acceptTerms) {
    throw new Error('Terms of service must be accepted');
  }

  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  // Handle abandoned drafts
  if (draft.status === 'abandoned') {
    throw new Error(`Draft ${draftId} has been abandoned and cannot be committed`);
  }

  // Idempotent: if already committed, return existing data
  if (draft.status === 'committed') {
    if (!draft.committedStoreId || !draft.committedUserId) {
      throw new Error(`Draft ${draftId} is marked committed but missing store/user IDs`);
    }
    
    // Fetch existing business and user
    const business = await prisma.business.findUnique({
      where: { id: draft.committedStoreId },
    });
    
    if (!business) {
      throw new Error(`Committed store ${draft.committedStoreId} not found`);
    }
    
    // Generate token for existing user
    const token = generateToken(draft.committedUserId);
    
    console.log(`[DraftStore] Draft ${draftId} already committed, returning existing data`);
    
    return {
      ok: true,
      userId: draft.committedUserId,
      businessId: business.id,
      storeId: business.id,
      storeSlug: business.slug,
      itemsCreated: 0, // Don't know how many were created originally
      token,
      redirectTo: `/app/back`, // Redirect to dashboard
      alreadyCommitted: true, // Flag for frontend
    };
  }

  // Only allow committing drafts in 'ready' status
  if (draft.status !== 'ready') {
    throw new Error(`Draft ${draftId} is not ready to commit (status: ${draft.status}). Draft must be in 'ready' status.`);
  }

  // Check expiry
  if (new Date() > draft.expiresAt) {
    throw new Error(`Draft ${draftId} has expired`);
  }

  if (!draft.preview) {
    throw new Error(`Draft ${draftId} has no preview data`);
  }

  const preview = parseDraftJsonField(draft.preview);
  const draftInputForCommit = parseDraftJsonField(draft.input);
  const previewMetaForCommit = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  const rawCommitCurrency =
    draftInputForCommit.currencyCode ??
    draftInputForCommit.currency ??
    previewMetaForCommit.currencyCode ??
    null;
  const normalizedCommitCurrency =
    rawCommitCurrency != null && String(rawCommitCurrency).trim()
      ? String(rawCommitCurrency).trim().toUpperCase()
      : null;
  const commitProductCurrency =
    normalizedCommitCurrency ||
    inferCurrencyFromLocationText(draftInputForCommit.location || '') ||
    'AUD';

  let user;
  if (existingUserId) {
    user = await prisma.user.findUnique({ where: { id: existingUserId } });
    if (!user) {
      throw new Error('Authenticated user not found');
    }
  } else {
    if (!email || !password) {
      throw new Error('Email and password are required when not authenticated');
    }
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new Error('An account with this email already exists. Please log in instead.');
    }
  }

  // Prepare business data from draft
  const businessName = businessFields.name || preview.storeName || name || preview.storeName || 'My Business';
  const businessType = businessFields.type || preview.storeType || 'generic';
  const meta = preview.meta || {};
  const commitHeroUrl = meta.profileHeroUrl ?? (preview.hero && (preview.hero.imageUrl ?? preview.hero.url)) ?? preview.heroImageUrl ?? null;
  const commitAvatarUrl = meta.profileAvatarUrl ?? meta.logo ?? (preview.avatar && (preview.avatar.imageUrl ?? preview.avatar.url)) ?? preview.avatarImageUrl ?? (preview.brand && preview.brand.logoUrl) ?? null;
  const resolvedCommitAvatar = commitAvatarUrl == null ? null : typeof commitAvatarUrl === 'string' ? commitAvatarUrl : (commitAvatarUrl?.url ?? commitAvatarUrl?.imageUrl ?? null);

  const commitItems =
    Array.isArray(preview.items) && preview.items.length > 0
      ? preview.items
      : Array.isArray(preview.catalog?.products)
        ? preview.catalog.products
        : [];

  if (commitItems.length === 0) {
    throw new Error(
      `COMMIT_DRAFT_FAILED: Draft ${draftId} has no catalog items in preview; refusing to clear store products`,
    );
  }

  const {
    CommitDraftStageTimer,
    logOversizedPreviewIfNeeded,
    prepareCatalogProductRows,
    replaceStoreCatalogInBatches,
    rollbackPartialCatalogWrites,
  } = await import('./stagedCatalogPublish.js');
  const { getPrismaInteractiveTransactionOptions } = await import('../../lib/prismaTransactionOptions.js');

  const stageTimer = new CommitDraftStageTimer();
  logOversizedPreviewIfNeeded(preview, draftId);

  const commitCategoryMap = buildCategoryIdToNameMap(preview.categories ?? []);
  const otherCategoryName = commitCategoryMap.get('other') ?? 'Other';

  const phaseAStart = Date.now();
  const { rows: preparedRows, preparedCount, skippedCount } = prepareCatalogProductRows(commitItems, {
    categoryMap: commitCategoryMap,
    otherCategoryName,
    defaultCurrency: commitProductCurrency,
    businessType: preview.storeType ?? preview.meta?.storeType ?? null,
    businessName: preview.storeName ?? preview.name ?? null,
  });
  stageTimer.log('phase_a_prepare_catalog', {
    itemCount: preparedCount,
    durationMs: Date.now() - phaseAStart,
    skippedCount,
    sourceItemCount: commitItems.length,
    draftId,
  });

  if (preparedCount === 0) {
    throw new Error(
      `COMMIT_DRAFT_FAILED: Draft ${draftId} has no valid catalog items after normalization`,
    );
  }

  const txOpts = getPrismaInteractiveTransactionOptions();
  let result;
  let shellBusinessId = null;
  try {
    const shellStart = Date.now();
    stageTimer.beginTransaction();
    const commitLogCtx = (await import('./commitDraftBusinessResolve.js')).resolveCommitLogContext(
      businessFields,
      draft,
    );
    const {
      isCommitBusinessRetryableError,
      logCommitDraftStructured,
      preflightBusinessCommitPlan,
      executeBusinessCommitPlan,
    } = await import('./commitDraftBusinessResolve.js');

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.$transaction(
        async (tx) =>
          tx.user.create({
            data: {
              email: email.toLowerCase().trim(),
              passwordHash: hashedPassword,
              displayName: name || preview.storeName || 'User',
              hasBusiness: true,
              onboarding: JSON.stringify({
                completed: false,
                currentStep: 'welcome',
                steps: { welcome: false, profile: false, business: true },
              }),
            },
          }),
        txOpts,
      );
    }

    const publishedAtCommit = new Date();
    const businessPayload = {
      name: businessName,
      type: businessType,
      description: preview.heroText || preview.description || null,
      primaryColor: preview.brandColors?.primary || businessFields.primaryColor || '#6C4CF1',
      secondaryColor: preview.brandColors?.secondary || null,
      tagline: preview.tagline || preview.slogan || null,
      heroText: preview.heroText || null,
      stylePreferences: preview.stylePreferences ? JSON.stringify(preview.stylePreferences) : null,
      heroImageUrl: commitHeroUrl || null,
      avatarImageUrl: resolvedCommitAvatar || null,
      publishedAt: publishedAtCommit,
      isActive: true,
    };

    const { resolveStoreWriteMode, isMultiStoreIdentityV1Enabled } = await import('../store/storeIdentity.js');
    const targetStoreId =
      businessFields?.targetStoreId ??
      businessFields?.existingStoreId ??
      draft.committedStoreId ??
      null;
    const writeMode = isMultiStoreIdentityV1Enabled()
      ? resolveStoreWriteMode({ draft, targetStoreId })
      : { mode: 'legacy', storeId: null, reason: 'legacy_singleton' };

    const businessResolveCtx = {
      prismaClient: prisma,
      user,
      draft,
      businessPayload,
      businessName,
      businessFields: { ...businessFields, userId: user.id },
      writeMode,
      generateUniqueStoreSlugForTx,
    };

    let shell = null;
    let lastShellErr = null;
    for (let shellAttempt = 0; shellAttempt < 2; shellAttempt++) {
      try {
        const shellPlan = await preflightBusinessCommitPlan(prisma, {
          ...businessResolveCtx,
          preflightOptions: {
            preferOwnedBusiness: shellAttempt > 0,
            forceRegenerateSlug: shellAttempt > 0,
          },
        });

        shell = await prisma.$transaction(async (tx) => {
          const business = await executeBusinessCommitPlan(tx, shellPlan, businessResolveCtx);
          return { user, business };
        }, txOpts);

        await prisma.product.deleteMany({ where: { businessId: shell.business.id } });
        lastShellErr = null;
        break;
      } catch (shellErr) {
        lastShellErr = shellErr;
        const retryable = shellAttempt === 0 && isCommitBusinessRetryableError(shellErr);
        logCommitDraftStructured('shell_transaction_failed', {
          ...commitLogCtx,
          userId: existingUserId ?? draft?.ownerUserId ?? user?.id ?? null,
          draftStoreId: draftId,
          firstFailureCode: shellErr?.code ?? null,
          attempt: shellAttempt + 1,
          retryable,
          message: shellErr?.message ?? String(shellErr),
        });
        if (!retryable) throw shellErr;
      }
    }
    if (!shell) throw lastShellErr ?? new Error('COMMIT_DRAFT_FAILED: shell transaction did not complete');
    stageTimer.log('phase_b_catalog_shell', {
      itemCount: preparedCount,
      durationMs: Date.now() - shellStart,
      transactionOpenMs: stageTimer.endTransaction(),
      draftId,
    });

    shellBusinessId = shell.business.id;
    const batchStart = Date.now();
    let batchResult;
    try {
      batchResult = await replaceStoreCatalogInBatches(prisma, {
        businessId: shell.business.id,
        rows: preparedRows,
        timer: stageTimer,
        draftId,
      });
    } catch (batchErr) {
      await rollbackPartialCatalogWrites(prisma, shell.business.id, {
        draftId,
        reason: batchErr?.message || 'catalog_batch_failed',
      });
      throw batchErr;
    }
    stageTimer.log('phase_c_catalog_batches', {
      itemCount: batchResult.written,
      durationMs: Date.now() - batchStart,
      writeAmplification: batchResult.writeAmplification,
      draftId,
    });

    const finalizeStart = Date.now();
    const transitionResult = await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'committed',
      fromStatus: 'ready',
      actorType: 'human',
      actorId: shell.user.id,
      reason: 'PUBLISH',
      extraData: {
        committedAt: new Date(),
        committedStoreId: shell.business.id,
        committedUserId: shell.user.id,
      },
    });
    if (!transitionResult.ok) {
      throw new Error(
        transitionResult.message || `COMMIT_DRAFT_FAILED: draft transition ${transitionResult.code ?? 'failed'}`,
      );
    }
    stageTimer.log('phase_d_finalize_draft', {
      itemCount: batchResult.written,
      durationMs: Date.now() - finalizeStart,
      draftId,
    });

    result = {
      user: shell.user,
      business: shell.business,
      itemsCreated: batchResult.written,
    };
  } catch (err) {
    if (shellBusinessId) {
      await rollbackPartialCatalogWrites(prisma, shellBusinessId, {
        draftId,
        reason: err?.message || 'commit_finalize_failed',
      }).catch(() => {});
    }
    if (err?.code === 'P2002' || err?.code === '25P02') {
      const { isCommitBusinessRetryableError, isSlugUniqueViolation } = await import(
        './commitDraftBusinessResolve.js'
      );
      const uid = existingUserId ?? draft?.ownerUserId;
      console.error('[commitDraft] Unrecovered identity conflict after shell retry:', {
        code: err?.code,
        target: err?.meta?.target,
        userId: uid,
        draftId: draft?.id,
        retryableKind: isCommitBusinessRetryableError(err) ? 'identity' : 'unknown',
        slugConflict: isSlugUniqueViolation(err),
      });
      const friendly = new Error(
        isSlugUniqueViolation(err)
          ? "We couldn't finish creating your store because this store address is already taken. Please try again."
          : 'We updated your existing store profile instead of creating a duplicate. Please try again.',
      );
      friendly.code = isSlugUniqueViolation(err) ? 'STORE_SLUG_TAKEN' : 'STORE_BUSINESS_CONFLICT';
      throw friendly;
    }
    const { logCommitDraftStructured, resolveCommitLogContext } = await import('./commitDraftBusinessResolve.js');
    logCommitDraftStructured('commit_failed', {
      ...resolveCommitLogContext(businessFields, draft),
      draftStoreId: draftId,
      userId: existingUserId ?? draft?.ownerUserId ?? null,
      firstFailureCode: err?.code ?? null,
      message: err?.message ?? String(err),
    });
    console.error('[commitDraft] Transaction failed:', err);
    throw err;
  }

  // Generate JWT token for the new user
  const token = generateToken(result.user.id);

  console.log(`[DraftStore] Commit done for draft ${draftId}: storeId=${result.business.id}, userId=${result.user.id}, itemsCreated=${result.itemsCreated}`);

  try {
    const { normalizeMissionOwnershipForUser } = await import('../../lib/missionOwnership.js');
    const { resolveCommitLogContext } = await import('./commitDraftBusinessResolve.js');
    const missionId = resolveCommitLogContext(businessFields, draft).missionId;
    if (missionId && result.user?.id) {
      await normalizeMissionOwnershipForUser(prisma, missionId, result.user.id, {
        user: result.user,
        tenantId: result.business?.id ?? result.user.id,
      });
    }
  } catch (ownErr) {
    console.warn('[commitDraft] mission ownership normalize failed (non-fatal):', ownErr?.message || ownErr);
  }

  return {
    ok: true,
    userId: result.user.id,
    businessId: result.business.id,
    storeId: result.business.id, // Alias for backward compatibility
    storeSlug: result.business.slug,
    itemsCreated: result.itemsCreated,
    token, // JWT token for immediate login
    redirectTo: `/app/back`, // Redirect to dashboard (store management)
  };
}


/**
 * Core: Business Discovery / Import Studio is deprecated as an SME-facing UI.
 * Explicit legacy Studio phrases map into the Live Performer store-creation runway
 * (compact form → MissionPipeline → DraftStore → StoreDraftReview → publish).
 * Never invents empty drafts; never sets autoSubmit; never navigates to
 * /app/business-import-studio.
 */

import {
  buildStoreCreationDraft,
} from './storeCreationDraft.js';

/** Deprecated SPA path — must never be returned as navigateTo. */
export const DEPRECATED_BUSINESS_IMPORT_STUDIO_PATH = '/app/business-import-studio';

/**
 * @param {string} raw
 */
export function normalizeDiscoveryIntentText(raw) {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Explicit Advanced Discovery / legacy Studio open phrases only.
 * Generic “Create a store…” must NOT match — that is the Live Store Mission path.
 * @param {string} userMessage
 */
export function isExplicitOpenBusinessDiscoveryIntent(userMessage) {
  const normalized = normalizeDiscoveryIntentText(userMessage);
  if (!normalized) return false;

  if (
    normalized === 'open business discovery' ||
    normalized === 'open business discovery studio' ||
    normalized === 'open business import studio' ||
    normalized === 'open the business discovery studio' ||
    normalized === 'open the business import studio' ||
    normalized === 'business import studio' ||
    normalized === 'business discovery studio' ||
    normalized === 'advanced review' ||
    normalized === 'how cardbey built this'
  ) {
    return true;
  }

  // Soft aliases that still mean “open the old Studio product”
  if (
    /\b(open|launch|show|use)\b.*\b(business\s+)?(import|discovery)\s+studio\b/.test(normalized) ||
    normalized === 'import studio' ||
    normalized === 'discovery studio'
  ) {
    return true;
  }

  return false;
}

/**
 * @deprecated Prefer isExplicitOpenBusinessDiscoveryIntent for routing.
 * @param {string} userMessage
 */
export function isStartBusinessDiscoveryIntent(userMessage) {
  return isExplicitOpenBusinessDiscoveryIntent(userMessage);
}

/**
 * True when a navigateTo / href targets the deprecated Studio SPA.
 * @param {unknown} navigateTo
 */
export function isDeprecatedBusinessImportStudioNavigateTo(navigateTo) {
  if (typeof navigateTo !== 'string') return false;
  const path = navigateTo.split('?')[0].trim();
  return (
    path === DEPRECATED_BUSINESS_IMPORT_STUDIO_PATH ||
    path.startsWith(`${DEPRECATED_BUSINESS_IMPORT_STUDIO_PATH}/`)
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export function hasValidBusinessCreationSources(body) {
  const form =
    body?.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
      ? body.storeCreateForm
      : null;
  const formName = String(form?.storeName ?? form?.businessName ?? form?.name ?? '').trim();
  if (formName) return true;

  const draft = body?.storeCreationDraft;
  if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
    const d = /** @type {Record<string, unknown>} */ (draft);
    const nested = d.draft && typeof d.draft === 'object' ? /** @type {Record<string, unknown>} */ (d.draft) : d;
    if (String(nested.name ?? nested.businessName ?? '').trim()) return true;
    if (String(nested.category ?? nested.storeType ?? '').trim() && String(nested.location ?? '').trim()) {
      return true;
    }
  }

  if (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.trim().length > 32) return true;
  if (Array.isArray(body?.attachments) && body.attachments.length > 0) return true;

  const discovery = body?.discovery;
  if (discovery && typeof discovery === 'object') {
    const text = discovery.textProfile;
    if (text && typeof text === 'object' && Object.values(text).some((v) => String(v || '').trim())) {
      return true;
    }
    if (Array.isArray(discovery.images) && discovery.images.length > 0) return true;
    if (String(discovery.voiceTranscript || '').trim()) return true;
    if (Array.isArray(discovery.links) && discovery.links.length > 0) return true;
  }

  return false;
}

/**
 * @param {Record<string, unknown>} body
 */
export function isEmptyStoreCreationDraft(body) {
  const draft = body?.storeCreationDraft;
  if (!draft || typeof draft !== 'object') return false;
  const d = /** @type {Record<string, unknown>} */ (draft);
  const nested = d.draft && typeof d.draft === 'object' ? /** @type {Record<string, unknown>} */ (d.draft) : d;
  const name = String(nested.name ?? nested.businessName ?? '').trim();
  const category = String(nested.category ?? nested.storeType ?? '').trim();
  const location = String(nested.location ?? '').trim();
  return !name && !category && !location;
}

/**
 * Build StoreDraftReview URL for an existing draft (canonical review surface).
 * @param {{ draftId: string, missionId?: string | null, jobId?: string | null, generationRunId?: string | null }} opts
 */
export function buildPerformerDraftReviewHref(opts) {
  const draftId = String(opts.draftId ?? '').trim();
  if (!draftId) return null;
  const storeSegment = 'draft';
  const search = new URLSearchParams();
  search.set('mode', 'draft');
  search.set('draftId', draftId);
  if (opts.missionId) search.set('missionId', String(opts.missionId).trim());
  if (opts.jobId) search.set('jobId', String(opts.jobId).trim());
  if (opts.generationRunId) search.set('generationRunId', String(opts.generationRunId).trim());
  return `/app/store/${storeSegment}/review?${search.toString()}`;
}

/**
 * Compatibility handoff formerly used to open Business Import Studio.
 * Now maps to Performer Live create_store / draft resume — never Studio SPA.
 *
 * @param {{
 *   conversationSessionId?: string | null;
 *   performerMissionId?: string | null;
 *   entrySource?: string;
 *   userMessage?: string | null;
 *   draftId?: string | null;
 *   jobId?: string | null;
 *   generationRunId?: string | null;
 *   storeId?: string | null;
 *   spaceId?: string | null;
 *   requestId?: string | null;
 * }} opts
 */
export function buildOpenBusinessDiscoveryResponse(opts = {}) {
  const handoff = {
    entrySource: opts.entrySource || 'performer',
    requestedIntent: 'create_business',
    conversationSessionId: opts.conversationSessionId || null,
    performerMissionId: opts.performerMissionId || null,
    legacyStudioCompat: true,
  };

  const draftId = String(opts.draftId ?? '').trim() || null;
  const missionId = String(opts.performerMissionId ?? '').trim() || null;
  const jobId = String(opts.jobId ?? '').trim() || null;
  const generationRunId = String(opts.generationRunId ?? '').trim() || null;
  const storeId = String(opts.storeId ?? '').trim() || null;

  const reviewHref = draftId
    ? buildPerformerDraftReviewHref({
        draftId,
        missionId,
        jobId,
        generationRunId,
      })
    : null;

  // Existing draft → resume / open review (no duplicate create_store mission)
  if (draftId || missionId) {
    return {
      success: true,
      action: 'resume_active_mission',
      intent: 'resume_business_setup',
      autoSubmit: false,
      stayInChat: true,
      missionId: missionId || undefined,
      draftId: draftId || undefined,
      jobId: jobId || undefined,
      generationRunId: generationRunId || undefined,
      storeId: storeId || undefined,
      spaceId: opts.spaceId || undefined,
      requestId: opts.requestId || undefined,
      reviewHref: reviewHref || undefined,
      // Prefer existing StoreDraftReview over any Studio URL
      navigateTo: reviewHref || undefined,
      response:
        'Business setup is now handled here in Performer. I found an existing draft — continuing from there instead of starting a new import.',
      discoveryHandoff: handoff,
      legacyAction: 'open_business_discovery_studio',
      followUpChips: ['Review draft', 'What can you do?'],
    };
  }

  const storeCreationDraft = buildStoreCreationDraft({
    userMessage: opts.userMessage || 'Set up my business',
    classification: {
      tool: 'create_store',
      confidence: 1,
      parameters: {
        intentMode: 'store',
        source: 'legacy_studio_compat_performer',
        _autoSubmit: false,
      },
    },
  });

  return {
    success: true,
    action: 'create_store',
    intent: 'create_store',
    intentMode: storeCreationDraft.intentMode,
    storeCreationDraft,
    missingFields: storeCreationDraft.missingFields,
    autoSubmit: false,
    stayInChat: true,
    // Explicitly omit Studio navigation (do not set navigateTo to deprecated path)
    navigateTo: undefined,
    response:
      'Business setup is now handled here in Performer. Let’s import or update your business — share a name, location, website, or menu and I’ll prepare a draft.',
    discoveryHandoff: handoff,
    legacyAction: 'open_business_discovery_studio',
    executionPath: 'direct_action',
    spaceId: opts.spaceId || undefined,
    requestId: opts.requestId || undefined,
    storeId: storeId || undefined,
    followUpChips: ['Create store', 'What can you do?'],
  };
}

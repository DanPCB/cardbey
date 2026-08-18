/**
 * Cardbey Live Market — Phase 1 domain contracts (provider-neutral).
 * Pure lifecycle + subject rules. No Prisma, no HTTP, no production media providers.
 */

/** @typedef {'INVITED'|'APPROVED'|'ONBOARDING'|'ACTIVE'|'PAUSED'|'REMOVED'} EnrollmentState */
/** @typedef {'DRAFT'|'SCHEDULED'|'READY'|'CONNECTING'|'LIVE'|'ENDING'|'ENDED'|'PROCESSING'|'REPLAY_READY'|'FAILED'|'CANCELLED'} SessionState */
/** @typedef {'PRODUCT'|'SERVICE'} SubjectType */

export const LIVE_MARKET_ERROR_CODES = Object.freeze({
  LIVE_MARKET_DISABLED: 'LIVE_MARKET_DISABLED',
  LIVE_STORE_NOT_ENROLLED: 'LIVE_STORE_NOT_ENROLLED',
  LIVE_ENROLLMENT_NOT_ACTIVE: 'LIVE_ENROLLMENT_NOT_ACTIVE',
  LIVE_HOST_NOT_AUTHORIZED: 'LIVE_HOST_NOT_AUTHORIZED',
  LIVE_SESSION_NOT_FOUND: 'LIVE_SESSION_NOT_FOUND',
  LIVE_INVALID_TRANSITION: 'LIVE_INVALID_TRANSITION',
  LIVE_SUBJECT_NOT_FOUND: 'LIVE_SUBJECT_NOT_FOUND',
  LIVE_SUBJECT_STORE_MISMATCH: 'LIVE_SUBJECT_STORE_MISMATCH',
  LIVE_SUBJECT_TYPE_MISMATCH: 'LIVE_SUBJECT_TYPE_MISMATCH',
  LIVE_SUBJECT_INVALID: 'LIVE_SUBJECT_INVALID',
  LIVE_PROVIDER_NOT_CONFIGURED: 'LIVE_PROVIDER_NOT_CONFIGURED',
  LIVE_PROVIDER_UNAVAILABLE: 'LIVE_PROVIDER_UNAVAILABLE',
  LIVE_PROVIDER_PREPARE_FAILED: 'LIVE_PROVIDER_PREPARE_FAILED',
  LIVE_PROVIDER_RESOURCE_NOT_FOUND: 'LIVE_PROVIDER_RESOURCE_NOT_FOUND',
  LIVE_PROVIDER_EVENT_INVALID: 'LIVE_PROVIDER_EVENT_INVALID',
  LIVE_BROADCAST_CREDENTIALS_DENIED: 'LIVE_BROADCAST_CREDENTIALS_DENIED',
  LIVE_STOREFRONT_PUBLISH_DENIED: 'LIVE_STOREFRONT_PUBLISH_DENIED',
  LIVE_STOREFRONT_NOT_PUBLISHED: 'LIVE_STOREFRONT_NOT_PUBLISHED',
  LIVE_REGISTRATION_DISABLED: 'LIVE_REGISTRATION_DISABLED',
  LIVE_REGISTRATION_CLOSED: 'LIVE_REGISTRATION_CLOSED',
  LIVE_REGISTRATION_AUTH_REQUIRED: 'LIVE_REGISTRATION_AUTH_REQUIRED',
  LIVE_REGISTRATION_NOT_FOUND: 'LIVE_REGISTRATION_NOT_FOUND',
  LIVE_REGISTRATION_LANGUAGE_INVALID: 'LIVE_REGISTRATION_LANGUAGE_INVALID',
  LIVE_REGISTRATION_INTEREST_INVALID: 'LIVE_REGISTRATION_INTEREST_INVALID',
  LIVE_HOST_PARTICIPANTS_DISABLED: 'LIVE_HOST_PARTICIPANTS_DISABLED',
  LIVE_QUESTION_REVIEW_INVALID: 'LIVE_QUESTION_REVIEW_INVALID',
  LIVE_STORE_UNAVAILABLE: 'LIVE_STORE_UNAVAILABLE',
});

export const ENROLLMENT_STATES = Object.freeze([
  'INVITED',
  'APPROVED',
  'ONBOARDING',
  'ACTIVE',
  'PAUSED',
  'REMOVED',
]);

export const SESSION_STATES = Object.freeze([
  'DRAFT',
  'SCHEDULED',
  'READY',
  'CONNECTING',
  'LIVE',
  'ENDING',
  'ENDED',
  'PROCESSING',
  'REPLAY_READY',
  'FAILED',
  'CANCELLED',
]);

export const SUBJECT_TYPES = Object.freeze(['PRODUCT', 'SERVICE']);

export const INITIAL_LANGUAGE_PAIR = Object.freeze(['vi', 'en']);

/**
 * Retention / replay groundwork (enforcement deferred until recordings/messages exist).
 * Cleanup job ownership: core Live Market ops worker (Phase 7+); must be idempotent + retryable.
 * Failure case: if Cardbey-controlled replay copy has not succeeded before raw expiry, do not
 * delete provider raw until copy succeeds or an explicit ops override is recorded.
 */
export const LIVE_MARKET_RETENTION = Object.freeze({
  rawProviderRecordingHours: 24,
  publicLiveChatHours: 24,
  automaticReplayPublicationDefault: true,
  replayMustCopyBeforeRawDeletion: true,
  privateConversationPolicy: 'cardbey_conversation_policy',
  cleanupJobOwner: 'live_market_ops_worker',
  cleanupIdempotent: true,
  cleanupRetryRequired: true,
});

/**
 * Provider usage metric seam for later cost telemetry (no invented rates).
 */
export const LIVE_MARKET_USAGE_METRICS = Object.freeze([
  'broadcast_input_minutes',
  'viewer_delivery_minutes',
  'recording_storage_minutes',
  'transcription_audio_minutes',
  'translated_characters_or_tokens',
  'target_language_count',
]);

/** Audit action reason codes for AuditEvent.reason / metadata. */
export const LIVE_MARKET_AUDIT_REASONS = Object.freeze({
  ENROLLMENT_TRANSITION: 'LIVE_ENROLLMENT_TRANSITION',
  SESSION_CREATED: 'LIVE_SESSION_CREATED',
  SESSION_UPDATED: 'LIVE_SESSION_UPDATED',
  SESSION_TRANSITION: 'LIVE_SESSION_TRANSITION',
  SESSION_CANCELLED: 'LIVE_SESSION_CANCELLED',
  SUBJECTS_SET: 'LIVE_SUBJECTS_SET',
  PROVIDER_PREPARE_BLOCKED: 'LIVE_PROVIDER_PREPARE_BLOCKED',
  PROVIDER_START_BLOCKED: 'LIVE_PROVIDER_START_BLOCKED',
  STOREFRONT_PUBLISHED: 'LIVE_SESSION_STOREFRONT_PUBLISHED',
  STOREFRONT_UPDATED: 'LIVE_SESSION_STOREFRONT_UPDATED',
  STOREFRONT_WITHDRAWN: 'LIVE_SESSION_STOREFRONT_WITHDRAWN',
  PARTICIPANT_REGISTERED: 'LIVE_PARTICIPANT_REGISTERED',
  PARTICIPANT_REGISTRATION_CANCELLED: 'LIVE_PARTICIPANT_REGISTRATION_CANCELLED',
  PARTICIPANT_QUESTION_REVIEW_CHANGED: 'LIVE_PARTICIPANT_QUESTION_REVIEW_CHANGED',
  LIVE_BROADCAST_PREPARED: 'LIVE_BROADCAST_PREPARED',
  LIVE_BROADCAST_CREDENTIALS_ISSUED: 'LIVE_BROADCAST_CREDENTIALS_ISSUED',
  LIVE_BROADCAST_START_INTENT: 'LIVE_BROADCAST_START_INTENT',
  LIVE_PROVIDER_CONNECTED: 'LIVE_PROVIDER_CONNECTED',
  LIVE_PROVIDER_DISCONNECTED: 'LIVE_PROVIDER_DISCONNECTED',
  LIVE_PROVIDER_ERROR: 'LIVE_PROVIDER_ERROR',
  LIVE_BROADCAST_ENDED: 'LIVE_BROADCAST_ENDED',
  LIVE_PROVIDER_RECONCILED: 'LIVE_PROVIDER_RECONCILED',
});

/** Expand secret key matcher for RTMPS credentials in audit metadata. */
export const LIVE_MARKET_AUDIT_SECRET_KEY_RE =
  /(access[_-]?token|refresh[_-]?token|secret|password|authorization|bearer|api[_-]?key|providerExternalRef|webhook|stream[_-]?key|rtmps|whip)/i;

/** Audience registration status — attendance states reserved until truthful. */
export const LIVE_REGISTRATION_STATUS = Object.freeze({
  REGISTERED: 'REGISTERED',
  CANCELLED: 'CANCELLED',
});

/** Host question inbox review states (Batch A). */
export const LIVE_QUESTION_REVIEW_STATUS = Object.freeze({
  NEW: 'NEW',
  REVIEWED: 'REVIEWED',
  PLANNED: 'PLANNED',
  ANSWERED: 'ANSWERED',
  DISMISSED: 'DISMISSED',
});

/**
 * Allowed question-review transitions (Batch A).
 * Same-state updates are idempotent at the service layer (not listed here).
 */
export const QUESTION_REVIEW_TRANSITIONS = Object.freeze({
  NEW: Object.freeze(['REVIEWED', 'PLANNED', 'DISMISSED']),
  REVIEWED: Object.freeze(['PLANNED', 'ANSWERED', 'DISMISSED']),
  PLANNED: Object.freeze(['REVIEWED', 'ANSWERED', 'DISMISSED']),
  ANSWERED: Object.freeze(['REVIEWED']),
  DISMISSED: Object.freeze(['REVIEWED']),
});

export const LIVE_PARTICIPANT_TYPE = Object.freeze({
  ACCOUNT: 'ACCOUNT',
  GUEST: 'GUEST',
});

/**
 * Provider-neutral reminder/event seam names (no delivery in this slice).
 */
export const LIVE_REGISTRATION_REMINDER_EVENTS = Object.freeze([
  'LIVE_REGISTRATION_CREATED',
  'LIVE_SESSION_STARTING_SOON',
  'LIVE_SESSION_PROVIDER_CONFIRMED',
  'LIVE_SESSION_SCHEDULE_CHANGED',
  'LIVE_SESSION_CANCELLED',
]);

/** Editorial storefront publication — independent of media lifecycle / LIVE. */
export const STOREFRONT_PUBLICATION_STATUS = Object.freeze({
  HIDDEN: 'HIDDEN',
  PUBLISHED: 'PUBLISHED',
  WITHDRAWN: 'WITHDRAWN',
});

/** Audience-facing normalized states (not stored session enums). */
export const PUBLIC_STOREFRONT_LIVE_STATE = Object.freeze({
  UPCOMING: 'upcoming',
  WAITING_FOR_HOST: 'waiting_for_host',
  LIVE: 'live',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
  UNAVAILABLE: 'unavailable',
});

/**
 * Enrollment transitions (forward + operational pause/resume).
 * REMOVED is terminal.
 */
const ENROLLMENT_TRANSITIONS = Object.freeze({
  INVITED: Object.freeze(['APPROVED', 'REMOVED']),
  APPROVED: Object.freeze(['ONBOARDING', 'REMOVED']),
  ONBOARDING: Object.freeze(['ACTIVE', 'PAUSED', 'REMOVED']),
  ACTIVE: Object.freeze(['PAUSED', 'REMOVED']),
  PAUSED: Object.freeze(['ACTIVE', 'REMOVED']),
  REMOVED: Object.freeze([]),
});

/**
 * RTMPS pilot session graph.
 * READY = prepared (Live Input created). CONNECTING = start-intent only.
 * LIVE only via authenticated provider connection evidence or reconciliation — never owner click.
 * PROCESSING = replay processing (recording deferred).
 */
const SESSION_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['SCHEDULED', 'CANCELLED']),
  SCHEDULED: Object.freeze(['READY', 'CANCELLED']),
  READY: Object.freeze(['CONNECTING', 'CANCELLED']),
  CONNECTING: Object.freeze(['LIVE', 'ENDING', 'FAILED', 'CANCELLED', 'READY']),
  LIVE: Object.freeze(['ENDING', 'ENDED', 'FAILED']),
  ENDING: Object.freeze(['ENDED', 'FAILED']),
  ENDED: Object.freeze(['PROCESSING', 'FAILED']),
  PROCESSING: Object.freeze(['REPLAY_READY', 'FAILED']),
  REPLAY_READY: Object.freeze([]),
  FAILED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

/** Public playback DTO states (never include provider secrets). */
export const PUBLIC_PLAYBACK_STATE = Object.freeze({
  WAITING: 'WAITING',
  CONNECTING: 'CONNECTING',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  REPLAY_PROCESSING: 'REPLAY_PROCESSING',
  REPLAY_READY: 'REPLAY_READY',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * @param {string} code
 * @param {string} [message]
 * @param {Record<string, unknown>} [details]
 */
export function liveMarketError(code, message, details = undefined) {
  const err = new Error(message || code);
  err.code = code;
  err.ok = false;
  if (details && typeof details === 'object') err.details = details;
  return err;
}

/**
 * @param {EnrollmentState|string} from
 * @param {EnrollmentState|string} to
 */
export function canTransitionEnrollment(from, to) {
  const allowed = ENROLLMENT_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * @param {EnrollmentState|string} from
 * @param {EnrollmentState|string} to
 * @returns {{ ok: true, from: string, to: string } | { ok: false, code: string, from: string, to: string }}
 */
export function assertEnrollmentTransition(from, to) {
  if (!ENROLLMENT_STATES.includes(from) || !ENROLLMENT_STATES.includes(to)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      from,
      to,
    };
  }
  if (!canTransitionEnrollment(from, to)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      from,
      to,
    };
  }
  return { ok: true, from, to };
}

/**
 * @param {SessionState|string} from
 * @param {SessionState|string} to
 */
export function canTransitionSession(from, to) {
  const allowed = SESSION_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * @param {SessionState|string} from
 * @param {SessionState|string} to
 */
export function assertSessionTransition(from, to) {
  if (!SESSION_STATES.includes(from) || !SESSION_STATES.includes(to)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      from,
      to,
    };
  }
  if (!canTransitionSession(from, to)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      from,
      to,
    };
  }
  return { ok: true, from, to };
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransitionQuestionReview(from, to) {
  const allowed = QUESTION_REVIEW_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function assertQuestionReviewTransition(from, to) {
  const fromStatus = String(from || '').toUpperCase();
  const toStatus = String(to || '').toUpperCase();
  if (
    !Object.values(LIVE_QUESTION_REVIEW_STATUS).includes(fromStatus) ||
    !Object.values(LIVE_QUESTION_REVIEW_STATUS).includes(toStatus)
  ) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_QUESTION_REVIEW_INVALID,
      from: fromStatus,
      to: toStatus,
    };
  }
  if (!canTransitionQuestionReview(fromStatus, toStatus)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_QUESTION_REVIEW_INVALID,
      from: fromStatus,
      to: toStatus,
    };
  }
  return { ok: true, from: fromStatus, to: toStatus };
}

/**
 * Host capability vs enrolment state (Phase 1 decision):
 * - ACTIVE: full draft/schedule/prepare/start/cancel (prepare/start still need provider)
 * - PAUSED: draft edit, subjects, cancel only; block schedule/prepare/start
 * - otherwise: no host session mutations
 *
 * @param {EnrollmentState|string|null|undefined} enrollmentState
 */
export function hostCapabilitiesForEnrollment(enrollmentState) {
  const state = String(enrollmentState || '');
  if (state === 'ACTIVE') {
    return {
      canCreateOrEditDraft: true,
      canSetSubjects: true,
      canSchedule: true,
      canPrepareOrStart: true,
      canCancel: true,
      canManageHostParticipants: true,
    };
  }
  if (state === 'PAUSED') {
    return {
      canCreateOrEditDraft: true,
      canSetSubjects: true,
      canSchedule: false,
      canPrepareOrStart: false,
      canCancel: true,
      canManageHostParticipants: true,
    };
  }
  return {
    canCreateOrEditDraft: false,
    canSetSubjects: false,
    canSchedule: false,
    canPrepareOrStart: false,
    canCancel: false,
    canManageHostParticipants: false,
  };
}

/** Bounded provider readiness for owner/admin status DTOs (no secrets). */
export const LIVE_PROVIDER_READINESS = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURED: 'CONFIGURED',
});

/**
 * Owner-facing operational capabilities derived from enrolment + provider readiness.
 * Prepare/start require ACTIVE enrolment capability AND a configured provider.
 * Streaming remains non-operational in Phase 1 regardless (see streamingOperational).
 *
 * @param {EnrollmentState|string|null|undefined} enrollmentState
 * @param {{ providerConfigured?: boolean }} [opts]
 */
export function ownerOperationalCapabilities(enrollmentState, opts = {}) {
  const base = hostCapabilitiesForEnrollment(enrollmentState);
  const providerConfigured = Boolean(opts.providerConfigured);
  const canDraft = Boolean(base.canCreateOrEditDraft);
  const canPrepareOrStart = Boolean(base.canPrepareOrStart) && providerConfigured;
  return {
    canCreateDraft: canDraft,
    canEditDraft: canDraft,
    canCancel: Boolean(base.canCancel),
    canSchedule: Boolean(base.canSchedule),
    canPrepare: canPrepareOrStart,
    canStart: canPrepareOrStart,
    /** Editorial publish — media provider not required. ACTIVE enrolment only. */
    canPublishStorefront: String(enrollmentState || '') === 'ACTIVE',
    /** Withdraw allowed for ACTIVE or PAUSED (safety). */
    canWithdrawStorefront:
      String(enrollmentState || '') === 'ACTIVE' || String(enrollmentState || '') === 'PAUSED',
    /** Batch A host participant workspace — ACTIVE or PAUSED; REMOVED blocked. */
    canManageHostParticipants: Boolean(base.canManageHostParticipants),
  };
}

function languagesFromEnrollmentField(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return [...INITIAL_LANGUAGE_PAIR];
}

/**
 * Sanitized owner Live Market status DTO (no actor IDs, audit, provider refs, or secrets).
 *
 * @param {{
 *   enabled: boolean,
 *   storeId: string,
 *   enrollment: null | {
 *     state?: string,
 *     allowedSourceLanguages?: unknown,
 *     allowedTargetLanguages?: unknown,
 *     automaticReplayPublication?: boolean,
 *     approvedByActorId?: unknown,
 *     pausedByActorId?: unknown,
 *     removedByActorId?: unknown,
 *     approvedHostUserIds?: unknown,
 *   },
 *   providerConfigured: boolean,
 * }} input
 */
export function toOwnerLiveMarketStatusDto(input) {
  const enrollment = input.enrollment || null;
  const enrolled = Boolean(enrollment);
  const enrollmentState = enrolled ? String(enrollment.state || '') : null;
  const providerConfigured = Boolean(input.providerConfigured);

  return {
    enabled: Boolean(input.enabled),
    storeId: String(input.storeId || ''),
    enrolled,
    enrollmentState,
    capabilities: ownerOperationalCapabilities(enrollmentState, { providerConfigured }),
    allowedSourceLanguages: languagesFromEnrollmentField(enrollment?.allowedSourceLanguages),
    allowedTargetLanguages: languagesFromEnrollmentField(enrollment?.allowedTargetLanguages),
    automaticReplayPublication:
      enrollment?.automaticReplayPublication !== undefined
        ? Boolean(enrollment.automaticReplayPublication)
        : LIVE_MARKET_RETENTION.automaticReplayPublicationDefault,
    retention: {
      rawProviderRecordingHours: LIVE_MARKET_RETENTION.rawProviderRecordingHours,
      publicLiveChatHours: LIVE_MARKET_RETENTION.publicLiveChatHours,
    },
    providerReadiness: providerConfigured
      ? LIVE_PROVIDER_READINESS.CONFIGURED
      : LIVE_PROVIDER_READINESS.NOT_CONFIGURED,
    /** Phase 1 contract: never claim operational streaming. */
    streamingOperational: false,
  };
}

/**
 * @param {EnrollmentState|string|null|undefined} enrollmentState
 * @param {'draft'|'subjects'|'schedule'|'prepare'|'start'|'cancel'|'publish_storefront'|'withdraw_storefront'|'host_participants'} action
 */
export function assertHostActionAllowed(enrollmentState, action) {
  const caps = hostCapabilitiesForEnrollment(enrollmentState);
  const ownerCaps = ownerOperationalCapabilities(enrollmentState, { providerConfigured: false });
  const map = {
    draft: caps.canCreateOrEditDraft,
    subjects: caps.canSetSubjects,
    schedule: caps.canSchedule,
    prepare: caps.canPrepareOrStart,
    start: caps.canPrepareOrStart,
    cancel: caps.canCancel,
    publish_storefront: ownerCaps.canPublishStorefront,
    withdraw_storefront: ownerCaps.canWithdrawStorefront,
    host_participants: caps.canManageHostParticipants,
  };
  if (!map[action]) {
    if (!enrollmentState || enrollmentState === 'REMOVED' || !ENROLLMENT_STATES.includes(String(enrollmentState))) {
      return {
        ok: false,
        code: enrollmentState
          ? LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE
          : LIVE_MARKET_ERROR_CODES.LIVE_STORE_NOT_ENROLLED,
      };
    }
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE };
  }
  return { ok: true };
}

/**
 * Catalog subject mapping (discovered):
 * - Authoritative row: prisma.Product (businessId = store id)
 * - Both commerce "products" and "services" persist as Product rows
 * - Runtime type comes from catalogItemClassification / serviceCatalogNormalizer
 *   (itemType 'product' | 'service' | …), not a separate Service table
 * - Live Market stores subjectType PRODUCT|SERVICE + subjectId (= Product.id)
 * - Do not copy price/title/description into Live Market
 *
 * @param {{
 *   subjectType: string,
 *   subjectId: string,
 *   storeId: string,
 *   product: null | {
 *     id: string,
 *     businessId: string,
 *     deletedAt?: Date | string | null,
 *     catalogItemType?: string | null,
 *   },
 * }} input
 */
export function validateSessionSubject(input) {
  const subjectType = String(input.subjectType || '').toUpperCase();
  const subjectId = String(input.subjectId || '').trim();
  const storeId = String(input.storeId || '').trim();

  if (!SUBJECT_TYPES.includes(subjectType)) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_INVALID,
      message: 'subjectType must be PRODUCT or SERVICE',
    };
  }
  if (!subjectId) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_INVALID,
      message: 'subjectId required',
    };
  }
  if (!storeId) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_INVALID,
      message: 'storeId required',
    };
  }

  const product = input.product;
  if (!product || product.id !== subjectId) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_NOT_FOUND };
  }
  if (product.businessId !== storeId) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_STORE_MISMATCH };
  }
  if (product.deletedAt) {
    return { ok: false, code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_NOT_FOUND };
  }

  const catalogType = String(product.catalogItemType || '')
    .toLowerCase()
    .trim();
  if (catalogType) {
    const isServiceLike =
      catalogType === 'service' ||
      catalogType === 'ticket' ||
      catalogType === 'event' ||
      catalogType === 'venue' ||
      catalogType === 'package';
    const isProductLike = catalogType === 'product';
    if (subjectType === 'SERVICE' && !isServiceLike) {
      return {
        ok: false,
        code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_TYPE_MISMATCH,
        message: `Product ${subjectId} catalogItemType=${catalogType} is not SERVICE-like`,
      };
    }
    if (subjectType === 'PRODUCT' && !isProductLike && isServiceLike) {
      return {
        ok: false,
        code: LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_TYPE_MISMATCH,
        message: `Product ${subjectId} catalogItemType=${catalogType} is not PRODUCT`,
      };
    }
  }

  return {
    ok: true,
    subjectType,
    subjectId,
    storeId,
  };
}

/**
 * Normalize a subject list: drop empties, dedupe by subjectType+subjectId, stable sortOrder.
 * Invalid entries are collected; callers may fail-closed on any invalid.
 *
 * @param {Array<{ subjectType?: string, subjectId?: string, sortOrder?: number }>} subjects
 */
export function normalizeSubjectInputs(subjects) {
  const list = Array.isArray(subjects) ? subjects : [];
  const seen = new Set();
  const normalized = [];
  const duplicates = [];
  const invalid = [];

  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i] || {};
    const subjectType = String(raw.subjectType || '').toUpperCase();
    const subjectId = String(raw.subjectId || '').trim();
    if (!SUBJECT_TYPES.includes(subjectType) || !subjectId) {
      invalid.push({ index: i, subjectType, subjectId });
      continue;
    }
    const key = `${subjectType}:${subjectId}`;
    if (seen.has(key)) {
      duplicates.push({ index: i, subjectType, subjectId });
      continue;
    }
    seen.add(key);
    normalized.push({
      subjectType,
      subjectId,
      sortOrder: Number.isFinite(raw.sortOrder) ? Number(raw.sortOrder) : normalized.length,
    });
  }

  return { normalized, duplicates, invalid };
}

/**
 * Lifecycle visibility candidates (still require storefrontPublicationStatus=PUBLISHED for storefront).
 * @param {SessionState|string} state
 */
export function isSessionPubliclyVisible(state) {
  return [
    'SCHEDULED',
    'READY',
    'CONNECTING',
    'LIVE',
    'ENDING',
    'ENDED',
    'PROCESSING',
    'REPLAY_READY',
  ].includes(String(state || ''));
}

/**
 * Canonical public playback DTO — never includes RTMPS, keys, tokens, or account ids.
 * @param {{
 *   session?: { id?: string, state?: string, startedAt?: Date|string|null, endedAt?: Date|string|null, storefrontPublicationStatus?: string|null } | null,
 *   providerConfirmedLive?: boolean,
 *   playerUrl?: string | null,
 *   videoId?: string | null,
 *   consumeEnabled?: boolean,
 * }} args
 */
export function toPublicPlaybackDto(args = {}) {
  const session = args.session || null;
  const published =
    normalizeStorefrontPublicationStatus(session?.storefrontPublicationStatus) ===
    STOREFRONT_PUBLICATION_STATUS.PUBLISHED;
  const consumeEnabled = args.consumeEnabled !== false;
  const providerConfirmedLive = Boolean(args.providerConfirmedLive);
  const state = String(session?.state || '');

  if (!session || !consumeEnabled || !published || state === 'CANCELLED' || state === 'FAILED') {
    return {
      state: PUBLIC_PLAYBACK_STATE.UNAVAILABLE,
      sessionId: session?.id ? String(session.id) : null,
      live: false,
      playerUrl: null,
      videoId: null,
      startedAt: null,
      endedAt: null,
      replayAvailable: false,
    };
  }

  if (state === 'CONNECTING') {
    return {
      state: PUBLIC_PLAYBACK_STATE.CONNECTING,
      sessionId: String(session.id),
      live: false,
      playerUrl: null,
      videoId: null,
      startedAt: null,
      endedAt: null,
      replayAvailable: false,
    };
  }

  if (state === 'LIVE' && providerConfirmedLive && args.playerUrl) {
    return {
      state: PUBLIC_PLAYBACK_STATE.LIVE,
      sessionId: String(session.id),
      live: true,
      playerUrl: String(args.playerUrl),
      videoId: args.videoId ? String(args.videoId) : null,
      startedAt: session.startedAt ?? null,
      endedAt: null,
      replayAvailable: false,
    };
  }

  if (state === 'PROCESSING') {
    return {
      state: PUBLIC_PLAYBACK_STATE.REPLAY_PROCESSING,
      sessionId: String(session.id),
      live: false,
      playerUrl: null,
      videoId: null,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt ?? null,
      replayAvailable: false,
    };
  }

  if (state === 'REPLAY_READY' && args.playerUrl) {
    return {
      state: PUBLIC_PLAYBACK_STATE.REPLAY_READY,
      sessionId: String(session.id),
      live: false,
      playerUrl: String(args.playerUrl),
      videoId: args.videoId ? String(args.videoId) : null,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt ?? null,
      replayAvailable: true,
    };
  }

  if (['ENDED', 'ENDING'].includes(state)) {
    return {
      state: PUBLIC_PLAYBACK_STATE.ENDED,
      sessionId: String(session.id),
      live: false,
      playerUrl: null,
      videoId: null,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt ?? null,
      replayAvailable: false,
    };
  }

  return {
    state: PUBLIC_PLAYBACK_STATE.WAITING,
    sessionId: String(session.id),
    live: false,
    playerUrl: null,
    videoId: null,
    startedAt: null,
    endedAt: null,
    replayAvailable: false,
  };
}

/**
 * @param {string | null | undefined} status
 */
export function normalizeStorefrontPublicationStatus(status) {
  const s = String(status || STOREFRONT_PUBLICATION_STATUS.HIDDEN).toUpperCase();
  if (s === STOREFRONT_PUBLICATION_STATUS.PUBLISHED) return STOREFRONT_PUBLICATION_STATUS.PUBLISHED;
  if (s === STOREFRONT_PUBLICATION_STATUS.WITHDRAWN) return STOREFRONT_PUBLICATION_STATUS.WITHDRAWN;
  return STOREFRONT_PUBLICATION_STATUS.HIDDEN;
}

/**
 * Eligibility to publish scheduled announcement (does not mark LIVE).
 * @param {{
 *   session: { state?: string, title?: string, scheduledStartAt?: Date|string|null, storefrontPublicationStatus?: string|null },
 *   enrollmentState?: string | null,
 *   now?: Date,
 * }} args
 */
export function assertCanPublishStorefront(args) {
  const session = args.session || {};
  const enrollmentState = String(args.enrollmentState || '');
  const now = args.now instanceof Date ? args.now : new Date();

  if (enrollmentState !== 'ACTIVE') {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE,
      message: 'Active pilot enrolment is required to publish to the storefront',
    };
  }
  if (!['SCHEDULED', 'READY', 'CONNECTING', 'LIVE'].includes(String(session.state || ''))) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_PUBLISH_DENIED,
      message: 'Only scheduled sessions can be published to the storefront',
    };
  }
  if (!String(session.title || '').trim()) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_PUBLISH_DENIED,
      message: 'Session title is required before publishing',
    };
  }
  const when = session.scheduledStartAt ? new Date(session.scheduledStartAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_PUBLISH_DENIED,
      message: 'A future schedule is required before publishing',
    };
  }
  if (when.getTime() <= now.getTime()) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_PUBLISH_DENIED,
      message: 'Schedule must be in the future to publish',
    };
  }
  if (
    normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus) ===
    STOREFRONT_PUBLICATION_STATUS.PUBLISHED
  ) {
    return {
      ok: false,
      code: LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_PUBLISH_DENIED,
      message: 'Session is already published to the storefront',
    };
  }
  return { ok: true };
}

/**
 * Normalized audience state. providerConfirmedLive must stay false until Slice B+.
 * Publication / schedule / clicks never independently produce LIVE.
 * @param {object} session
 * @param {{ now?: Date, providerConfirmedLive?: boolean }} [opts]
 */
export function normalizePublicStorefrontLiveState(session, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const providerConfirmedLive = Boolean(opts.providerConfirmedLive);
  const state = String(session?.state || '');
  if (state === 'CANCELLED') return PUBLIC_STOREFRONT_LIVE_STATE.CANCELLED;
  if (!opts.skipPublicationGate) {
    if (
      normalizeStorefrontPublicationStatus(session?.storefrontPublicationStatus) !==
      STOREFRONT_PUBLICATION_STATUS.PUBLISHED
    ) {
      return PUBLIC_STOREFRONT_LIVE_STATE.UNAVAILABLE;
    }
  }
  if (providerConfirmedLive && state === 'LIVE') return PUBLIC_STOREFRONT_LIVE_STATE.LIVE;
  if (['ENDED', 'PROCESSING', 'REPLAY_READY'].includes(state)) {
    return PUBLIC_STOREFRONT_LIVE_STATE.ENDED;
  }
  const when = session?.scheduledStartAt ? new Date(session.scheduledStartAt) : null;
  if (when && !Number.isNaN(when.getTime()) && when.getTime() <= now.getTime()) {
    return PUBLIC_STOREFRONT_LIVE_STATE.WAITING_FOR_HOST;
  }
  return PUBLIC_STOREFRONT_LIVE_STATE.UPCOMING;
}

/**
 * Priority for primary public session: LIVE > WAITING > nearest UPCOMING > ENDED.
 * @param {string} publicState
 */
export function publicLiveStatePriority(publicState) {
  switch (String(publicState || '')) {
    case PUBLIC_STOREFRONT_LIVE_STATE.LIVE:
      return 0;
    case PUBLIC_STOREFRONT_LIVE_STATE.WAITING_FOR_HOST:
      return 1;
    case PUBLIC_STOREFRONT_LIVE_STATE.UPCOMING:
      return 2;
    case PUBLIC_STOREFRONT_LIVE_STATE.ENDED:
      return 3;
    default:
      return 9;
  }
}

/**
 * Pick at most one primary published session for a store.
 * @param {object[]} sessions
 * @param {{ now?: Date, providerConfirmedLive?: boolean, enrollmentState?: string|null }} [opts]
 */
export function selectPrimaryPublishedSession(sessions, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const list = Array.isArray(sessions) ? sessions : [];
  const eligible = list.filter((s) =>
    isStorefrontPublishedSessionVisible(s, { enrollmentState: opts.enrollmentState }),
  );
  if (eligible.length === 0) return null;

  const decorated = eligible.map((session) => {
    const publicState = normalizePublicStorefrontLiveState(session, {
      now,
      providerConfirmedLive: opts.providerConfirmedLive,
    });
    const when = session.scheduledStartAt ? new Date(session.scheduledStartAt).getTime() : Number.POSITIVE_INFINITY;
    return { session, publicState, when, priority: publicLiveStatePriority(publicState) };
  });

  decorated.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    // For UPCOMING prefer nearest future; for others prefer most recent schedule
    if (a.priority === 2) return a.when - b.when;
    return b.when - a.when;
  });
  return decorated[0]?.session || null;
}

/**
 * Compact feed-card summary (no description / subjects / internals).
 * @param {object} session
 * @param {{ now?: Date, providerConfirmedLive?: boolean, displayTimezone?: string|null }} [opts]
 */
export function toPublicFeedLiveMarketSummary(session, opts = {}) {
  if (!session) return null;
  const publicState = normalizePublicStorefrontLiveState(session, {
    now: opts.now,
    providerConfirmedLive: opts.providerConfirmedLive,
  });
  if (
    publicState === PUBLIC_STOREFRONT_LIVE_STATE.UNAVAILABLE ||
    publicState === PUBLIC_STOREFRONT_LIVE_STATE.CANCELLED
  ) {
    return null;
  }
  return {
    sessionId: session.id,
    title: session.title,
    scheduledAt: session.scheduledStartAt ?? null,
    timezone: opts.displayTimezone || null,
    publicState,
  };
}

/**
 * Storefront card visibility — publication + lifecycle + enrolment.
 * @param {object} session
 * @param {{ enrollmentState?: string | null }} [opts]
 */
export function isStorefrontPublishedSessionVisible(session, opts = {}) {
  if (!session) return false;
  if (
    normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus) !==
    STOREFRONT_PUBLICATION_STATUS.PUBLISHED
  ) {
    return false;
  }
  if (!isSessionPubliclyVisible(session.state)) return false;
  if (String(session.state) === 'CANCELLED' || String(session.state) === 'FAILED') return false;
  const enrollmentState = opts.enrollmentState == null ? 'ACTIVE' : String(opts.enrollmentState);
  // Prefer hiding when pilot not active
  if (enrollmentState !== 'ACTIVE') return false;
  return true;
}

/**
 * Whether new audience registrations may be accepted for a published session.
 * Open for published upcoming / waiting / live; closed for withdrawn/cancelled/ended/unavailable.
 * Does not imply broadcasting is operational.
 * @param {object} session
 * @param {{
 *   now?: Date,
 *   enrollmentState?: string | null,
 *   providerConfirmedLive?: boolean,
 *   registrationFeatureEnabled?: boolean,
 * }} [opts]
 */
export function evaluateRegistrationAvailability(session, opts = {}) {
  if (!opts.registrationFeatureEnabled) {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED };
  }
  if (!session) {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND };
  }
  if (
    normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus) !==
    STOREFRONT_PUBLICATION_STATUS.PUBLISHED
  ) {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_CLOSED };
  }
  const state = String(session.state || '').toUpperCase();
  if (state === 'CANCELLED' || state === 'FAILED' || state === 'DRAFT') {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_CLOSED };
  }
  if (state === 'ENDED' || state === 'PROCESSING' || state === 'REPLAY_READY') {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_CLOSED };
  }
  const enrollmentState = opts.enrollmentState == null ? 'ACTIVE' : String(opts.enrollmentState);
  if (enrollmentState !== 'ACTIVE') {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE };
  }
  const publicState = normalizePublicStorefrontLiveState(session, {
    now: opts.now,
    providerConfirmedLive: opts.providerConfirmedLive,
  });
  if (
    publicState === PUBLIC_STOREFRONT_LIVE_STATE.UNAVAILABLE ||
    publicState === PUBLIC_STOREFRONT_LIVE_STATE.CANCELLED ||
    publicState === PUBLIC_STOREFRONT_LIVE_STATE.ENDED
  ) {
    return { available: false, code: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_CLOSED };
  }
  // upcoming | waiting_for_host | live — registration remains open
  return { available: true, code: null };
}

/**
 * Public registration block — no other participants, no contact data.
 * @param {{ available: boolean, currentUserStatus?: 'REGISTERED'|'NOT_REGISTERED'|null }} args
 */
export function toPublicRegistrationDto(args = {}) {
  const out = {
    available: Boolean(args.available),
    requiresAuthentication: true,
  };
  if (args.currentUserStatus === 'REGISTERED' || args.currentUserStatus === 'NOT_REGISTERED') {
    out.currentUserStatus = args.currentUserStatus;
  }
  return out;
}

/**
 * Build a public-safe session DTO shape (no provider refs, actor ids, audit, failure payloads).
 * Requires storefront publication unless opts.skipPublicationGate (legacy session-id tests).
 * @param {object} session
 * @param {{
 *   storeName?: string | null,
 *   storeSlug?: string | null,
 *   subjects?: Array<{ subjectType: string, subjectId: string, sortOrder: number, name?: string | null }>,
 *   enrollmentState?: string | null,
 *   displayTimezone?: string | null,
 *   providerConfirmedLive?: boolean,
 *   skipPublicationGate?: boolean,
 *   now?: Date,
 *   registration?: { available: boolean, currentUserStatus?: 'REGISTERED'|'NOT_REGISTERED'|null } | null,
 * }} [extras]
 */
export function toPublicLiveSessionDto(session, extras = {}) {
  if (!session) return null;
  if (!extras.skipPublicationGate) {
    if (!isStorefrontPublishedSessionVisible(session, { enrollmentState: extras.enrollmentState })) {
      return null;
    }
  } else if (!isSessionPubliclyVisible(session.state)) {
    return null;
  }

  const providerConfirmedLive = Boolean(extras.providerConfirmedLive);
  const dto = {
    id: session.id,
    sessionId: session.id,
    storeId: session.storeId,
    storeName: extras.storeName ?? undefined,
    storeSlug: extras.storeSlug ?? undefined,
    title: session.title,
    description: session.description ?? null,
    sourceLanguage: session.sourceLanguage,
    viewerLanguages: session.viewerLanguages ?? [],
    scheduledStartAt: session.scheduledStartAt ?? null,
    scheduledAt: session.scheduledStartAt ?? null,
    startedAt: session.startedAt ?? null,
    endedAt: session.endedAt ?? null,
    state: session.state,
    storefrontPublicationStatus: normalizeStorefrontPublicationStatus(
      session.storefrontPublicationStatus,
    ),
    displayTimezone: extras.displayTimezone || null,
    timezone: extras.displayTimezone || null,
    publicState: normalizePublicStorefrontLiveState(session, {
      now: extras.now,
      providerConfirmedLive,
      skipPublicationGate: extras.skipPublicationGate,
    }),
    /** Always false until provider-confirmed connection (Slice B+). */
    providerConfirmedLive,
    providerConnected: providerConfirmedLive,
    streamingOperational: false,
    subjects: Array.isArray(extras.subjects)
      ? extras.subjects.map((s) => ({
          subjectType: s.subjectType,
          subjectId: s.subjectId,
          sortOrder: s.sortOrder,
          name: s.name ?? undefined,
        }))
      : [],
    featuredSubjects: Array.isArray(extras.subjects)
      ? extras.subjects.map((s) => ({
          subjectType: s.subjectType,
          subjectId: s.subjectId,
          sortOrder: s.sortOrder,
          name: s.name ?? undefined,
        }))
      : [],
  };
  if (extras.registration) {
    dto.registration = toPublicRegistrationDto(extras.registration);
  }
  return dto;
}

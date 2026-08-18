/**
 * Live Market application service — enrolment + sessions + subjects.
 * Enforces domain transitions; provider-neutral prepare/start.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import {
  INITIAL_LANGUAGE_PAIR,
  LIVE_MARKET_AUDIT_REASONS,
  LIVE_MARKET_ERROR_CODES,
  LIVE_MARKET_RETENTION,
  STOREFRONT_PUBLICATION_STATUS,
  assertCanPublishStorefront,
  assertEnrollmentTransition,
  assertHostActionAllowed,
  assertSessionTransition,
  liveMarketError,
  normalizeStorefrontPublicationStatus,
  normalizeSubjectInputs,
  toOwnerLiveMarketStatusDto,
  toPublicLiveSessionDto,
  selectPrimaryPublishedSession,
  validateSessionSubject,
} from './domain.js';
import { appendLiveMarketAudit } from './audit.js';
import { resolveLiveVideoProvider, isOwnerCapabilityProviderReady } from './providers.js';
import { resolvePublicRegistrationBlock } from './registration.js';

function defaultLangJson() {
  return [...INITIAL_LANGUAGE_PAIR];
}

function fail(code, message, status = 400) {
  const err = liveMarketError(code, message);
  err.status = status;
  return err;
}

function asArray(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

/**
 * @param {import('@prisma/client').PrismaClient} [prisma]
 */
function client(prisma) {
  return prisma || getPrismaClient();
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function getEnrollmentForStore(prisma, storeId) {
  return client(prisma).liveMarketPilotEnrollment.findUnique({
    where: { storeId: String(storeId) },
  });
}

/**
 * Owner must own store AND enrolment must allow the action.
 * @param {{ prisma?: any, storeId: string, userId: string, action: 'draft'|'subjects'|'schedule'|'prepare'|'start'|'cancel' }} args
 */
/**
 * Ownership only — does not require pilot enrolment (used by status read).
 * @param {{ prisma?: any, storeId: string, userId: string }} args
 */
export async function assertStoreOwnerAccess(args) {
  const prisma = client(args.prisma);
  const storeId = String(args.storeId);
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true },
  });
  if (!store) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'store_not_found', 404);
  }
  if (store.userId !== args.userId) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_HOST_NOT_AUTHORIZED, 'forbidden', 403);
  }
  return { store };
}

export async function assertOwnerPilotAccess(args) {
  const prisma = client(args.prisma);
  const { store } = await assertStoreOwnerAccess({
    prisma,
    storeId: args.storeId,
    userId: args.userId,
  });
  const enrollment = await getEnrollmentForStore(prisma, args.storeId);
  if (!enrollment) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_STORE_NOT_ENROLLED, 'store not enrolled', 403);
  }
  const allowed = assertHostActionAllowed(enrollment.state, args.action);
  if (!allowed.ok) {
    throw fail(allowed.code, 'enrolment does not allow this action', 403);
  }
  return { store, enrollment };
}

/**
 * Owner Live Market status — requires ownership, not active enrolment.
 * @param {{ prisma?: any, storeId: string, userId: string, enabled?: boolean }} args
 */
export async function getOwnerLiveMarketStatus(args) {
  const prisma = client(args.prisma);
  const storeId = String(args.storeId);
  await assertStoreOwnerAccess({
    prisma,
    storeId,
    userId: args.userId,
  });
  const enrollment = await getEnrollmentForStore(prisma, storeId);
  const provider = resolveLiveVideoProvider();
  return toOwnerLiveMarketStatusDto({
    enabled: args.enabled !== false,
    storeId,
    enrollment,
    providerConfigured: isOwnerCapabilityProviderReady(provider),
  });
}

export async function listEnrollments({ prisma, state } = {}) {
  const where = state ? { state: String(state) } : {};
  return client(prisma).liveMarketPilotEnrollment.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { store: { select: { id: true, name: true, slug: true } } },
  });
}

/**
 * Create or invite a store into the pilot.
 */
export async function createEnrollment({
  prisma,
  storeId,
  actorId,
  state = 'INVITED',
  allowedSourceLanguages,
  allowedTargetLanguages,
  recordingAllowed,
  automaticReplayPublication,
  approvedHostUserIds,
  maxSessionDurationMinutes,
} = {}) {
  const db = client(prisma);
  const store = await db.business.findUnique({
    where: { id: String(storeId) },
    select: { id: true },
  });
  if (!store) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'store_not_found', 404);
  }
  const existing = await getEnrollmentForStore(db, storeId);
  if (existing) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION, 'enrolment already exists', 409);
  }
  const initial = ['INVITED', 'APPROVED', 'ONBOARDING', 'ACTIVE'].includes(state)
    ? state
    : 'INVITED';
  const row = await db.liveMarketPilotEnrollment.create({
    data: {
      storeId: String(storeId),
      state: initial,
      allowedSourceLanguages: allowedSourceLanguages ?? defaultLangJson(),
      allowedTargetLanguages: allowedTargetLanguages ?? defaultLangJson(),
      recordingAllowed: recordingAllowed !== false,
      automaticReplayPublication:
        automaticReplayPublication !== false
          ? LIVE_MARKET_RETENTION.automaticReplayPublicationDefault
          : false,
      approvedHostUserIds: approvedHostUserIds ?? null,
      maxSessionDurationMinutes: maxSessionDurationMinutes ?? null,
      approvedAt: initial === 'ACTIVE' || initial === 'APPROVED' ? new Date() : null,
      approvedByActorId:
        initial === 'ACTIVE' || initial === 'APPROVED' ? actorId ?? null : null,
    },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketPilotEnrollment',
    entityId: row.id,
    action: 'enrollment_created',
    fromStatus: null,
    toStatus: row.state,
    actorId,
    reason: LIVE_MARKET_AUDIT_REASONS.ENROLLMENT_TRANSITION,
    metadata: { storeId: row.storeId },
  });
  return row;
}

export async function transitionEnrollment({
  prisma,
  enrollmentId,
  toState,
  actorId,
} = {}) {
  const db = client(prisma);
  const row = await db.liveMarketPilotEnrollment.findUnique({
    where: { id: String(enrollmentId) },
  });
  if (!row) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'enrollment_not_found', 404);
  }
  const check = assertEnrollmentTransition(row.state, String(toState));
  if (!check.ok) {
    throw fail(check.code, `invalid enrolment transition ${row.state} → ${toState}`, 409);
  }
  const now = new Date();
  /** @type {Record<string, unknown>} */
  const data = { state: String(toState) };
  if (toState === 'APPROVED' || toState === 'ACTIVE') {
    data.approvedAt = row.approvedAt || now;
    data.approvedByActorId = actorId ?? row.approvedByActorId;
  }
  if (toState === 'PAUSED') {
    data.pausedAt = now;
    data.pausedByActorId = actorId ?? null;
  }
  if (toState === 'REMOVED') {
    data.removedAt = now;
    data.removedByActorId = actorId ?? null;
  }
  if (toState === 'ACTIVE' && row.state === 'PAUSED') {
    data.pausedAt = null;
    data.pausedByActorId = null;
  }
  const updated = await db.liveMarketPilotEnrollment.update({
    where: { id: row.id },
    data,
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketPilotEnrollment',
    entityId: row.id,
    action: 'enrollment_transition',
    fromStatus: row.state,
    toStatus: updated.state,
    actorId,
    reason: LIVE_MARKET_AUDIT_REASONS.ENROLLMENT_TRANSITION,
    metadata: { storeId: row.storeId },
  });
  return updated;
}

export async function createSession({
  prisma,
  storeId,
  hostUserId,
  title,
  description,
  sourceLanguage,
  viewerLanguages,
  recordingEnabled,
  automaticReplayPublication,
} = {}) {
  const db = client(prisma);
  const { enrollment } = await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'draft',
  });
  const session = await db.liveMarketSession.create({
    data: {
      storeId: String(storeId),
      hostUserId: String(hostUserId),
      title: String(title || '').trim() || 'Untitled live session',
      description: description ? String(description) : null,
      sourceLanguage: String(sourceLanguage || 'vi'),
      viewerLanguages: viewerLanguages ?? defaultLangJson(),
      state: 'DRAFT',
      recordingEnabled:
        recordingEnabled !== undefined ? Boolean(recordingEnabled) : enrollment.recordingAllowed,
      automaticReplayPublication:
        automaticReplayPublication !== undefined
          ? Boolean(automaticReplayPublication)
          : enrollment.automaticReplayPublication,
    },
    include: { subjects: true },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'session_created',
    fromStatus: null,
    toStatus: 'DRAFT',
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.SESSION_CREATED,
    metadata: { storeId },
  });
  return session;
}

export async function listSessionsForStore({ prisma, storeId } = {}) {
  return client(prisma).liveMarketSession.findMany({
    where: { storeId: String(storeId) },
    orderBy: { updatedAt: 'desc' },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function getSessionForStore({ prisma, storeId, sessionId } = {}) {
  const session = await client(prisma).liveMarketSession.findFirst({
    where: { id: String(sessionId), storeId: String(storeId) },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  return session;
}

export async function updateSessionDraft({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  patch = {},
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'draft',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (!['DRAFT', 'SCHEDULED'].includes(session.state)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'only DRAFT or SCHEDULED sessions can be edited',
      409,
    );
  }
  /** @type {Record<string, unknown>} */
  const data = { version: { increment: 1 } };
  if (patch.title !== undefined) data.title = String(patch.title).trim() || session.title;
  if (patch.description !== undefined) {
    data.description = patch.description == null ? null : String(patch.description);
  }
  if (patch.sourceLanguage !== undefined) data.sourceLanguage = String(patch.sourceLanguage);
  if (patch.viewerLanguages !== undefined) data.viewerLanguages = patch.viewerLanguages;
  if (patch.recordingEnabled !== undefined) data.recordingEnabled = Boolean(patch.recordingEnabled);
  if (patch.automaticReplayPublication !== undefined) {
    data.automaticReplayPublication = Boolean(patch.automaticReplayPublication);
  }
  if (patch.scheduledStartAt !== undefined && session.state === 'SCHEDULED') {
    data.scheduledStartAt = patch.scheduledStartAt ? new Date(patch.scheduledStartAt) : null;
  }
  const updated = await db.liveMarketSession.update({
    where: { id: session.id },
    data,
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'session_updated',
    fromStatus: session.state,
    toStatus: updated.state,
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.SESSION_UPDATED,
    metadata: { storeId, fields: Object.keys(patch) },
  });
  return updated;
}

async function transitionSession({
  prisma,
  session,
  toState,
  actorId,
  reason,
  extraData = {},
}) {
  const check = assertSessionTransition(session.state, toState);
  if (!check.ok) {
    throw fail(check.code, `invalid session transition ${session.state} → ${toState}`, 409);
  }
  const updated = await client(prisma).liveMarketSession.update({
    where: { id: session.id },
    data: {
      state: toState,
      version: { increment: 1 },
      ...extraData,
    },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendLiveMarketAudit({
    prisma,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'session_transition',
    fromStatus: session.state,
    toStatus: toState,
    actorId,
    reason: reason || LIVE_MARKET_AUDIT_REASONS.SESSION_TRANSITION,
    metadata: { storeId: session.storeId },
  });
  return updated;
}

export async function scheduleSession({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  scheduledStartAt,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'schedule',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (session.state === 'SCHEDULED') {
    return db.liveMarketSession.update({
      where: { id: session.id },
      data: {
        scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : session.scheduledStartAt,
        version: { increment: 1 },
      },
      include: { subjects: { orderBy: { sortOrder: 'asc' } } },
    });
  }
  return transitionSession({
    prisma: db,
    session,
    toState: 'SCHEDULED',
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.SESSION_TRANSITION,
    extraData: {
      scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
    },
  });
}

export async function prepareSession({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  videoProvider,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'prepare',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (session.state === 'CANCELLED') {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION, 'cancelled session cannot prepare', 409);
  }
  if (session.state !== 'SCHEDULED' && session.state !== 'READY') {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'prepare requires SCHEDULED (or READY re-prepare)',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  try {
    const prepared = await provider.prepareSession({
      sessionId: session.id,
      storeId,
      hostUserId,
      title: session.title,
      // Recording deferred — never enable from session flag alone while recordingV1 is off.
      recordingEnabled: false,
    });
    let updated;
    if (session.state === 'READY') {
      updated = await db.liveMarketSession.update({
        where: { id: session.id },
        data: {
          providerExternalRef: prepared.externalRef || session.providerExternalRef,
          version: { increment: 1 },
        },
        include: { subjects: { orderBy: { sortOrder: 'asc' } } },
      });
    } else {
      updated = await transitionSession({
        prisma: db,
        session,
        toState: 'READY',
        actorId: hostUserId,
        extraData: {
          providerExternalRef: prepared.externalRef || null,
        },
      });
    }
    await appendLiveMarketAudit({
      prisma: db,
      entityType: 'LiveMarketSession',
      entityId: session.id,
      action: 'broadcast_prepared',
      fromStatus: session.state,
      toStatus: updated.state,
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.LIVE_BROADCAST_PREPARED,
      metadata: {
        storeId,
        provider: provider.name,
        // UID allowed for internal audit policy; never stream keys
        providerInputUid: prepared.externalRef || null,
      },
    });
    return updated;
  } catch (err) {
    const code = err?.code || LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED;
    await appendLiveMarketAudit({
      prisma: db,
      entityType: 'LiveMarketSession',
      entityId: session.id,
      action: 'provider_prepare_blocked',
      fromStatus: session.state,
      toStatus: session.state,
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_PREPARE_BLOCKED,
      metadata: { storeId, code },
    });
    throw fail(code, err?.message || 'provider prepare failed', 409);
  }
}

/**
 * Owner start-intent → CONNECTING. Never marks LIVE.
 * Legacy alias: startSession.
 */
export async function startSessionIntent({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  videoProvider,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'start',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (session.state === 'CANCELLED') {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION, 'cancelled session cannot start', 409);
  }
  if (session.state !== 'READY' && session.state !== 'CONNECTING') {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'start-intent requires READY',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  try {
    await provider.startSession({
      sessionId: session.id,
      storeId,
      externalRef: session.providerExternalRef || undefined,
    });
    if (session.state === 'CONNECTING') {
      return session;
    }
    const updated = await transitionSession({
      prisma: db,
      session,
      toState: 'CONNECTING',
      actorId: hostUserId,
    });
    await appendLiveMarketAudit({
      prisma: db,
      entityType: 'LiveMarketSession',
      entityId: session.id,
      action: 'broadcast_start_intent',
      fromStatus: session.state,
      toStatus: 'CONNECTING',
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.LIVE_BROADCAST_START_INTENT,
      metadata: { storeId, provider: provider.name },
    });
    return updated;
  } catch (err) {
    const code = err?.code || LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED;
    await appendLiveMarketAudit({
      prisma: db,
      entityType: 'LiveMarketSession',
      entityId: session.id,
      action: 'provider_start_blocked',
      fromStatus: session.state,
      toStatus: session.state,
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_START_BLOCKED,
      metadata: { storeId, code },
    });
    throw fail(code, err?.message || 'provider start failed', 409);
  }
}

/** @deprecated Use startSessionIntent — kept as alias; never marks LIVE. */
export async function startSession(args) {
  return startSessionIntent(args);
}

/**
 * Apply provider-confirmed connection → LIVE (webhook or reconcile only).
 */
export async function confirmProviderConnected({
  prisma,
  session,
  actorId = null,
  source = 'reconcile',
  providerName = 'cloudflare_stream',
  providerInputUid = null,
} = {}) {
  const db = client(prisma);
  if (!session) return null;
  if (session.state === 'LIVE') return session;
  if (!['CONNECTING', 'READY'].includes(session.state)) {
    return session;
  }
  // READY → CONNECTING is not automatic; only CONNECTING (or READY if already intent-equivalent) may go LIVE
  // from evidence when already in CONNECTING. If READY without start-intent, do not promote.
  if (session.state === 'READY') {
    return session;
  }
  const updated = await transitionSession({
    prisma: db,
    session,
    toState: 'LIVE',
    actorId,
    extraData: { startedAt: session.startedAt || new Date() },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'provider_connected',
    fromStatus: session.state,
    toStatus: 'LIVE',
    actorId,
    actorType: actorId ? 'human' : 'system',
    reason: LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_CONNECTED,
    metadata: { storeId: session.storeId, provider: providerName, source, providerInputUid },
  });
  return updated;
}

/**
 * Disconnect evidence for LIVE/ENDING → ENDED.
 */
export async function confirmProviderDisconnected({
  prisma,
  session,
  actorId = null,
  source = 'reconcile',
  providerName = 'cloudflare_stream',
  providerInputUid = null,
  errorCode = null,
} = {}) {
  const db = client(prisma);
  if (!session) return null;
  if (['ENDED', 'CANCELLED', 'FAILED', 'PROCESSING', 'REPLAY_READY'].includes(session.state)) {
    return session;
  }
  if (!['LIVE', 'ENDING', 'CONNECTING'].includes(session.state)) {
    return session;
  }
  let current = session;
  if (current.state === 'LIVE' || current.state === 'CONNECTING') {
    current = await transitionSession({
      prisma: db,
      session: current,
      toState: current.state === 'CONNECTING' ? 'READY' : 'ENDING',
      actorId,
    });
  }
  if (current.state === 'ENDING' || current.state === 'LIVE') {
    current = await transitionSession({
      prisma: db,
      session: current,
      toState: 'ENDED',
      actorId,
      extraData: {
        endedAt: new Date(),
        endReasonCode: errorCode ? 'PROVIDER_ERROR' : 'PROVIDER_DISCONNECTED',
        failureReasonCode: errorCode || null,
      },
    });
  }
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: errorCode ? 'provider_error' : 'provider_disconnected',
    fromStatus: session.state,
    toStatus: current.state,
    actorId,
    actorType: actorId ? 'human' : 'system',
    reason: errorCode
      ? LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_ERROR
      : LIVE_MARKET_AUDIT_REASONS.LIVE_PROVIDER_DISCONNECTED,
    metadata: {
      storeId: session.storeId,
      provider: providerName,
      source,
      providerInputUid,
      errorCode: errorCode || undefined,
    },
  });
  return current;
}

export async function endSession({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  reasonCode,
  videoProvider,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'cancel',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (!['LIVE', 'CONNECTING', 'ENDING'].includes(session.state)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'end requires LIVE, CONNECTING, or ENDING',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });

  let current = session;
  if (current.state === 'LIVE' || current.state === 'CONNECTING') {
    current = await transitionSession({
      prisma: db,
      session: current,
      toState: 'ENDING',
      actorId: hostUserId,
    });
  }

  try {
    await provider.endSession({
      sessionId: session.id,
      storeId,
      reasonCode: reasonCode || 'HOST_ENDED',
      externalRef: session.providerExternalRef || undefined,
    });
  } catch (err) {
    if (err?.code !== LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED) {
      throw err;
    }
  }

  const ended = await transitionSession({
    prisma: db,
    session: current,
    toState: 'ENDED',
    actorId: hostUserId,
    extraData: {
      endedAt: new Date(),
      endReasonCode: reasonCode || 'HOST_ENDED',
    },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'broadcast_ended',
    fromStatus: session.state,
    toStatus: 'ENDED',
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.LIVE_BROADCAST_ENDED,
    metadata: { storeId, provider: provider.name },
  });
  return ended;
}

export async function cancelSession({ prisma, storeId, sessionId, hostUserId } = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'cancel',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  const wasPublished =
    normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus) ===
    STOREFRONT_PUBLICATION_STATUS.PUBLISHED;
  return transitionSession({
    prisma: db,
    session,
    toState: 'CANCELLED',
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.SESSION_CANCELLED,
    extraData: {
      endedAt: session.endedAt || new Date(),
      endReasonCode: 'CANCELLED',
      // Cancellation automatically withdraws the public announcement
      ...(wasPublished
        ? {
            storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
          }
        : {}),
    },
  });
}

/**
 * Publish scheduled session announcement to public storefront.
 * Does not mark LIVE, prepare provider, or request media credentials.
 */
export async function publishSessionStorefront({ prisma, storeId, sessionId, hostUserId } = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'publish_storefront',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  const enrollment = await getEnrollmentForStore(db, storeId);
  const gate = assertCanPublishStorefront({
    session,
    enrollmentState: enrollment?.state,
  });
  if (!gate.ok) {
    throw fail(gate.code, gate.message || 'publish denied', 403);
  }

  // Pilot policy: one primary published upcoming/live announcement per store
  const previousPublished = await db.liveMarketSession.findMany({
    where: {
      storeId: String(storeId),
      storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
      id: { not: session.id },
    },
    select: { id: true },
  });
  if (previousPublished.length) {
    await db.liveMarketSession.updateMany({
      where: { id: { in: previousPublished.map((r) => r.id) } },
      data: {
        storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
        version: { increment: 1 },
      },
    });
  }

  const fromStatus = normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus);
  const updated = await db.liveMarketSession.update({
    where: { id: session.id },
    data: {
      storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
      storefrontPublishedAt: new Date(),
      version: { increment: 1 },
    },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });

  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'storefront_published',
    fromStatus: session.state,
    toStatus: session.state,
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.STOREFRONT_PUBLISHED,
    metadata: {
      storeId,
      publicationFrom: fromStatus,
      publicationTo: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
      withdrawnPriorCount: previousPublished.length,
    },
  });

  // Never transition media lifecycle to LIVE here
  return updated;
}

/**
 * Withdraw storefront announcement without deleting the session.
 */
export async function withdrawSessionStorefront({ prisma, storeId, sessionId, hostUserId } = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'withdraw_storefront',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  const fromStatus = normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus);
  if (fromStatus !== STOREFRONT_PUBLICATION_STATUS.PUBLISHED) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_STOREFRONT_NOT_PUBLISHED,
      'Session is not published on the storefront',
      409,
    );
  }
  const updated = await db.liveMarketSession.update({
    where: { id: session.id },
    data: {
      storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
      version: { increment: 1 },
    },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'storefront_withdrawn',
    fromStatus: session.state,
    toStatus: session.state,
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.STOREFRONT_WITHDRAWN,
    metadata: {
      storeId,
      publicationFrom: fromStatus,
      publicationTo: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
    },
  });
  return updated;
}

/** Admin safety withdrawal (platform admin routes). */
export async function adminWithdrawSessionStorefront({ prisma, sessionId, actorId } = {}) {
  const db = client(prisma);
  const session = await db.liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  const fromStatus = normalizeStorefrontPublicationStatus(session.storefrontPublicationStatus);
  if (fromStatus !== STOREFRONT_PUBLICATION_STATUS.PUBLISHED) {
    return session;
  }
  const updated = await db.liveMarketSession.update({
    where: { id: session.id },
    data: {
      storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
      version: { increment: 1 },
    },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'storefront_withdrawn',
    fromStatus: session.state,
    toStatus: session.state,
    actorId: actorId || null,
    reason: LIVE_MARKET_AUDIT_REASONS.STOREFRONT_WITHDRAWN,
    metadata: {
      storeId: session.storeId,
      publicationFrom: fromStatus,
      publicationTo: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN,
      admin: true,
    },
  });
  return updated;
}

export async function getPublicSession({ prisma, sessionId, userId = null } = {}) {
  const session = await client(prisma).liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: {
      subjects: { orderBy: { sortOrder: 'asc' } },
      store: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  });
  if (!session || session.store?.isActive === false) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  const enrollment = await getEnrollmentForStore(client(prisma), session.storeId);
  const subjectIds = (session.subjects || []).map((s) => s.subjectId);
  const products =
    subjectIds.length === 0
      ? []
      : await client(prisma).product.findMany({
          where: { id: { in: subjectIds }, deletedAt: null },
          select: { id: true, name: true },
        });
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  let registration = null;
  if (Features.liveMarket.registrationV1) {
    registration = await resolvePublicRegistrationBlock({
      prisma: client(prisma),
      session,
      enrollmentState: enrollment?.state || null,
      userId,
    });
  }
  const dto = toPublicLiveSessionDto(session, {
    storeName: session.store?.name,
    storeSlug: session.store?.slug,
    enrollmentState: enrollment?.state || null,
    providerConfirmedLive: session.state === 'LIVE',
    subjects: (session.subjects || []).map((s) => ({
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      sortOrder: s.sortOrder,
      name: nameById.get(s.subjectId) || null,
    })),
    registration,
  });
  if (!dto) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  return dto;
}

/**
 * Primary published upcoming/live announcement for a store slug (storefront card).
 * @returns {Promise<object|null>}
 */
export async function getPublicStoreLiveSessionBySlug({ prisma, slug, userId = null } = {}) {
  const db = client(prisma);
  const store = await db.business.findFirst({
    where: { slug: String(slug || '').trim() },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!store || store.isActive === false) {
    return null;
  }
  const enrollment = await getEnrollmentForStore(db, store.id);
  if (!enrollment || enrollment.state !== 'ACTIVE') {
    return null;
  }

  const now = new Date();
  const candidates = await db.liveMarketSession.findMany({
    where: {
      storeId: store.id,
      storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
      state: {
        in: [
          'SCHEDULED',
          'READY',
          'CONNECTING',
          'LIVE',
          'ENDING',
          'ENDED',
          'PROCESSING',
          'REPLAY_READY',
        ],
      },
    },
    orderBy: [{ scheduledStartAt: 'asc' }, { updatedAt: 'desc' }],
    take: 10,
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });

  const primary = selectPrimaryPublishedSession(candidates, {
    now,
    providerConfirmedLive: candidates.some((c) => c.state === 'LIVE'),
    enrollmentState: enrollment.state,
  });
  if (!primary) return null;

  const subjectIds = (primary.subjects || []).map((s) => s.subjectId);
  const products =
    subjectIds.length === 0
      ? []
      : await db.product.findMany({
          where: { id: { in: subjectIds }, deletedAt: null },
          select: { id: true, name: true },
        });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  let registration = null;
  if (Features.liveMarket.registrationV1) {
    registration = await resolvePublicRegistrationBlock({
      prisma: db,
      session: primary,
      enrollmentState: enrollment.state,
      userId,
      now,
    });
  }

  return toPublicLiveSessionDto(primary, {
    storeName: store.name,
    storeSlug: store.slug,
    enrollmentState: enrollment.state,
    providerConfirmedLive: primary.state === 'LIVE',
    displayTimezone: extrasTimezone(),
    now,
    subjects: (primary.subjects || []).map((s) => ({
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      sortOrder: s.sortOrder,
      name: nameById.get(s.subjectId) || null,
    })),
    registration,
  });
}

function extrasTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function setSessionSubjects({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  subjects,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'subjects',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (!['DRAFT', 'SCHEDULED', 'READY'].includes(session.state)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'subjects can only be set before LIVE',
      409,
    );
  }
  const { normalized, invalid, duplicates } = normalizeSubjectInputs(subjects);
  if (invalid.length) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SUBJECT_INVALID, 'invalid subjects', 400);
  }
  for (const item of normalized) {
    const product = await db.product.findFirst({
      where: { id: item.subjectId },
      select: { id: true, businessId: true, deletedAt: true },
    });
    let catalogItemType = null;
    if (product) {
      try {
        const typed = await db.product.findFirst({
          where: { id: item.subjectId },
          select: { itemType: true },
        });
        catalogItemType = typed?.itemType ?? null;
      } catch {
        catalogItemType = null;
      }
    }
    const check = validateSessionSubject({
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      storeId,
      product: product
        ? {
            id: product.id,
            businessId: product.businessId,
            deletedAt: product.deletedAt,
            catalogItemType,
          }
        : null,
    });
    if (!check.ok) {
      throw fail(check.code, check.message || check.code, 400);
    }
  }
  await db.$transaction(async (tx) => {
    await tx.liveMarketSessionSubject.deleteMany({ where: { sessionId: session.id } });
    if (normalized.length) {
      await tx.liveMarketSessionSubject.createMany({
        data: normalized.map((s) => ({
          sessionId: session.id,
          subjectType: s.subjectType,
          subjectId: s.subjectId,
          sortOrder: s.sortOrder,
        })),
      });
    }
    await tx.liveMarketSession.update({
      where: { id: session.id },
      data: { version: { increment: 1 } },
    });
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'subjects_set',
    fromStatus: session.state,
    toStatus: session.state,
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.SUBJECTS_SET,
    metadata: {
      storeId,
      count: normalized.length,
      duplicatesDropped: duplicates.length,
      subjectIds: normalized.map((s) => s.subjectId),
    },
  });
  return getSessionForStore({ prisma: db, storeId, sessionId });
}

export async function listAdminSessions({ prisma, storeId, state } = {}) {
  /** @type {Record<string, unknown>} */
  const where = {};
  if (storeId) where.storeId = String(storeId);
  if (state) where.state = String(state);
  return client(prisma).liveMarketSession.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      subjects: { orderBy: { sortOrder: 'asc' } },
      store: { select: { id: true, name: true, slug: true } },
    },
  });
}

export function getLiveMarketHealth() {
  const provider = resolveLiveVideoProvider();
  const ownerReady = isOwnerCapabilityProviderReady(provider);
  const rtmpsReady = provider.name === 'cloudflare_stream' && ownerReady;
  return {
    ok: true,
    feature: 'live_market',
    phase: 'rtmps_pilot',
    providerConfigured: ownerReady,
    providerName: provider.name,
    experimentalAdapter: provider.name === 'cloudflare_stream' ? 'cloudflare_stream' : null,
    /** Remains false until real OBS + second-device pilot passes. */
    streamingOperational: false,
    rtmpsHostEnabled: Boolean(Features.liveMarket.rtmpsHostV1),
    webrtcEnabled: Boolean(Features.liveMarket.cloudflareWebRtcV1),
    recordingEnabled: Boolean(Features.liveMarket.recordingV1),
    retention: {
      rawProviderRecordingHours: LIVE_MARKET_RETENTION.rawProviderRecordingHours,
      publicLiveChatHours: LIVE_MARKET_RETENTION.publicLiveChatHours,
    },
    note: rtmpsReady
      ? 'Cloudflare Stream RTMPS adapter selected — streamingOperational false until OBS second-device pilot'
      : 'Live Market foundation — broadcasting not operational',
  };
}

export function toOwnerSessionDto(session) {
  if (!session) return null;
  const providerConfirmedLive = session.state === 'LIVE';
  return {
    id: session.id,
    storeId: session.storeId,
    hostUserId: session.hostUserId,
    title: session.title,
    description: session.description,
    sourceLanguage: session.sourceLanguage,
    viewerLanguages: asArray(session.viewerLanguages, defaultLangJson()),
    scheduledStartAt: session.scheduledStartAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    state: session.state,
    storefrontPublicationStatus: normalizeStorefrontPublicationStatus(
      session.storefrontPublicationStatus,
    ),
    storefrontPublishedAt: session.storefrontPublishedAt ?? null,
    recordingEnabled: false,
    automaticReplayPublication: session.automaticReplayPublication,
    providerReady:
      Boolean(session.providerExternalRef) &&
      ['READY', 'CONNECTING', 'LIVE', 'ENDING'].includes(session.state),
    providerConfigured: isOwnerCapabilityProviderReady(resolveLiveVideoProvider()),
    providerConfirmedLive,
    providerConnected: providerConfirmedLive,
    endReasonCode: session.endReasonCode,
    failureReasonCode: session.failureReasonCode,
    version: session.version,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    subjects: (session.subjects || []).map((s) => ({
      subjectType: s.subjectType,
      subjectId: s.subjectId,
      sortOrder: s.sortOrder,
    })),
  };
}

/**
 * Safe owner broadcast capabilities — no credentials.
 */
export async function getBroadcastCapabilities({ prisma, storeId, sessionId, hostUserId } = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'prepare',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  const provider = resolveLiveVideoProvider();
  const ready = isOwnerCapabilityProviderReady(provider);
  return {
    sessionId: session.id,
    state: session.state,
    providerName: provider.name,
    providerConfigured: ready,
    canPrepare: ready && ['SCHEDULED', 'READY'].includes(session.state),
    canStartIntent: ready && ['READY', 'CONNECTING'].includes(session.state),
    canRequestCredentials:
      ready &&
      Boolean(session.providerExternalRef) &&
      ['READY', 'CONNECTING', 'LIVE'].includes(session.state),
    canEnd: ['LIVE', 'CONNECTING', 'ENDING'].includes(session.state),
    hostMode: 'rtmps_obs',
    webrtcAvailable: false,
    recordingAvailable: false,
    streamingOperational: false,
  };
}

/**
 * Redacted provider state for owner control room.
 */
export async function getProviderState({ prisma, storeId, sessionId, hostUserId, videoProvider } = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'prepare',
  });
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  let providerStatus = 'unknown';
  let connected = false;
  if (session.providerExternalRef && typeof provider.getSessionState === 'function') {
    try {
      const state = await provider.getSessionState({
        sessionId: session.id,
        externalRef: session.providerExternalRef,
      });
      providerStatus = state.status || 'unknown';
      connected = Boolean(state.connected || state.status === 'live');
    } catch {
      providerStatus = 'unavailable';
    }
  }
  return {
    sessionId: session.id,
    sessionState: session.state,
    providerName: provider.name,
    providerStatus,
    connected,
    providerConfirmedLive: session.state === 'LIVE',
    hasLiveInput: Boolean(session.providerExternalRef),
  };
}

const credentialsRateBuckets = new Map();

function assertCredentialsRateLimit(storeId, sessionId) {
  const key = `${storeId}:${sessionId}`;
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  const bucket = credentialsRateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  credentialsRateBuckets.set(key, bucket);
  if (bucket.count > max) {
    const err = fail(
      LIVE_MARKET_ERROR_CODES.LIVE_BROADCAST_CREDENTIALS_DENIED,
      'broadcast credentials rate limited',
      429,
    );
    throw err;
  }
}

/**
 * Issue RTMPS credentials on demand. Never persist. Never log body.
 */
export async function issueBroadcastCredentials({
  prisma,
  storeId,
  sessionId,
  hostUserId,
  videoProvider,
} = {}) {
  const db = client(prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId,
    userId: hostUserId,
    action: 'prepare',
  });
  if (!Features.liveMarket.rtmpsHostV1 || !Features.liveMarket.broadcastV1) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_BROADCAST_CREDENTIALS_DENIED,
      'RTMPS host broadcast is not enabled',
      403,
    );
  }
  assertCredentialsRateLimit(storeId, sessionId);
  const session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (session.state === 'CANCELLED') {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION, 'cancelled session', 409);
  }
  if (!session.providerExternalRef || !['READY', 'CONNECTING', 'LIVE'].includes(session.state)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_BROADCAST_CREDENTIALS_DENIED,
      'session must be prepared before credentials can be issued',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  if (typeof provider.getBroadcastCredentials !== 'function') {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'provider does not support RTMPS credentials',
      409,
    );
  }
  const creds = await provider.getBroadcastCredentials({
    sessionId: session.id,
    externalRef: session.providerExternalRef,
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketSession',
    entityId: session.id,
    action: 'broadcast_credentials_issued',
    fromStatus: session.state,
    toStatus: session.state,
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.LIVE_BROADCAST_CREDENTIALS_ISSUED,
    metadata: {
      storeId,
      provider: provider.name,
      providerInputUid: session.providerExternalRef,
      // never stream key / rtmps url
    },
  });
  return {
    rtmpsUrl: creds.rtmpsUrl,
    streamKey: creds.streamKey,
    advisory: creds.advisory || 'Treat the stream key as a durable bearer credential.',
    expiresAdvisory: 'Stream key remains valid until the Live Input is rotated or deleted.',
  };
}

export async function findSessionByProviderExternalRef({ prisma, providerExternalRef } = {}) {
  const uid = String(providerExternalRef || '').trim();
  if (!uid) return null;
  return client(prisma).liveMarketSession.findFirst({
    where: { providerExternalRef: uid },
  });
}

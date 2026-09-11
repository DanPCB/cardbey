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

/**
 * Provider evidence: session is now connected upstream, so Cardbey may mark it LIVE.
 */
export async function confirmProviderConnected({ prisma, sessionId, observedAt } = {}) {
  const db = client(prisma);
  const session = await db.liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  if (session.state === 'LIVE') return session;
  // LIVE only after start-intent (CONNECTING). Connected evidence while still READY is ignored.
  if (session.state !== 'CONNECTING') return session;
  return transitionSession({
    prisma: db,
    session,
    toState: 'LIVE',
    actorId: null,
    reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_CONNECTED,
    extraData: {
      startedAt: session.startedAt || (observedAt ? new Date(observedAt) : new Date()),
    },
  });
}

/**
 * Provider evidence: stream lost upstream. Before LIVE, fall back to READY; after LIVE, begin ending.
 */
export async function disconnectProviderSession({ prisma, sessionId } = {}) {
  const db = client(prisma);
  const session = await db.liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  if (session.state === 'CONNECTING') {
    return transitionSession({
      prisma: db,
      session,
      toState: 'READY',
      actorId: null,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_DISCONNECTED,
    });
  }
  if (session.state === 'LIVE') {
    return transitionSession({
      prisma: db,
      session,
      toState: 'ENDING',
      actorId: null,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_DISCONNECTED,
    });
  }
  return session;
}

/**
 * Provider evidence: upstream input is disabled or finished. Complete the end path idempotently.
 */
export async function endProviderSession({ prisma, sessionId, observedAt, reasonCode } = {}) {
  const db = client(prisma);
  let session = await db.liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'session_not_found', 404);
  }
  if (session.state === 'ENDED') return session;
  if (session.state === 'LIVE') {
    session = await transitionSession({
      prisma: db,
      session,
      toState: 'ENDING',
      actorId: null,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_DISCONNECTED,
    });
  } else if (session.state === 'CONNECTING') {
    session = await transitionSession({
      prisma: db,
      session,
      toState: 'ENDING',
      actorId: null,
      reason: LIVE_MARKET_AUDIT_REASONS.PROVIDER_RECONCILED,
    });
  }
  if (session.state !== 'ENDING') return session;
  return transitionSession({
    prisma: db,
    session,
    toState: 'ENDED',
    actorId: null,
    reason: LIVE_MARKET_AUDIT_REASONS.BROADCAST_ENDED,
    extraData: {
      endedAt: session.endedAt || (observedAt ? new Date(observedAt) : new Date()),
      endReasonCode: String(reasonCode || session.endReasonCode || 'PROVIDER_ENDED'),
    },
  });
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
      recordingEnabled: session.recordingEnabled,
    });
    if (session.state === 'READY') {
      return db.liveMarketSession.update({
        where: { id: session.id },
        data: {
          providerExternalRef: prepared.externalRef || session.providerExternalRef,
          version: { increment: 1 },
        },
        include: { subjects: { orderBy: { sortOrder: 'asc' } } },
      });
    }
    return transitionSession({
      prisma: db,
      session,
      toState: 'READY',
      actorId: hostUserId,
      extraData: {
        providerExternalRef: prepared.externalRef || null,
      },
    });
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

export async function startSession({
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
  if (session.state !== 'READY') {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION, 'start requires READY', 409);
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
  try {
    await provider.startSession({ sessionId: session.id, storeId });
    return transitionSession({
      prisma: db,
      session,
      toState: 'CONNECTING',
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.BROADCAST_START_INTENT,
    });
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
  let session = await getSessionForStore({ prisma: db, storeId, sessionId });
  if (!['CONNECTING', 'LIVE', 'ENDING'].includes(String(session.state))) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'end requires CONNECTING, LIVE, or ENDING',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: videoProvider });
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
  if (session.state === 'CONNECTING' || session.state === 'LIVE') {
    session = await transitionSession({
      prisma: db,
      session,
      toState: 'ENDING',
      actorId: hostUserId,
      reason: LIVE_MARKET_AUDIT_REASONS.BROADCAST_ENDED,
    });
  }
  return transitionSession({
    prisma: db,
    session,
    toState: 'ENDED',
    actorId: hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.BROADCAST_ENDED,
    extraData: {
      endedAt: new Date(),
      endReasonCode: reasonCode || 'HOST_ENDED',
    },
  });
}

/**
 * Owner start-intent alias — never marks LIVE.
 */
export async function startBroadcastIntent(args = {}) {
  return startSession(args);
}

/**
 * Issue ephemeral RTMPS credentials (no-store). Never persists the stream key.
 * @param {{ prisma?: any, storeId: string, sessionId: string, hostUserId: string, videoProvider?: any }} args
 */
export async function issueBroadcastCredentials(args = {}) {
  const db = client(args.prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId: args.storeId,
    userId: args.hostUserId,
    action: 'prepare',
  });
  if (!Features.liveMarket.rtmpsHostV1) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'RTMPS host credentials are disabled',
      403,
    );
  }
  const session = await getSessionForStore({
    prisma: db,
    storeId: args.storeId,
    sessionId: args.sessionId,
  });
  if (!['READY', 'CONNECTING', 'LIVE'].includes(String(session.state))) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
      'credentials require READY, CONNECTING, or LIVE',
      409,
    );
  }
  if (!session.providerExternalRef) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_RESOURCE_NOT_FOUND,
      'session has no provider live input',
      409,
    );
  }
  const provider = resolveLiveVideoProvider({ provider: args.videoProvider });
  if (typeof provider.getRtmpsCredentials !== 'function') {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_PROVIDER_NOT_CONFIGURED,
      'provider does not support RTMPS credentials',
      409,
    );
  }
  const creds = await provider.getRtmpsCredentials({
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
    actorId: args.hostUserId,
    reason: LIVE_MARKET_AUDIT_REASONS.BROADCAST_CREDENTIALS_ISSUED,
    metadata: { storeId: args.storeId, hasUrl: Boolean(creds?.rtmpsUrl) },
  });
  return {
    sessionId: session.id,
    rtmpsUrl: creds?.rtmpsUrl || null,
    rtmpsStreamKey: creds?.rtmpsStreamKey || null,
    expiresHint: 'ephemeral_do_not_persist',
  };
}

/**
 * Redacted owner provider-state DTO (no credentials).
 */
export async function getOwnerProviderState(args = {}) {
  const db = client(args.prisma);
  await assertOwnerPilotAccess({
    prisma: db,
    storeId: args.storeId,
    userId: args.hostUserId,
    action: 'prepare',
  });
  const session = await getSessionForStore({
    prisma: db,
    storeId: args.storeId,
    sessionId: args.sessionId,
  });
  const provider = resolveLiveVideoProvider({ provider: args.videoProvider });
  let providerStatus = 'unknown';
  try {
    if (session.providerExternalRef) {
      const state = await provider.getSessionState({
        sessionId: session.id,
        externalRef: session.providerExternalRef,
      });
      providerStatus = String(state?.status || 'unknown');
    }
  } catch {
    providerStatus = 'unavailable';
  }
  return {
    sessionId: session.id,
    sessionState: session.state,
    providerName: provider?.name || 'not_configured',
    providerStatus,
    providerExternalRefPresent: Boolean(session.providerExternalRef),
    providerConfirmedLive: session.state === 'LIVE',
  };
}

/**
 * Safe broadcast capability DTO for control room.
 */
export async function getBroadcastCapabilities(args = {}) {
  const status = await getOwnerLiveMarketStatus({
    prisma: args.prisma,
    storeId: args.storeId,
    userId: args.hostUserId,
  });
  return {
    ...status.capabilities,
    rtmpsHostEnabled: Boolean(Features.liveMarket.rtmpsHostV1),
    storefrontPlayerEnabled: Boolean(Features.liveMarket.storefrontPlayerV1),
    globalPlayerEnabled: Boolean(Features.liveMarket.globalPlayerV1),
    recordingEnabled: Boolean(Features.liveMarket.recordingV1),
    replayEnabled: Boolean(Features.liveMarket.replayV1),
    webrtcEnabled: Boolean(Features.liveMarket.cloudflareWebRtcV1),
    streamingOperational: Boolean(
      Features.liveMarket.rtmpsHostV1 && status.providerReadiness === 'CONFIGURED',
    ),
  };
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
    providerConfirmedLive: String(session.state) === 'LIVE',
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
      state: { in: ['SCHEDULED', 'READY', 'LIVE', 'ENDED', 'PROCESSING', 'REPLAY_READY'] },
    },
    orderBy: [{ scheduledStartAt: 'asc' }, { updatedAt: 'desc' }],
    take: 10,
    include: { subjects: { orderBy: { sortOrder: 'asc' } } },
  });

  const primary = selectPrimaryPublishedSession(candidates, {
    now,
    providerConfirmedLive: candidates.some((s) => String(s.state) === 'LIVE'),
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
    providerConfirmedLive: String(primary.state) === 'LIVE',
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
  return {
    ok: true,
    feature: 'live_market',
    phase: 1,
    providerConfigured: ownerReady,
    providerName: provider.name,
    experimentalAdapter: provider.name === 'cloudflare_stream' ? 'cloudflare_stream' : null,
    streamingOperational: false,
    retention: {
      rawProviderRecordingHours: LIVE_MARKET_RETENTION.rawProviderRecordingHours,
      publicLiveChatHours: LIVE_MARKET_RETENTION.publicLiveChatHours,
    },
    note:
      provider.name === 'cloudflare_stream'
        ? 'Cloudflare Stream RTMPS pilot selected; owner prepare/start may be enabled, but LIVE still requires provider-connected evidence'
        : 'Phase 1 foundation only — no claim that real broadcast is operational',
  };
}

export function toOwnerSessionDto(session) {
  if (!session) return null;
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
    recordingEnabled: session.recordingEnabled,
    automaticReplayPublication: session.automaticReplayPublication,
    providerReady: Boolean(session.providerExternalRef) && session.state === 'READY',
    providerConfigured: isOwnerCapabilityProviderReady(resolveLiveVideoProvider()),
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

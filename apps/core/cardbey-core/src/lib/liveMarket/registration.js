/**
 * Live Market participant registration — audience RSVP for published sessions.
 * Does not change session lifecycle/publication and never calls Cloudflare.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import { appendLiveMarketAudit } from './audit.js';
import {
  LIVE_MARKET_ERROR_CODES,
  LIVE_MARKET_AUDIT_REASONS,
  LIVE_REGISTRATION_STATUS,
  LIVE_QUESTION_REVIEW_STATUS,
  LIVE_PARTICIPANT_TYPE,
  assertQuestionReviewTransition,
  evaluateRegistrationAvailability,
  toPublicRegistrationDto,
} from './domain.js';

function client(prisma) {
  return prisma || getPrismaClient();
}

async function getEnrollmentForStore(db, storeId) {
  return db.liveMarketPilotEnrollment.findUnique({
    where: { storeId: String(storeId) },
  });
}

function fail(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

function normalizeLang(code) {
  return String(code || '')
    .trim()
    .toLowerCase();
}

function sessionAllowedLanguages(session) {
  const viewers = Array.isArray(session.viewerLanguages)
    ? session.viewerLanguages
    : typeof session.viewerLanguages === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(session.viewerLanguages);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return Array.from(
    new Set(
      [session.sourceLanguage, ...viewers]
        .map(normalizeLang)
        .filter(Boolean),
    ),
  );
}

function toRegistrationDto(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.sessionId,
    storeId: row.storeId,
    status: row.status,
    preferredLanguage: row.preferredLanguage,
    questionForHost: row.questionForHost ?? null,
    interestSubjectId: row.interestSubjectId ?? null,
    interestSubjectType: row.interestSubjectType ?? null,
    registeredAt: row.registeredAt,
    cancelledAt: row.cancelledAt ?? null,
    displayName: extras.displayName ?? null,
    email: extras.email ?? null,
    session: extras.session
      ? {
          id: extras.session.id,
          title: extras.session.title,
          scheduledStartAt: extras.session.scheduledStartAt,
          storefrontPublicationStatus: extras.session.storefrontPublicationStatus,
          state: extras.session.state,
          storeSlug: extras.storeSlug ?? null,
          storeName: extras.storeName ?? null,
        }
      : undefined,
  };
}

/**
 * Build public registration eligibility (+ optional current-user status).
 */
export async function resolvePublicRegistrationBlock({
  prisma,
  session,
  enrollmentState,
  userId = null,
  now = new Date(),
} = {}) {
  const featureOn = Features.liveMarket.registrationV1 === true;
  const evalResult = evaluateRegistrationAvailability(session, {
    now,
    enrollmentState,
    providerConfirmedLive: false,
    registrationFeatureEnabled: featureOn,
  });
  /** @type {{ available: boolean, currentUserStatus?: 'REGISTERED'|'NOT_REGISTERED' }} */
  const block = { available: evalResult.available };
  if (userId) {
    const db = client(prisma);
    const existing = await db.liveMarketParticipantRegistration.findUnique({
      where: {
        sessionId_userId: { sessionId: session.id, userId: String(userId) },
      },
      select: { status: true },
    });
    block.currentUserStatus =
      existing && existing.status === LIVE_REGISTRATION_STATUS.REGISTERED
        ? 'REGISTERED'
        : 'NOT_REGISTERED';
  }
  return toPublicRegistrationDto(block);
}

export async function getMyRegistrationForSession({ prisma, sessionId, userId } = {}) {
  if (!Features.liveMarket.registrationV1) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED, 'Registration is disabled', 403);
  }
  if (!userId) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_AUTH_REQUIRED, 'Sign in required', 401);
  }
  const db = client(prisma);
  const row = await db.liveMarketParticipantRegistration.findUnique({
    where: {
      sessionId_userId: { sessionId: String(sessionId), userId: String(userId) },
    },
  });
  if (!row || row.status !== LIVE_REGISTRATION_STATUS.REGISTERED) {
    return null;
  }
  const user = await db.user.findUnique({
    where: { id: String(userId) },
    select: { displayName: true, fullName: true, email: true },
  });
  return toRegistrationDto(row, {
    displayName: user?.displayName || user?.fullName || null,
    email: user?.email || null,
  });
}

export async function registerForSession({
  prisma,
  sessionId,
  userId,
  preferredLanguage,
  questionForHost = null,
  interestSubjectId = null,
  interestSubjectType = null,
  surface = null,
  attributionToken = null,
} = {}) {
  if (!Features.liveMarket.registrationV1) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED, 'Registration is disabled', 403);
  }
  if (!userId) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_AUTH_REQUIRED, 'Sign in required', 401);
  }

  const db = client(prisma);
  const session = await db.liveMarketSession.findUnique({
    where: { id: String(sessionId) },
    include: { subjects: true },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'Session not found', 404);
  }

  const store = await db.business.findUnique({
    where: { id: session.storeId },
    select: { id: true, isActive: true, slug: true, name: true },
  });
  if (!store || store.isActive === false) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_STORE_UNAVAILABLE, 'Store unavailable', 404);
  }

  const enrollment = await getEnrollmentForStore(db, session.storeId);
  const availability = evaluateRegistrationAvailability(session, {
    enrollmentState: enrollment?.state || null,
    providerConfirmedLive: false,
    registrationFeatureEnabled: true,
  });
  if (!availability.available) {
    throw fail(
      availability.code || LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_CLOSED,
      'Registration is closed for this session',
      409,
    );
  }

  const allowed = sessionAllowedLanguages(session);
  const lang = normalizeLang(preferredLanguage) || normalizeLang(session.sourceLanguage) || 'en';
  if (!allowed.includes(lang)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_LANGUAGE_INVALID,
      'Preferred language is not offered for this session',
      400,
    );
  }

  let interestId = interestSubjectId ? String(interestSubjectId).trim() : null;
  let interestType = interestSubjectType ? String(interestSubjectType).trim().toUpperCase() : null;
  if (interestId) {
    const product = await db.product.findFirst({
      where: { id: interestId, deletedAt: null },
      select: { id: true, businessId: true },
    });
    if (!product || product.businessId !== session.storeId) {
      throw fail(
        LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_INTEREST_INVALID,
        'Product or service interest must belong to this store',
        400,
      );
    }
    if (!interestType || (interestType !== 'PRODUCT' && interestType !== 'SERVICE')) {
      const featured = (session.subjects || []).find((s) => s.subjectId === interestId);
      interestType = featured?.subjectType === 'SERVICE' ? 'SERVICE' : 'PRODUCT';
    }
  } else {
    interestId = null;
    interestType = null;
  }

  const question =
    questionForHost == null || String(questionForHost).trim() === ''
      ? null
      : String(questionForHost).trim().slice(0, 1000);
  const questionReviewStatus = question ? LIVE_QUESTION_REVIEW_STATUS.NEW : null;

  const now = new Date();
  const existing = await db.liveMarketParticipantRegistration.findUnique({
    where: {
      sessionId_userId: { sessionId: session.id, userId: String(userId) },
    },
  });

  let row;
  let created = false;
  if (existing) {
    const keepReview =
      question &&
      existing.questionForHost &&
      String(existing.questionForHost).trim() === question &&
      existing.questionReviewStatus &&
      Object.values(LIVE_QUESTION_REVIEW_STATUS).includes(existing.questionReviewStatus);
    row = await db.liveMarketParticipantRegistration.update({
      where: { id: existing.id },
      data: {
        preferredLanguage: lang,
        questionForHost: question,
        questionReviewStatus: keepReview ? existing.questionReviewStatus : questionReviewStatus,
        interestSubjectId: interestId,
        interestSubjectType: interestType,
        status: LIVE_REGISTRATION_STATUS.REGISTERED,
        registeredAt: existing.status === LIVE_REGISTRATION_STATUS.REGISTERED ? existing.registeredAt : now,
        cancelledAt: null,
      },
    });
  } else {
    created = true;
    row = await db.liveMarketParticipantRegistration.create({
      data: {
        sessionId: session.id,
        storeId: session.storeId,
        userId: String(userId),
        preferredLanguage: lang,
        questionForHost: question,
        questionReviewStatus,
        interestSubjectId: interestId,
        interestSubjectType: interestType,
        status: LIVE_REGISTRATION_STATUS.REGISTERED,
        registeredAt: now,
      },
    });
  }

  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketParticipantRegistration',
    entityId: row.id,
    action: 'LIVE_PARTICIPANT_REGISTERED',
    fromStatus: existing?.status || null,
    toStatus: LIVE_REGISTRATION_STATUS.REGISTERED,
    actorId: String(userId),
    reason: LIVE_MARKET_AUDIT_REASONS.PARTICIPANT_REGISTERED,
    metadata: {
      sessionId: session.id,
      storeId: session.storeId,
      preferredLanguage: lang,
      surface: surface || null,
      created,
      // Reminder seam only — no external delivery in this slice
      reminderEvent: 'LIVE_REGISTRATION_CREATED',
    },
  });

  const user = await db.user.findUnique({
    where: { id: String(userId) },
    select: { displayName: true, fullName: true, email: true },
  });

  await recordLiveCnetRegistration(db, attributionToken);

  return {
    registration: toRegistrationDto(row, {
      displayName: user?.displayName || user?.fullName || null,
      email: user?.email || null,
      session,
      storeSlug: store.slug,
      storeName: store.name,
    }),
    created,
    idempotent: !created && existing?.status === LIVE_REGISTRATION_STATUS.REGISTERED,
  };
}

async function recordLiveCnetRegistration(prisma, attributionToken) {
  if (!attributionToken || !Features.liveMarket.cnetContractV1) return;
  try {
    const { recordContractEvent, LIVE_CNET_EVENTS } = await import('../liveCnet/index.js');
    await recordContractEvent({
      prisma,
      eventType: LIVE_CNET_EVENTS.REGISTRATION,
      attributionToken,
      extraDedupe: `reg:${String(attributionToken)}:${new Date().toISOString().slice(0, 13)}`,
    });
  } catch {
    /* never block RSVP */
  }
}

export async function cancelMyRegistration({ prisma, sessionId, userId, surface = null } = {}) {
  if (!Features.liveMarket.registrationV1) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED, 'Registration is disabled', 403);
  }
  if (!userId) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_AUTH_REQUIRED, 'Sign in required', 401);
  }
  const db = client(prisma);
  const existing = await db.liveMarketParticipantRegistration.findUnique({
    where: {
      sessionId_userId: { sessionId: String(sessionId), userId: String(userId) },
    },
  });
  if (!existing || existing.status !== LIVE_REGISTRATION_STATUS.REGISTERED) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_NOT_FOUND, 'Registration not found', 404);
  }
  const now = new Date();
  const row = await db.liveMarketParticipantRegistration.update({
    where: { id: existing.id },
    data: {
      status: LIVE_REGISTRATION_STATUS.CANCELLED,
      cancelledAt: now,
    },
  });
  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketParticipantRegistration',
    entityId: row.id,
    action: 'LIVE_PARTICIPANT_REGISTRATION_CANCELLED',
    fromStatus: LIVE_REGISTRATION_STATUS.REGISTERED,
    toStatus: LIVE_REGISTRATION_STATUS.CANCELLED,
    actorId: String(userId),
    reason: LIVE_MARKET_AUDIT_REASONS.PARTICIPANT_REGISTRATION_CANCELLED,
    metadata: {
      sessionId: row.sessionId,
      storeId: row.storeId,
      preferredLanguage: row.preferredLanguage,
      surface: surface || null,
    },
  });
  return toRegistrationDto(row);
}

export async function updateMyRegistration({
  prisma,
  sessionId,
  userId,
  preferredLanguage,
  questionForHost,
  interestSubjectId,
  interestSubjectType,
} = {}) {
  // Reuse register path for updates while open — keeps validation centralized.
  return registerForSession({
    prisma,
    sessionId,
    userId,
    preferredLanguage,
    questionForHost,
    interestSubjectId,
    interestSubjectType,
  });
}

export async function listMyRegistrations({ prisma, userId, limit = 50 } = {}) {
  if (!Features.liveMarket.registrationV1) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED, 'Registration is disabled', 403);
  }
  if (!userId) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_AUTH_REQUIRED, 'Sign in required', 401);
  }
  const db = client(prisma);
  const rows = await db.liveMarketParticipantRegistration.findMany({
    where: {
      userId: String(userId),
      status: LIVE_REGISTRATION_STATUS.REGISTERED,
    },
    orderBy: { registeredAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 50, 1), 100),
    include: {
      session: {
        select: {
          id: true,
          title: true,
          scheduledStartAt: true,
          state: true,
          storefrontPublicationStatus: true,
          sourceLanguage: true,
          viewerLanguages: true,
        },
      },
      store: { select: { id: true, name: true, slug: true } },
    },
  });
  return rows.map((row) =>
    toRegistrationDto(row, {
      session: row.session,
      storeSlug: row.store?.slug,
      storeName: row.store?.name,
    }),
  );
}

/**
 * Owner aggregate — counts only; no emails / questions content / identities.
 * Batch A: joiningCount === registeredCount (Cardbey participants); guestCount always 0.
 */
export async function getRegistrationSummaryForSession({
  prisma,
  storeId,
  sessionId,
} = {}) {
  if (!Features.liveMarket.registrationSummaryV1) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED, 'Registration summary disabled', 403);
  }
  const db = client(prisma);
  const session = await db.liveMarketSession.findFirst({
    where: { id: String(sessionId), storeId: String(storeId) },
    select: { id: true, storeId: true },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'Session not found', 404);
  }

  const rows = await db.liveMarketParticipantRegistration.findMany({
    where: {
      sessionId: session.id,
      storeId: session.storeId,
    },
    select: {
      status: true,
      preferredLanguage: true,
      interestSubjectId: true,
      interestSubjectType: true,
      questionForHost: true,
    },
  });

  const active = rows.filter((r) => r.status === LIVE_REGISTRATION_STATUS.REGISTERED);
  const cancelledCount = rows.filter((r) => r.status === LIVE_REGISTRATION_STATUS.CANCELLED).length;

  /** @type {Record<string, number>} */
  const byLanguage = {};
  /** @type {Record<string, number>} */
  const byInterest = {};
  let questionCount = 0;
  for (const row of active) {
    const lang = normalizeLang(row.preferredLanguage) || 'unknown';
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    if (row.questionForHost && String(row.questionForHost).trim()) questionCount += 1;
    if (row.interestSubjectId) {
      const key = `${row.interestSubjectType || 'ITEM'}:${row.interestSubjectId}`;
      byInterest[key] = (byInterest[key] || 0) + 1;
    }
  }

  const registeredCount = active.length;
  return {
    sessionId: session.id,
    storeId: session.storeId,
    joiningCount: registeredCount,
    registeredCount,
    guestCount: 0,
    cancelledCount,
    preferredLanguageTotals: byLanguage,
    interestTotals: byInterest,
    questionCount,
    label: 'Registered participants',
  };
}

const OWNER_PARTICIPANT_PAGE_MAX = 50;
const OWNER_PARTICIPANT_PAGE_DEFAULT = 20;

function requireHostParticipantsFlag() {
  if (!Features.liveMarket.hostParticipantsV1) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_HOST_PARTICIPANTS_DISABLED,
      'Host participant workspace is disabled',
      403,
    );
  }
}

async function assertHostParticipantsEnrolment(db, storeId) {
  const enrollment = await getEnrollmentForStore(db, storeId);
  if (!enrollment) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_STORE_NOT_ENROLLED,
      'store not enrolled',
      403,
    );
  }
  const state = String(enrollment.state || '');
  if (state !== 'ACTIVE' && state !== 'PAUSED') {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_ENROLLMENT_NOT_ACTIVE,
      'enrolment does not allow host participants',
      403,
    );
  }
  return enrollment;
}

function toOwnerParticipantDto(row, extras = {}) {
  const hasQuestion = !!(row.questionForHost && String(row.questionForHost).trim());
  return {
    id: row.id,
    registrationId: row.id,
    participantType: LIVE_PARTICIPANT_TYPE.ACCOUNT,
    displayName: extras.displayName || 'Participant',
    preferredLanguage: row.preferredLanguage,
    status: row.status,
    registrationStatus: row.status,
    registeredAt: row.registeredAt,
    cancelledAt: row.cancelledAt ?? null,
    hasQuestion,
    question: hasQuestion ? row.questionForHost : null,
    questionForHost: hasQuestion ? row.questionForHost : null,
    questionReviewStatus: hasQuestion
      ? row.questionReviewStatus || LIVE_QUESTION_REVIEW_STATUS.NEW
      : null,
    interestSubjectId: row.interestSubjectId ?? null,
    interestSubjectType: row.interestSubjectType ?? null,
    interestName: extras.interestName ?? null,
    interest:
      row.interestSubjectId != null
        ? {
            subjectId: row.interestSubjectId,
            subjectType: row.interestSubjectType || null,
            publicName: extras.interestName ?? null,
          }
        : null,
  };
}

/**
 * Owner paginated participant list — no email/phone/userId.
 */
export async function listSessionParticipantsForOwner({
  prisma,
  storeId,
  sessionId,
  status = null,
  preferredLanguage = null,
  hasQuestion = null,
  questionReviewStatus = null,
  interestSubjectId = null,
  q = null,
  page = 1,
  pageSize = OWNER_PARTICIPANT_PAGE_DEFAULT,
} = {}) {
  requireHostParticipantsFlag();
  const db = client(prisma);
  await assertHostParticipantsEnrolment(db, storeId);
  const session = await db.liveMarketSession.findFirst({
    where: { id: String(sessionId), storeId: String(storeId) },
    select: { id: true, storeId: true },
  });
  if (!session) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND, 'Session not found', 404);
  }

  const size = Math.min(
    OWNER_PARTICIPANT_PAGE_MAX,
    Math.max(1, Number(pageSize) || OWNER_PARTICIPANT_PAGE_DEFAULT),
  );
  const pageNum = Math.max(1, Number(page) || 1);
  const skip = (pageNum - 1) * size;

  /** @type {Record<string, unknown>} */
  const where = {
    sessionId: session.id,
    storeId: session.storeId,
  };
  if (status && Object.values(LIVE_REGISTRATION_STATUS).includes(String(status).toUpperCase())) {
    where.status = String(status).toUpperCase();
  }
  if (preferredLanguage) {
    where.preferredLanguage = normalizeLang(preferredLanguage);
  }
  if (interestSubjectId) {
    where.interestSubjectId = String(interestSubjectId);
  }
  if (hasQuestion === true || hasQuestion === 'true' || hasQuestion === '1') {
    where.AND = [
      ...(where.AND || []),
      { questionForHost: { not: null } },
      { NOT: { questionForHost: '' } },
    ];
  } else if (hasQuestion === false || hasQuestion === 'false' || hasQuestion === '0') {
    where.OR = [{ questionForHost: null }, { questionForHost: '' }];
  }
  if (
    questionReviewStatus &&
    Object.values(LIVE_QUESTION_REVIEW_STATUS).includes(String(questionReviewStatus).toUpperCase())
  ) {
    where.questionReviewStatus = String(questionReviewStatus).toUpperCase();
  }

  const search = q != null ? String(q).trim().slice(0, 80) : '';
  if (search) {
    where.user = {
      OR: [
        { displayName: { contains: search } },
        { fullName: { contains: search } },
      ],
    };
  }

  const [total, rows] = await Promise.all([
    db.liveMarketParticipantRegistration.count({ where }),
    db.liveMarketParticipantRegistration.findMany({
      where,
      // Active (REGISTERED) before cancelled, then most recently registered.
      orderBy: [{ status: 'desc' }, { registeredAt: 'desc' }, { id: 'desc' }],
      skip,
      take: size,
      select: {
        id: true,
        preferredLanguage: true,
        status: true,
        registeredAt: true,
        cancelledAt: true,
        questionForHost: true,
        questionReviewStatus: true,
        interestSubjectId: true,
        interestSubjectType: true,
        userId: true,
      },
    }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const interestIds = [...new Set(rows.map((r) => r.interestSubjectId).filter(Boolean))];
  const [users, products] = await Promise.all([
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, fullName: true },
        })
      : [],
    interestIds.length
      ? db.product.findMany({
          where: { id: { in: interestIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  const participants = rows.map((row) => {
    const u = userById[row.userId];
    return toOwnerParticipantDto(row, {
      displayName: u?.displayName || u?.fullName || 'Participant',
      interestName: row.interestSubjectId ? productById[row.interestSubjectId]?.name || null : null,
    });
  });

  return {
    sessionId: session.id,
    storeId: session.storeId,
    page: pageNum,
    pageSize: size,
    total,
    participants,
  };
}

/**
 * Owner questions inbox — registrations with non-empty questions.
 */
export async function listSessionQuestionsForOwner({
  prisma,
  storeId,
  sessionId,
  questionReviewStatus = null,
  status = LIVE_REGISTRATION_STATUS.REGISTERED,
  page = 1,
  pageSize = OWNER_PARTICIPANT_PAGE_DEFAULT,
} = {}) {
  return listSessionParticipantsForOwner({
    prisma,
    storeId,
    sessionId,
    status,
    hasQuestion: true,
    questionReviewStatus,
    page,
    pageSize,
  });
}

/**
 * Update question review state (owner). Idempotent. Never stores question text in audit metadata.
 */
export async function updateParticipantQuestionReview({
  prisma,
  storeId,
  sessionId,
  registrationId,
  reviewStatus,
  actorId = null,
} = {}) {
  requireHostParticipantsFlag();
  const next = String(reviewStatus || '').trim().toUpperCase();
  if (!Object.values(LIVE_QUESTION_REVIEW_STATUS).includes(next)) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_QUESTION_REVIEW_INVALID,
      'Invalid question review status',
      400,
    );
  }
  const db = client(prisma);
  await assertHostParticipantsEnrolment(db, storeId);
  const row = await db.liveMarketParticipantRegistration.findFirst({
    where: {
      id: String(registrationId),
      sessionId: String(sessionId),
      storeId: String(storeId),
    },
  });
  if (!row) {
    throw fail(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_NOT_FOUND, 'Registration not found', 404);
  }
  if (!row.questionForHost || !String(row.questionForHost).trim()) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_QUESTION_REVIEW_INVALID,
      'Registration has no question to review',
      400,
    );
  }

  const fromStatus = row.questionReviewStatus || LIVE_QUESTION_REVIEW_STATUS.NEW;
  if (fromStatus === next) {
    const user = await db.user.findUnique({
      where: { id: row.userId },
      select: { displayName: true, fullName: true },
    });
    return {
      participant: toOwnerParticipantDto(row, {
        displayName: user?.displayName || user?.fullName || 'Participant',
      }),
      idempotent: true,
    };
  }

  const transition = assertQuestionReviewTransition(fromStatus, next);
  if (!transition.ok) {
    throw fail(
      LIVE_MARKET_ERROR_CODES.LIVE_QUESTION_REVIEW_INVALID,
      'Invalid question review transition',
      400,
    );
  }

  const updated = await db.liveMarketParticipantRegistration.update({
    where: { id: row.id },
    data: { questionReviewStatus: next },
  });

  await appendLiveMarketAudit({
    prisma: db,
    entityType: 'LiveMarketParticipantRegistration',
    entityId: updated.id,
    action: 'LIVE_PARTICIPANT_QUESTION_REVIEW_CHANGED',
    fromStatus,
    toStatus: next,
    actorId: actorId ? String(actorId) : null,
    reason: LIVE_MARKET_AUDIT_REASONS.PARTICIPANT_QUESTION_REVIEW_CHANGED,
    metadata: {
      sessionId: updated.sessionId,
      storeId: updated.storeId,
      registrationId: updated.id,
      // Intentionally omit question text and contact fields
      hasQuestion: true,
    },
  });

  const user = await db.user.findUnique({
    where: { id: updated.userId },
    select: { displayName: true, fullName: true },
  });

  return {
    participant: toOwnerParticipantDto(updated, {
      displayName: user?.displayName || user?.fullName || 'Participant',
    }),
    idempotent: false,
  };
}

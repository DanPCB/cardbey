/**
 * Live Market HTTP routes — owner, admin, public.
 * All gated by Features.liveMarket.* (master + surface flags).
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, requireStoreOwner, optionalAuth } from '../../middleware/auth.js';
import { Features } from '../../config/features.js';
import { LIVE_MARKET_ERROR_CODES } from './domain.js';
import {
  adminWithdrawSessionStorefront,
  cancelSession,
  createEnrollment,
  createSession,
  endSession,
  getLiveMarketHealth,
  getOwnerLiveMarketStatus,
  getPublicSession,
  getPublicStoreLiveSessionBySlug,
  getSessionForStore,
  listAdminSessions,
  listEnrollments,
  listSessionsForStore,
  prepareSession,
  publishSessionStorefront,
  scheduleSession,
  setSessionSubjects,
  startSession,
  toOwnerSessionDto,
  transitionEnrollment,
  updateSessionDraft,
  withdrawSessionStorefront,
} from './service.js';
import {
  cancelMyRegistration,
  getMyRegistrationForSession,
  getRegistrationSummaryForSession,
  listMyRegistrations,
  listSessionParticipantsForOwner,
  listSessionQuestionsForOwner,
  registerForSession,
  updateMyRegistration,
  updateParticipantQuestionReview,
} from './registration.js';
import { rateLimit } from '../../middleware/rateLimit.js';

function sendError(res, err) {
  const code = err?.code || 'LIVE_MARKET_ERROR';
  const status = err?.status || (code === LIVE_MARKET_ERROR_CODES.LIVE_SESSION_NOT_FOUND ? 404 : 400);
  return res.status(status).json({
    ok: false,
    error: code,
    message: err?.message || code,
  });
}

function requireLiveMarketMaster(req, res, next) {
  if (!Features.liveMarket.v1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market is disabled',
    });
  }
  next();
}

function requireLiveMarketOwner(req, res, next) {
  if (!Features.liveMarket.ownerV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market owner APIs are disabled',
    });
  }
  next();
}

function requireLiveMarketAdmin(req, res, next) {
  if (!Features.liveMarket.adminV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market admin APIs are disabled',
    });
  }
  next();
}

function requireLiveMarketPublic(req, res, next) {
  if (!Features.liveMarket.publicV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market public APIs are disabled',
    });
  }
  next();
}

function requireStorefrontPublish(req, res, next) {
  if (!Features.liveMarket.storefrontPublishV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market storefront publish is disabled',
    });
  }
  next();
}

function requireStorefrontConsume(req, res, next) {
  if (!Features.liveMarket.storefrontConsumeV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_MARKET_DISABLED,
      message: 'Live Market storefront consume is disabled',
    });
  }
  next();
}

function requireRegistration(req, res, next) {
  if (!Features.liveMarket.registrationV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED,
      message: 'Live Market registration is disabled',
    });
  }
  next();
}

function requireRegistrationSummary(req, res, next) {
  if (!Features.liveMarket.registrationSummaryV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED,
      message: 'Live Market registration summary is disabled',
    });
  }
  next();
}

function requireHostParticipants(req, res, next) {
  if (!Features.liveMarket.hostParticipantsV1) {
    return res.status(403).json({
      ok: false,
      error: LIVE_MARKET_ERROR_CODES.LIVE_HOST_PARTICIPANTS_DISABLED,
      message: 'Host participant workspace is disabled',
    });
  }
  next();
}

const registrationMutateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `lm-reg:${req.userId || req.ip || 'anon'}`,
  code: 'live_registration_rate_limited',
});

/** Mount at /api/stores — paths /:storeId/live-market/... and /:storeId/live-sessions... */
export const liveMarketOwnerRoutes = Router({ mergeParams: true });

liveMarketOwnerRoutes.use(requireLiveMarketMaster, requireLiveMarketOwner);

liveMarketOwnerRoutes.get(
  '/:storeId/live-market/status',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const status = await getOwnerLiveMarketStatus({
        storeId: req.params.storeId,
        userId: req.userId,
        enabled: true,
      });
      return res.json({ ok: true, status });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await createSession({
        storeId: req.params.storeId,
        hostUserId: req.userId,
        title: req.body?.title,
        description: req.body?.description,
        sourceLanguage: req.body?.sourceLanguage,
        viewerLanguages: req.body?.viewerLanguages,
        recordingEnabled: req.body?.recordingEnabled,
        automaticReplayPublication: req.body?.automaticReplayPublication,
      });
      return res.status(201).json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.get(
  '/:storeId/live-sessions',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const sessions = await listSessionsForStore({ storeId: req.params.storeId });
      return res.json({ ok: true, sessions: sessions.map(toOwnerSessionDto) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.get(
  '/:storeId/live-sessions/:sessionId',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await getSessionForStore({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.patch(
  '/:storeId/live-sessions/:sessionId',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await updateSessionDraft({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
        patch: req.body || {},
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/schedule',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await scheduleSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
        scheduledStartAt: req.body?.scheduledStartAt,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/prepare',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await prepareSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/start',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await startSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/end',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await endSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
        reasonCode: req.body?.reasonCode,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/cancel',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await cancelSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/publish-storefront',
  requireAuth,
  requireStoreOwner,
  requireStorefrontPublish,
  async (req, res) => {
    try {
      const session = await publishSessionStorefront({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.post(
  '/:storeId/live-sessions/:sessionId/withdraw-storefront',
  requireAuth,
  requireStoreOwner,
  requireStorefrontPublish,
  async (req, res) => {
    try {
      const session = await withdrawSessionStorefront({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.get(
  '/:storeId/live-sessions/:sessionId/registration-summary',
  requireAuth,
  requireStoreOwner,
  requireRegistrationSummary,
  async (req, res) => {
    try {
      const summary = await getRegistrationSummaryForSession({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
      });
      return res.json({ ok: true, summary });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.get(
  '/:storeId/live-sessions/:sessionId/participants',
  requireAuth,
  requireStoreOwner,
  requireHostParticipants,
  async (req, res) => {
    try {
      const result = await listSessionParticipantsForOwner({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        status: req.query.status,
        preferredLanguage: req.query.preferredLanguage || req.query.language,
        hasQuestion: req.query.hasQuestion,
        questionReviewStatus: req.query.questionReviewStatus,
        interestSubjectId: req.query.interestSubjectId,
        q: req.query.q,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.get(
  '/:storeId/live-sessions/:sessionId/questions',
  requireAuth,
  requireStoreOwner,
  requireHostParticipants,
  async (req, res) => {
    try {
      const result = await listSessionQuestionsForOwner({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        questionReviewStatus: req.query.questionReviewStatus,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      return res.json({
        ok: true,
        sessionId: result.sessionId,
        storeId: result.storeId,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        questions: result.participants,
      });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.patch(
  '/:storeId/live-sessions/:sessionId/participants/:registrationId/question-review',
  requireAuth,
  requireStoreOwner,
  requireHostParticipants,
  async (req, res) => {
    try {
      const result = await updateParticipantQuestionReview({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        registrationId: req.params.registrationId,
        reviewStatus: req.body?.status ?? req.body?.reviewStatus ?? req.body?.questionReviewStatus,
        actorId: req.userId,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketOwnerRoutes.put(
  '/:storeId/live-sessions/:sessionId/subjects',
  requireAuth,
  requireStoreOwner,
  async (req, res) => {
    try {
      const session = await setSessionSubjects({
        storeId: req.params.storeId,
        sessionId: req.params.sessionId,
        hostUserId: req.userId,
        subjects: req.body?.subjects ?? req.body,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

/** Mount at /api/admin/live-market */
export const liveMarketAdminRoutes = Router({ mergeParams: true });

liveMarketAdminRoutes.use(requireLiveMarketMaster, requireLiveMarketAdmin, requireAuth, requireAdmin);

liveMarketAdminRoutes.get('/enrollments', async (req, res) => {
  try {
    const enrollments = await listEnrollments({ state: req.query.state });
    return res.json({ ok: true, enrollments });
  } catch (err) {
    return sendError(res, err);
  }
});

liveMarketAdminRoutes.post('/enrollments', async (req, res) => {
  try {
    const enrollment = await createEnrollment({
      storeId: req.body?.storeId,
      actorId: req.userId,
      state: req.body?.state,
      allowedSourceLanguages: req.body?.allowedSourceLanguages,
      allowedTargetLanguages: req.body?.allowedTargetLanguages,
      recordingAllowed: req.body?.recordingAllowed,
      automaticReplayPublication: req.body?.automaticReplayPublication,
      approvedHostUserIds: req.body?.approvedHostUserIds,
      maxSessionDurationMinutes: req.body?.maxSessionDurationMinutes,
    });
    return res.status(201).json({ ok: true, enrollment });
  } catch (err) {
    return sendError(res, err);
  }
});

liveMarketAdminRoutes.patch('/enrollments/:enrollmentId', async (req, res) => {
  try {
    const toState = req.body?.state || req.body?.toState;
    if (!toState) {
      return res.status(400).json({
        ok: false,
        error: LIVE_MARKET_ERROR_CODES.LIVE_INVALID_TRANSITION,
        message: 'state required',
      });
    }
    const enrollment = await transitionEnrollment({
      enrollmentId: req.params.enrollmentId,
      toState,
      actorId: req.userId,
    });
    return res.json({ ok: true, enrollment });
  } catch (err) {
    return sendError(res, err);
  }
});

liveMarketAdminRoutes.get('/sessions', async (req, res) => {
  try {
    const sessions = await listAdminSessions({
      storeId: req.query.storeId,
      state: req.query.state,
    });
    return res.json({
      ok: true,
      sessions: sessions.map((s) => ({
        ...toOwnerSessionDto(s),
        store: s.store,
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

liveMarketAdminRoutes.get('/health', async (_req, res) => {
  return res.json(getLiveMarketHealth());
});

liveMarketAdminRoutes.post(
  '/sessions/:sessionId/withdraw-storefront',
  async (req, res) => {
    try {
      const session = await adminWithdrawSessionStorefront({
        sessionId: req.params.sessionId,
        actorId: req.userId,
      });
      return res.json({ ok: true, session: toOwnerSessionDto(session) });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

/** Mount at /api/public/live-market */
export const liveMarketPublicRoutes = Router({ mergeParams: true });

liveMarketPublicRoutes.use(requireLiveMarketMaster, requireLiveMarketPublic, optionalAuth);

liveMarketPublicRoutes.get('/sessions/:sessionId', requireStorefrontConsume, async (req, res) => {
  try {
    const session = await getPublicSession({
      sessionId: req.params.sessionId,
      userId: req.userId || null,
    });
    return res.json({ ok: true, session });
  } catch (err) {
    return sendError(res, err);
  }
});

liveMarketPublicRoutes.get('/stores/:slug/live-session', requireStorefrontConsume, async (req, res) => {
  try {
    const session = await getPublicStoreLiveSessionBySlug({
      slug: req.params.slug,
      userId: req.userId || null,
    });
    return res.json({ ok: true, session: session || null });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * Participant registration APIs — mount at /api/live-market
 * Auth required for mutations; never calls Cloudflare.
 */
export const liveMarketParticipantRoutes = Router({ mergeParams: true });

liveMarketParticipantRoutes.use(requireLiveMarketMaster, requireRegistration);

liveMarketParticipantRoutes.post(
  '/sessions/:sessionId/registrations',
  requireAuth,
  registrationMutateLimit,
  async (req, res) => {
    try {
      const result = await registerForSession({
        sessionId: req.params.sessionId,
        userId: req.userId,
        preferredLanguage: req.body?.preferredLanguage,
        questionForHost: req.body?.questionForHost,
        interestSubjectId: req.body?.interestSubjectId,
        interestSubjectType: req.body?.interestSubjectType,
        surface: req.body?.surface || req.query?.surface || null,
      });
      return res.status(result.created ? 201 : 200).json({
        ok: true,
        registration: result.registration,
        created: result.created,
        idempotent: result.idempotent,
      });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketParticipantRoutes.get(
  '/sessions/:sessionId/registration/me',
  requireAuth,
  async (req, res) => {
    try {
      const registration = await getMyRegistrationForSession({
        sessionId: req.params.sessionId,
        userId: req.userId,
      });
      return res.json({ ok: true, registration });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketParticipantRoutes.patch(
  '/sessions/:sessionId/registration/me',
  requireAuth,
  registrationMutateLimit,
  async (req, res) => {
    try {
      const result = await updateMyRegistration({
        sessionId: req.params.sessionId,
        userId: req.userId,
        preferredLanguage: req.body?.preferredLanguage,
        questionForHost: req.body?.questionForHost,
        interestSubjectId: req.body?.interestSubjectId,
        interestSubjectType: req.body?.interestSubjectType,
      });
      return res.json({ ok: true, registration: result.registration });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

liveMarketParticipantRoutes.delete(
  '/sessions/:sessionId/registration/me',
  requireAuth,
  registrationMutateLimit,
  async (req, res) => {
    try {
      const registration = await cancelMyRegistration({
        sessionId: req.params.sessionId,
        userId: req.userId,
        surface: req.query?.surface || null,
      });
      return res.json({ ok: true, registration });
    } catch (err) {
      return sendError(res, err);
    }
  },
);

/** Mount at /api/me/live-market */
export const liveMarketMeRoutes = Router({ mergeParams: true });

liveMarketMeRoutes.use(requireLiveMarketMaster, requireRegistration, requireAuth);

liveMarketMeRoutes.get('/registrations', async (req, res) => {
  try {
    const registrations = await listMyRegistrations({
      userId: req.userId,
      limit: req.query?.limit,
    });
    return res.json({ ok: true, registrations });
  } catch (err) {
    return sendError(res, err);
  }
});

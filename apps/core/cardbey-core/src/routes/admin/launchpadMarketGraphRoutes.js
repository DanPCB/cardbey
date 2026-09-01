/**
 * Launchpad Market Graph / Capital Resource Network APIs.
 * Admin-only. No outreach. No capital commitments.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../services/reliability/rateLimitMiddleware.js';
import { safeJson } from '../../middleware/requestResponseState.js';
import {
  launchpadPersistentMarketGraph,
} from '../../lib/marketIntent/capital/persistentMarketGraphStore.js';
import {
  admitCapitalMissionAndCohort,
  buildCapitalCampaignHandoff,
  calibrateCardbeySeedAgainstCohort,
} from '../../lib/marketIntent/capital/capitalResourceNetworkService.js';
import { getCardbeySeed2026MissionRecord } from '../../lib/marketIntent/capital/cardbeySeed2026Mission.js';
import { evaluateReciprocalMatchPair } from '../../lib/marketIntent/evaluateReciprocalMatch.js';
import { buildQualifiedCapitalOpportunity } from '../../lib/marketIntent/capital/qualifyCapitalPair.js';
import { buildCardbeySeed2026SeekerProfile } from '../../lib/marketIntent/capital/cardbeySeed2026Mission.js';
import {
  MATCH_CONNECTION_EVENT_TYPES,
} from '../../lib/marketIntent/matchReviewContracts.js';
import {
  buildPilotReviewStats,
  listConnectionEvents,
  listMatchReviews,
  recordConnectionFunnelEvent,
  submitMatchReview,
} from '../../lib/marketIntent/matchReviewService.js';
import { buildExchangeRoleContext } from '../../lib/marketIntent/marketMatchCandidateRetrieval.js';
import { buildOperatorMatchPresentation } from '../../lib/marketIntent/operatorMatchPresentation.js';
import { buildExecutiveMarketOpportunitiesProjection } from '../../lib/marketIntent/marketOpportunitiesExecutiveProjection.js';

const router = Router();

const listRateLimit = rateLimitMiddleware({
  endpoint: '/api/admin/launchpad',
  windowMs: 60_000,
  maxRequests: 60,
  perUser: true,
});

router.use(requireAuth, requireAdmin, listRateLimit);

function explainMatch(match) {
  const presentation = buildOperatorMatchPresentation(match);
  const mapOverlaps = (items) =>
    (items || []).map((o) => ({
      want: o.wantLabel || o.wantType,
      has: o.hasLabel || o.hasType,
      strength: o.strength,
      reason: o.reason,
    }));

  const demandNodeId = presentation.demandNodeId;
  const supplyNodeId = presentation.supplyNodeId;
  const demandIsA = match.nodeA?.nodeId === demandNodeId;

  const legacyCompanyWants =
    demandIsA ? mapOverlaps(match.aNeedsFromB) : mapOverlaps(match.bNeedsFromA);
  const legacyInvestorWants =
    demandIsA ? mapOverlaps(match.bNeedsFromA) : mapOverlaps(match.aNeedsFromB);

  return {
    reciprocalBand: match.reciprocalBand,
    /** @deprecated use operatorPresentation — kept for backward compatibility */
    companyWantsInvestorHas: legacyCompanyWants,
    /** @deprecated use operatorPresentation */
    investorWantsCompanyHas: legacyInvestorWants,
    operatorPresentation: presentation,
    geographicFit: match.geographicFit,
    constraintFit: match.constraintFit,
    timingFit: match.timingFit,
    evidenceConfidence: match.evidenceConfidence,
    compatibleNotes: match.matchReasons,
    contradictions: match.conflicts,
    unknowns: match.unknowns,
    matcherVersion: match.matcherVersion,
  };
}

/** GET /api/admin/launchpad/nodes — Supply / Demand list */
router.get('/nodes', async (req, res) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const exchange = req.query.exchange === 'CAPITAL' ? 'CAPITAL' : undefined;
    const exchangeRole =
      req.query.exchangeRole === 'SUPPLY' || req.query.exchangeRole === 'DEMAND'
        ? req.query.exchangeRole
        : undefined;
    const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
    const resourceType = typeof req.query.resourceType === 'string' ? req.query.resourceType : undefined;
    const geography = typeof req.query.geography === 'string' ? req.query.geography : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await launchpadPersistentMarketGraph.listNodes({
      role: role,
      exchange,
      exchangeRole,
      domain,
      resourceType,
      geography,
      limit,
      offset,
    });
    const items = result.items.map((n) => {
      const exchangeCtx = buildExchangeRoleContext(n);
      return {
      nodeId: n.nodeId,
      label: n.label,
      actorRole: n.actorRole,
      contextualRole: n.contextualRole,
      exchangeRole: exchangeCtx.role,
      exchangeRoleLabel: exchangeCtx.roleLabel,
      nodeFacets: exchangeCtx.nodeFacets,
      marketSide: n.marketSide,
      domain: n.domain ?? null,
      resourceType: n.resourceType ?? null,
      hasSummary: (n.has || []).slice(0, 5).map((h) => ({ type: h.type, label: h.label, basis: h.basis })),
      wantsSummary: (n.wants || []).slice(0, 5).map((w) => ({ type: w.type, label: w.label, basis: w.basis })),
      geography: n.geographyLabels,
      constraints: n.constraints,
      evidenceConfidence: n.evidenceConfidence,
      freshnessAt: n.freshnessAt ?? n.updatedAt,
      sourceType: n.sourceType ?? null,
      sourceRef: n.sourceRef ?? null,
      contextSummary: n.contextSummary ?? null,
    };
    });
    return safeJson(res, 200, { ok: true, total: result.total, limit, offset, items }, req);
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'list_nodes_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/nodes/:nodeId */
router.get('/nodes/:nodeId', async (req, res) => {
  try {
    const node = await launchpadPersistentMarketGraph.getNode(req.params.nodeId);
    if (!node) {
      return safeJson(res, 404, { ok: false, error: 'node_not_found' }, req);
    }
    return safeJson(
      res,
      200,
      {
        ok: true,
        node,
        provenance: node.provenance ?? null,
        evidenceRefs: node.evidenceRefs ?? node.capitalProfile?.evidenceRefs ?? null,
        capitalProfile: node.capitalProfile ?? null,
      },
      req,
    );
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'get_node_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/matches */
router.get('/matches', async (req, res) => {
  try {
    const band = typeof req.query.band === 'string' ? req.query.band : undefined;
    const reviewState = typeof req.query.reviewState === 'string' ? req.query.reviewState : undefined;
    const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : undefined;
    const stale =
      req.query.stale === 'true' ? true : req.query.stale === 'false' ? false : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const eligibleOnly = req.query.eligibleOnly !== 'false';
    const result = await launchpadPersistentMarketGraph.listMatches({
      band,
      reviewState,
      nodeId,
      stale,
      eligibleOnly,
      limit,
      offset,
    });
    const items = result.items.map((m) => ({
      pairKey: m.pairKey,
      nodeAId: m.nodeAId,
      nodeBId: m.nodeBId,
      reciprocalBand: m.reciprocalBand,
      reviewState: m.reviewState,
      isStale: m.isStale,
      computedAt: m.computedAt,
      explanation: explainMatch(m.match),
      capitalQualification: m.capitalQualification ?? null,
      actions: {
        review: { available: true, requiresConfirmation: true },
        admitToFundraisingCampaign: {
          available: Boolean(
            m.capitalQualification &&
              ['QUALIFIED', 'PARTIAL', 'REVIEW_REQUIRED'].includes(m.capitalQualification.band),
          ),
          requiresConfirmation: true,
          conceptualOnly: true,
        },
      },
    }));
    return safeJson(res, 200, { ok: true, total: result.total, limit, offset, items }, req);
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'list_matches_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/executive/market-opportunities — read-only executive summary */
router.get('/executive/market-opportunities', async (req, res) => {
  try {
    const projection = await buildExecutiveMarketOpportunitiesProjection();
    return safeJson(res, 200, { ok: true, projection }, req);
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'executive_projection_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/matches/review/pilot-stats */
router.get('/matches/review/pilot-stats', (req, res) => {
  return safeJson(
    res,
    200,
    {
      ok: true,
      pilot: 'CARDBEY_MARKET_MATCH_LIVE_REVIEW_PILOT_V1',
      stats: buildPilotReviewStats(),
      sends: false,
      externalContact: false,
    },
    req,
  );
});

/** GET /api/admin/launchpad/matches/:pairKey/reviews */
router.get('/matches/:pairKey/reviews', async (req, res) => {
  try {
    const pairKey = decodeURIComponent(req.params.pairKey);
    return safeJson(
      res,
      200,
      {
        ok: true,
        pairKey,
        reviews: listMatchReviews(pairKey),
        connectionEvents: listConnectionEvents(pairKey),
      },
      req,
    );
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'list_reviews_failed', message: e.message }, req);
  }
});

/** POST /api/admin/launchpad/matches/:pairKey/review — operator market truth */
router.post('/matches/:pairKey/review', async (req, res) => {
  try {
    const parsed = z
      .object({
        confirm: z.literal(true),
        decision: z.enum(['PURSUE', 'WATCH', 'REJECT', 'INSUFFICIENT_EVIDENCE']),
        reason: z
          .enum([
            'GOOD_RECIPROCAL_FIT',
            'WRONG_NEED',
            'WRONG_GEOGRAPHY',
            'WRONG_SCALE',
            'STALE_DEMAND',
            'COMMERCIAL_TERMS_UNKNOWN',
            'WEAK_COUNTERPARTY_EVIDENCE',
            'DUPLICATE',
            'NOT_ACTIONABLE',
            'OTHER',
          ])
          .optional()
          .nullable(),
        note: z.string().max(2000).optional().nullable(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return safeJson(res, 400, { ok: false, error: 'invalid_review_request' }, req);
    }
    const pairKey = decodeURIComponent(req.params.pairKey);
    const result = await submitMatchReview({
      pairKey,
      decision: parsed.data.decision,
      reason: parsed.data.reason ?? null,
      note: parsed.data.note ?? null,
      reviewerId: req.user?.id || null,
      confirmed: true,
    });
    if (result.requiresConfirmation) {
      return safeJson(res, 400, result, req);
    }
    return safeJson(res, result.ok ? 200 : 400, result, req);
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'review_failed', message: e.message }, req);
  }
});

/** POST /api/admin/launchpad/matches/:pairKey/connection-events — governed funnel only */
router.post('/matches/:pairKey/connection-events', async (req, res) => {
  try {
    const parsed = z
      .object({
        confirm: z.literal(true),
        eventType: z.enum([
          'MATCH_REVIEWED',
          'MATCH_PURSUED',
          'CONNECTION_PREPARED',
          'CONNECTION_APPROVED',
          'CONNECTION_PRESENTED',
          'CONNECTION_SENT',
          'RESPONSE_RECEIVED',
          'CONVERSATION_STARTED',
          'QUALIFIED',
          'CONNECTED',
          'OUTCOME_RECORDED',
        ]),
        stageState: z.enum(['RECORDED', 'UNKNOWN']).optional(),
        payload: z.record(z.any()).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return safeJson(res, 400, { ok: false, error: 'invalid_connection_event' }, req);
    }
    const pairKey = decodeURIComponent(req.params.pairKey);
    const result = await recordConnectionFunnelEvent({
      pairKey,
      eventType: parsed.data.eventType,
      stageState: parsed.data.stageState,
      payload: parsed.data.payload,
      actorId: req.user?.id || null,
      confirmed: true,
    });
    if (result.requiresConfirmation) {
      return safeJson(res, 400, result, req);
    }
    return safeJson(res, result.ok ? 200 : 400, result, req);
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'connection_event_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/matches/:pairKey */
router.get('/matches/:pairKey', async (req, res) => {
  try {
    const pairKey = decodeURIComponent(req.params.pairKey);
    const result = await launchpadPersistentMarketGraph.listMatches({ limit: 200 });
    const found = result.items.find((m) => m.pairKey === pairKey);
    if (!found) {
      return safeJson(res, 404, { ok: false, error: 'match_not_found' }, req);
    }
    const nodeA = await launchpadPersistentMarketGraph.getNode(found.nodeAId);
    const nodeB = await launchpadPersistentMarketGraph.getNode(found.nodeBId);
    return safeJson(
      res,
      200,
      {
        ok: true,
        match: found,
        explanation: explainMatch(found.match),
        nodeA,
        nodeB,
        capitalQualification: found.capitalQualification ?? null,
        disclaimer:
          'Compatibility is evidence-based and re-evaluable. This is not a funding guarantee or investment probability.',
      },
      req,
    );
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'get_match_failed', message: e.message }, req);
  }
});

/** GET /api/admin/launchpad/capital/mission/cardbey-seed-2026 */
router.get('/capital/mission/cardbey-seed-2026', (req, res) => {
  return safeJson(res, 200, { ok: true, mission: getCardbeySeed2026MissionRecord() }, req);
});

/** GET /api/admin/launchpad/capital/calibration */
router.get('/capital/calibration', (req, res) => {
  const result = calibrateCardbeySeedAgainstCohort();
  return safeJson(
    res,
    200,
    {
      ok: true,
      disclaimer:
        'Calibration only. No outreach. No hard-coded outcomes. Not a prediction of investment.',
      ...result,
    },
    req,
  );
});

/** POST /api/admin/launchpad/capital/admit-cohort — research graph load */
router.post('/capital/admit-cohort', async (req, res) => {
  try {
    const body = z
      .object({
        confirm: z.literal(true),
        replace: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return safeJson(
        res,
        400,
        { ok: false, error: 'confirmation_required', message: 'confirm:true required' },
        req,
      );
    }
    const result = await admitCapitalMissionAndCohort({ replace: body.data.replace ?? true });
    return safeJson(
      res,
      200,
      {
        ok: true,
        message: 'Mission and investor cohort admitted to market graph (research only — no outreach)',
        ...result,
      },
      req,
    );
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'admit_failed', message: e.message }, req);
  }
});

/** POST /api/admin/launchpad/capital/handoff/prepare — typed handoff contract only */
router.post('/capital/handoff/prepare', async (req, res) => {
  try {
    const parsed = z
      .object({
        companyNodeId: z.string().min(1),
        investorNodeId: z.string().min(1),
        confirmReview: z.literal(true),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return safeJson(res, 400, { ok: false, error: 'invalid_handoff_request' }, req);
    }
    const company = await launchpadPersistentMarketGraph.getNode(parsed.data.companyNodeId);
    const investor = await launchpadPersistentMarketGraph.getNode(parsed.data.investorNodeId);
    if (!company || !investor) {
      return safeJson(res, 404, { ok: false, error: 'nodes_not_found' }, req);
    }
    const reciprocal = evaluateReciprocalMatchPair(company, investor);
    const opportunity = buildQualifiedCapitalOpportunity({
      companyNode: company,
      investorNode: investor,
      reciprocal,
      companyProfile: buildCardbeySeed2026SeekerProfile(),
      investorProfile: investor.capitalProfile || {
        domain: 'CAPITAL',
        actorKind: 'CAPITAL_PROVIDER',
        stages: [],
        geographies: [],
        themes: [],
        canLead: null,
        chequeMinAud: null,
        chequeMaxAud: null,
        investorType: null,
        unknownFields: ['cheque_min', 'cheque_max', 'stage_exclusions', 'ownership_expectations', 'lead_follow', 'sector_detail', 'portfolio_conflicts'],
        evidenceRefs: [],
        sourceFacts: [],
        interpretations: [],
      },
    });
    const handoff = buildCapitalCampaignHandoff({ opportunity });
    return safeJson(
      res,
      200,
      {
        ok: true,
        message: 'Handoff prepared for human review — does not create CRM records or contact anyone',
        opportunity,
        handoff,
      },
      req,
    );
  } catch (e) {
    return safeJson(res, 500, { ok: false, error: 'handoff_failed', message: e.message }, req);
  }
});

export default router;

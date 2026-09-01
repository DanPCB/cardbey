/**
 * Fundraising Campaign V1 APIs — admin only.
 * No mailbox, no external contact, no document sharing.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { rateLimitMiddleware } from '../../services/reliability/rateLimitMiddleware.js';
import { safeJson } from '../../middleware/requestResponseState.js';
import {
  admitCatalogInvestorToCampaign,
  admitFromCapitalHandoff,
  approveOutreachDraft,
  bumpDocumentVersion,
  createOutreachDraft,
  ensureCardbeySeed2026Campaign,
  ensureFundraisingHydrated,
  getCampaignOverview,
  getTarget,
  getWave0HumanReviewCohort,
  listDocuments,
  listEvents,
  listGapsForTarget,
  listTargets,
  recordInvestorQuestion,
  resolveResearchGap,
  setCampaignState,
  transitionTargetLifecycle,
} from '../../lib/fundraisingCampaign/fundraisingCampaignService.js';
import { FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026 } from '../../lib/fundraisingCampaign/fundraisingCampaignContracts.js';
import { classifySuitcaseArtifact } from '../../lib/fundraisingCampaign/campaignPrepContent.js';
import {
  buildWave0ReviewTable,
  resolveResearchGapAndReevaluate,
  runWave0InternalRehearsal,
} from '../../lib/fundraisingCampaign/wave0Operationalization.js';

const router = Router();

router.use(
  requireAuth,
  requireAdmin,
  rateLimitMiddleware({
    endpoint: '/api/admin/fundraising',
    windowMs: 60_000,
    maxRequests: 60,
    perUser: true,
  }),
);

async function withHydrate(_req, _res, next) {
  try {
    await ensureFundraisingHydrated();
    next();
  } catch (err) {
    next(err);
  }
}

router.use(withHydrate);

router.get('/campaigns/cardbey-seed-2026', (req, res) => {
  ensureCardbeySeed2026Campaign({ ownerUserId: req.user?.id || null });
  return safeJson(res, 200, { ok: true, overview: getCampaignOverview() }, req);
});

router.get('/campaigns/cardbey-seed-2026/wave0-cohort', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 12;
  return safeJson(res, 200, { ok: true, ...getWave0HumanReviewCohort(limit) }, req);
});

router.get('/campaigns/cardbey-seed-2026/wave0-review', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 12;
  return safeJson(res, 200, { ok: true, rows: buildWave0ReviewTable(limit), sends: false }, req);
});

router.post('/campaigns/cardbey-seed-2026/wave0-rehearsal', async (req, res) => {
  const parsed = z
    .object({
      catalogId: z.string().optional(),
      resetMemory: z.boolean().optional(),
      confirmInternalOnly: z.literal(true),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'confirmInternalOnly_required' }, req);
  }
  const result = await runWave0InternalRehearsal({
    catalogId: parsed.data.catalogId,
    resetMemory: parsed.data.resetMemory,
  });
  return safeJson(res, result.ok ? 200 : 400, { ...result, externalContact: false, sends: false }, req);
});

router.get('/campaigns/cardbey-seed-2026/targets', (req, res) => {
  ensureCardbeySeed2026Campaign();
  const targets = listTargets().map((t) => ({
    id: t.id,
    catalogId: t.catalogId,
    investorName: t.investorName,
    lifecycle: t.lifecycle,
    assessments: t.assessmentsJson,
    unresolvedGaps: t.unresolvedGapsJson,
    admittedAt: t.admittedAt,
    dossier: t.dossierJson,
  }));
  return safeJson(res, 200, { ok: true, targets }, req);
});

router.get('/campaigns/cardbey-seed-2026/targets/:targetId', (req, res) => {
  const target = getTarget(req.params.targetId);
  if (!target) return safeJson(res, 404, { ok: false, error: 'target_not_found' }, req);
  return safeJson(
    res,
    200,
    {
      ok: true,
      target,
      researchGaps: listGapsForTarget(target.id),
      assessmentsSeparate: {
        reciprocal: target.assessmentsJson?.reciprocal,
        capitalQualification: target.assessmentsJson?.capitalQualification,
        investorFit: target.assessmentsJson?.investorFit,
        note: 'Three assessment systems — never merged into one score',
      },
    },
    req,
  );
});

router.get('/campaigns/cardbey-seed-2026/documents', (req, res) => {
  ensureCardbeySeed2026Campaign();
  const documents = listDocuments().map((d) => ({
    ...d,
    artifactReadiness: classifySuitcaseArtifact(d),
  }));
  return safeJson(
    res,
    200,
    {
      ok: true,
      documents,
      externalShareBlocked: true,
      note: 'Registry placeholder ≠ READY artifact',
    },
    req,
  );
});

router.get('/campaigns/cardbey-seed-2026/events', (req, res) => {
  ensureCardbeySeed2026Campaign();
  return safeJson(res, 200, { ok: true, events: listEvents() }, req);
});

router.post('/campaigns/cardbey-seed-2026/investor-questions', (req, res) => {
  const parsed = z
    .object({
      category: z.string().min(1),
      question: z.string().min(1),
      answerState: z.enum(['ANSWERED', 'PARTIAL', 'EVIDENCE_NEEDED', 'NOT_YET_APPLICABLE']),
      answerDraft: z.string().optional().nullable(),
      evidenceNeeded: z.string().optional().nullable(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'invalid_question' }, req);
  }
  const result = recordInvestorQuestion({
    ...parsed.data,
    actorId: req.user?.id || null,
  });
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

router.post('/campaigns/cardbey-seed-2026/state', (req, res) => {
  const parsed = z
    .object({ state: z.enum(['PREPARING', 'ACTIVE', 'PAUSED', 'CLOSED']), confirm: z.literal(true) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'confirmation_required' }, req);
  }
  const campaign = ensureCardbeySeed2026Campaign();
  const result = setCampaignState(campaign.id, parsed.data.state, req.user?.id || null);
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

/** Admit from catalog with confirmation — builds capital handoff internally */
router.post('/campaigns/cardbey-seed-2026/admit', (req, res) => {
  const parsed = z
    .object({
      catalogId: z.string().min(1),
      confirmed: z.boolean().default(false),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'invalid_request' }, req);
  }
  const result = admitCatalogInvestorToCampaign({
    catalogId: parsed.data.catalogId,
    confirmed: parsed.data.confirmed,
    admittingOperatorId: req.user?.id || null,
  });
  if (result.requiresConfirmation) {
    return safeJson(res, 400, result, req);
  }
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

/** Consume ADMIT_TO_FUNDRAISING_CAMPAIGN_V1 handoff payload */
router.post('/campaigns/cardbey-seed-2026/admit-handoff', (req, res) => {
  const parsed = z
    .object({
      catalogId: z.string().min(1),
      confirmed: z.boolean().default(false),
      handoff: z.object({
        kind: z.literal('ADMIT_TO_FUNDRAISING_CAMPAIGN_V1'),
        companyNodeId: z.string(),
        investorNodeId: z.string(),
        fundraisingObjectiveId: z.string(),
        evidenceRefs: z.array(z.any()).optional().default([]),
        reciprocalBand: z.string(),
        capitalQualificationBand: z.string(),
        unresolvedGaps: z.array(z.string()).optional().default([]),
        sourceProvenance: z.record(z.any()).optional().default({}),
        preparedAt: z.string(),
        requiresHumanConfirmation: z.literal(true),
      }),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'invalid_handoff', details: parsed.error.issues }, req);
  }
  const result = admitFromCapitalHandoff({
    handoff: parsed.data.handoff,
    catalogId: parsed.data.catalogId,
    confirmed: parsed.data.confirmed,
    admittingOperatorId: req.user?.id || null,
    markMatchReviewed: true,
  });
  if (result.requiresConfirmation) {
    return safeJson(res, 400, result, req);
  }
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

router.post('/targets/:targetId/lifecycle', (req, res) => {
  const parsed = z
    .object({
      to: z.string().min(1),
      reason: z.string().optional(),
      confirm: z.literal(true),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'confirmation_required' }, req);
  }
  const result = transitionTargetLifecycle({
    targetId: req.params.targetId,
    to: parsed.data.to,
    actorId: req.user?.id || null,
    reason: parsed.data.reason,
  });
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

router.post('/research-gaps/:gapId/resolve', async (req, res) => {
  const parsed = z
    .object({
      evidenceKind: z.enum(['SOURCE_FACT', 'AI_INTERPRETATION']),
      summary: z.string().min(1),
      sourceUrl: z.string().url().optional().nullable(),
      reevaluate: z.boolean().optional().default(true),
      fieldUpdates: z
        .object({
          chequeMinAud: z.number().nullable().optional(),
          chequeMaxAud: z.number().nullable().optional(),
          keepUnknownCheque: z.boolean().optional(),
          stages: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'invalid_resolution' }, req);
  }
  if (parsed.data.reevaluate) {
    const result = await resolveResearchGapAndReevaluate({
      gapId: req.params.gapId,
      resolution: {
        evidenceKind: parsed.data.evidenceKind,
        summary: parsed.data.summary,
        sourceUrl: parsed.data.sourceUrl,
        fieldUpdates: parsed.data.fieldUpdates,
      },
      actorId: req.user?.id || null,
    });
    return safeJson(res, result.ok ? 200 : 400, result, req);
  }
  const result = resolveResearchGap({
    gapId: req.params.gapId,
    resolution: parsed.data,
    actorId: req.user?.id || null,
  });
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

router.post('/targets/:targetId/outreach-drafts', (req, res) => {
  const parsed = z
    .object({
      draftType: z.enum([
        'introduction_request',
        'initial_investor_email',
        'follow_up',
        'meeting_brief',
        'investor_pitch_notes',
      ]),
      bodyText: z.string().optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'invalid_draft' }, req);
  }
  const result = createOutreachDraft({
    targetId: req.params.targetId,
    draftType: parsed.data.draftType,
    bodyText: parsed.data.bodyText,
    actorId: req.user?.id || null,
  });
  return safeJson(res, result.ok ? 200 : 400, { ...result, sends: false }, req);
});

router.post('/outreach-drafts/:draftId/approve', (req, res) => {
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    return safeJson(res, 400, { ok: false, error: 'confirmation_required' }, req);
  }
  const result = approveOutreachDraft({
    draftId: req.params.draftId,
    actorId: req.user?.id || null,
  });
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

router.post('/documents/:documentId/version', (req, res) => {
  const parsed = z
    .object({ evidenceStatus: z.string().optional() })
    .safeParse(req.body ?? {});
  const result = bumpDocumentVersion({
    documentId: req.params.documentId,
    evidenceStatus: parsed.success ? parsed.data.evidenceStatus : undefined,
  });
  return safeJson(res, result.ok ? 200 : 400, result, req);
});

export default router;
export { FUNDRAISING_CAMPAIGN_KEY_CARDBEY_SEED_2026 };

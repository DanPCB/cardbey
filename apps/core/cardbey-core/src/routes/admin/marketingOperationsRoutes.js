/**
 * Shared Marketing Operations admin routes (above Facebook operator).
 * Mounted at /api/admin. Live Meta is never triggered here.
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { Features } from '../../config/features.js';
import { PERMISSIONS, requireMarketingPermission } from '../../services/marketingOperator/permissions.js';
import { MarketingRepoError } from '../../services/marketingOperator/repository.js';
import {
  createObjective,
  getMarketingOperationsOverview,
  injectTestInteraction,
  listInboxInteractions,
  listObjectives,
  updateInboxStatus,
  classifyInboxInteraction,
  confirmInboxIntent,
  generateInboxSuggestion,
  editInboxSuggestion,
  approveInboxReply,
  rejectInboxSuggestion,
  runObjectiveResearch,
  listResearchTasks,
  listResearchOpportunities,
  getResearchOpportunity,
  reviewOpportunity,
  approveOpportunity,
  rejectOpportunity,
  archiveOpportunity,
  prepareCampaignFromOpportunity,
  ensurePilotResearchObjectives,
  getCampaignProposal,
  listCampaignProposals,
  patchCampaignProposal,
  submitCampaignProposal,
  approveCampaignProposal,
  reviseCampaignProposal,
  getCampaignProposalReadiness,
  listInvestorEngagements,
  getInvestorEngagement,
  prepareInvestorProfile,
  prepareInvestorOutreachPack,
  approveInvestorHandoff,
  reviseInvestorHandoff,
  rejectInvestorHandoff,
  revokeInvestorAccess,
  recordManualInvestorEvent,
} from '../../services/marketingOperations/index.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function requireOperatorEnabled(req, res, next) {
  if (!Features.marketingOperator.v1) {
    return res.status(403).json({ ok: false, error: 'marketing_operator_disabled' });
  }
  return next();
}

router.use(requireOperatorEnabled);

function handleError(res, err) {
  if (err instanceof MarketingRepoError) {
    return res.status(503).json({ ok: false, error: err.code, message: err.message });
  }
  console.error('[marketingOperationsRoutes]', err?.message || err);
  return res.status(500).json({ ok: false, error: 'internal_error' });
}

router.get(
  '/marketing/operations/overview',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (_req, res) => {
    try {
      const overview = await getMarketingOperationsOverview();
      return res.json(overview);
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/objectives',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const objectives = await listObjectives({
        status: req.query.status,
        targetType: req.query.targetType,
        take: req.query.take,
      });
      return res.json({ ok: true, objectives });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/objectives',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const objective = await createObjective(req.body || {}, { actorId: req.user?.id || null });
      return res.status(201).json({ ok: true, objective });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/inbox',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await listInboxInteractions({
        status: req.query.status,
        campaignId: req.query.campaignId,
        interactionType: req.query.interactionType,
        provider: req.query.provider,
        take: req.query.take,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/test-inject',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await injectTestInteraction(req.body || {}, { actorId: req.user?.id || null });
      return res.status(result.ok ? 201 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/review',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await updateInboxStatus(req.params.id, 'REVIEWED', {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/dismiss',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await updateInboxStatus(req.params.id, 'DISMISSED', {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/classify',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await classifyInboxInteraction(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sendsExternally: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/confirm-intent',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await confirmInboxIntent(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/suggest-reply',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await generateInboxSuggestion(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sendsExternally: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/edit-reply',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await editInboxSuggestion(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/approve-reply',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await approveInboxReply(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        sendsExternally: false,
        sent: false,
        note: 'Reply draft approved locally. Nothing was sent to Facebook or Messenger.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/objectives/seed-pilot',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const objectives = await ensurePilotResearchObjectives({ actorId: req.user?.id || null });
      return res.json({ ok: true, objectives, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/objectives/:id/research',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await runObjectiveResearch(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'objective_not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        outreach: false,
        facebookPublish: false,
        investorCrm: false,
        note: 'Research used the public catalog only. Nothing was published or sent.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/research/tasks',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const tasks = await listResearchTasks({
        status: req.query.status,
        targetType: req.query.targetType,
        objectiveId: req.query.objectiveId,
        take: req.query.take,
      });
      return res.json({ ok: true, tasks });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/opportunities',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const opportunities = await listResearchOpportunities({
        status: req.query.status,
        targetType: req.query.targetType,
        objectiveId: req.query.objectiveId,
        take: req.query.take,
      });
      return res.json({ ok: true, opportunities, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/opportunities/:id',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const opportunity = await getResearchOpportunity(req.params.id);
      if (!opportunity) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, opportunity, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/opportunities/:id/review',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await reviewOpportunity(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/opportunities/:id/approve',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await approveOpportunity(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        campaignCreated: false,
        note: 'Opportunity approved. No campaign was created or published.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/opportunities/:id/reject',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await rejectOpportunity(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/opportunities/:id/archive',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await archiveOpportunity(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/opportunities/:id/prepare-campaign',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await prepareCampaignFromOpportunity(req.params.id, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        publishes: false,
        scheduled: false,
        note: 'Evidence-linked campaign proposal DRAFT. Nothing was published or scheduled.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/proposals',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const result = await listCampaignProposals({
        status: req.query.status,
        take: req.query.take,
      });
      return res.json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/campaigns/:id/proposal',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const result = await getCampaignProposal(req.params.id);
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/campaigns/:id/proposal/readiness',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const result = await getCampaignProposalReadiness(req.params.id);
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.json({ ...result, liveMeta: false, channelExecution: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.patch(
  '/marketing/campaigns/:id/proposal',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await patchCampaignProposal(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, publishes: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/proposal/submit',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await submitCampaignProposal(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, publishes: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/proposal/approve',
  requireMarketingPermission(PERMISSIONS.MARKETING_APPROVER),
  async (req, res) => {
    try {
      const result = await approveCampaignProposal(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        publishes: false,
        scheduled: false,
        channelExecution: false,
        note: result.note || 'Proposal approved. Not published.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/proposal/revise',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await reviseCampaignProposal(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, publishes: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/inbox/:id/reject-suggestion',
  requireMarketingPermission(PERMISSIONS.ENGAGEMENT_OPERATOR),
  async (req, res) => {
    try {
      const result = await rejectInboxSuggestion(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found') return res.status(404).json(result);
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/investors',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const result = await listInvestorEngagements({ take: req.query.take });
      return res.json({ ...result, liveMeta: false, sends: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.get(
  '/marketing/campaigns/:id/investor',
  requireMarketingPermission(PERMISSIONS.MARKETING_VIEWER),
  async (req, res) => {
    try {
      const result = await getInvestorEngagement(req.params.id);
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.json({ ...result, liveMeta: false, sends: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/profile',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await prepareInvestorProfile(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sends: false, publishes: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/outreach-pack',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await prepareInvestorOutreachPack(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sends: false, publishes: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/handoff/approve',
  requireMarketingPermission(PERMISSIONS.MARKETING_APPROVER),
  async (req, res) => {
    try {
      const result = await approveInvestorHandoff(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        sends: false,
        publishes: false,
        note: result.note || 'Handoff approved. No communication was sent.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/handoff/revise',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await reviseInvestorHandoff(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sends: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/handoff/reject',
  requireMarketingPermission(PERMISSIONS.MARKETING_APPROVER),
  async (req, res) => {
    try {
      const result = await rejectInvestorHandoff(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sends: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/access/revoke',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await revokeInvestorAccess(req.params.id, { actorId: req.user?.id || null });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({ ...result, liveMeta: false, sends: false });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

router.post(
  '/marketing/campaigns/:id/investor/events',
  requireMarketingPermission(PERMISSIONS.MARKETING_EDITOR),
  async (req, res) => {
    try {
      const result = await recordManualInvestorEvent(req.params.id, req.body || {}, {
        actorId: req.user?.id || null,
      });
      if (result.error === 'not_found' || result.error === 'proposal_not_found') {
        return res.status(404).json({ ...result, liveMeta: false, sends: false });
      }
      return res.status(result.ok ? 200 : 400).json({
        ...result,
        liveMeta: false,
        sends: false,
        note: result.note || 'Event recorded. No communication was sent.',
      });
    } catch (err) {
      return handleError(res, err);
    }
  },
);

export default router;

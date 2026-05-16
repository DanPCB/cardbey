/**
 * Campaign Phase A API: POST /api/campaign/validate-scope
 * Validates campaign scope (store/draft, products, channels), persists CampaignPlan + CampaignValidationResult + AuditEvent.
 * requireAuth; tenant-scoped; no changes to draft-store or publish flows.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getTenantId, canAccessBusiness } from '../lib/tenant.js';
import { transitionOrchestratorTaskStatus } from '../kernel/transitions/transitionService.js';

const router = Router();
if (process.env.NODE_ENV !== 'production') {
  console.log('[CampaignRoutes] loaded', 'degradedFromPlan_fix_v1');
}

/**
 * Default schedule: next Sat 09:00 and Sun 09:00.
 * TODO: When user/tenant timezone is available (e.g. User.preferences.timezone or plan.timeWindow.tz),
 * compute next Sat/Sun 09:00 in that zone instead of UTC. Until then we use UTC and mark in metadata.
 * @param {string} [tz] - IANA timezone (e.g. 'Australia/Sydney'). If provided, used when we implement TZ math; today we still use UTC.
 * @returns {{ times: string[], defaultTz: string }}
 */
function defaultScheduleTimes(tz) {
  const now = new Date();
  const day = now.getUTCDay();
  const sat = new Date(now);
  sat.setUTCDate(now.getUTCDate() + ((6 - day + 7) % 7));
  sat.setUTCHours(9, 0, 0, 0);
  const sun = new Date(sat);
  sun.setUTCDate(sat.getUTCDate() + 1);
  const usedTz = tz && typeof tz === 'string' && tz.trim() ? tz.trim() : 'UTC';
  return { times: [sat.toISOString(), sun.toISOString()], defaultTz: usedTz };
}

/**
 * When ENABLE_SMART_SCHEDULE_FALLBACK=true and plan.timeWindow spans >= 10 days, return 8 deterministic UTC times (Tue/Thu/Sat/Sun 09:00 over 14 days). Else null.
 */
function smartScheduleFallback(plan) {
  if (process.env.ENABLE_SMART_SCHEDULE_FALLBACK !== 'true') return null;
  const tw = plan?.timeWindow && typeof plan.timeWindow === 'object' ? plan.timeWindow : null;
  if (!tw?.start || !tw?.end) return null;
  const start = new Date(tw.start);
  const end = new Date(tw.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 10) return null;
  const preferredDays = [2, 4, 6, 0];
  const hour = 9;
  const times = [];
  for (let t = start.getTime(); t < end.getTime() && times.length < 8; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    if (preferredDays.includes(d.getUTCDay())) {
      const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
      if (at.getTime() >= start.getTime() && at.getTime() < end.getTime()) times.push(at);
    }
  }
  return times.length >= 2 ? times : null;
}

/**
 * Phase B.2: Deterministic template for campaign captions (no LLM).
 * Uses plan.objective, plan.target (product/category), plan.timeWindow.
 */
function generateCaptionFromPlan(plan, index) {
  const objective = plan.objective || 'Special offer';
  const target = plan.target && typeof plan.target === 'object' ? plan.target : {};
  const category = [target.category, target.productId].filter(Boolean).join(' ') || 'your favorites';
  const templates = [
    `This weekend only! Enjoy ${objective} — ${category}.`,
    `${objective}. Don't miss out on ${category}.`,
    `Limited time: ${objective}. Shop ${category} now.`,
  ];
  return templates[index % templates.length] || templates[0];
}

/**
 * Phase B.2: Deterministic image prompt from plan (no LLM).
 */
function generateImagePromptFromPlan(plan) {
  const objective = plan.objective || 'promotion';
  const target = plan.target && typeof plan.target === 'object' ? plan.target : {};
  const subject = target.category || target.productId || 'products';
  return `Promotional image for ${objective}, featuring ${subject}, clean and inviting mood.`;
}

/** Normalize to string array */
function toChannelsArray(v) {
  if (Array.isArray(v)) return v.filter((c) => typeof c === 'string').map((c) => String(c).trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/** Select plan fields for read responses (no secrets) */
const planSelect = {
  id: true,
  tenantKey: true,
  missionId: true,
  storeId: true,
  draftStoreId: true,
  objective: true,
  target: true,
  timeWindow: true,
  budget: true,
  channelsRequested: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

/** Select validation fields for read responses (no secrets) */
const validationSelect = {
  id: true,
  tenantKey: true,
  planId: true,
  checks: true,
  blockers: true,
  warnings: true,
  risk: true,
  confidence: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * GET /api/campaign/plan?missionId=...
 * requireAuth; tenantKey scoped; returns latest CampaignPlan for (tenantKey, missionId) + latest CampaignValidationResult.
 * Response: { plan, validation } (validation null if none).
 */
router.get('/plan', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] GET /plan', userId ? 'authenticated' : 'anon', req.query.missionId ? 'missionId=' + String(req.query.missionId).slice(0, 12) : '');
    }
    const tenantKey = getTenantId(req.user) || userId;
    const missionId = typeof req.query.missionId === 'string' && req.query.missionId.trim() ? req.query.missionId.trim() : null;
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId query is required' });
    }
    const prisma = getPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] GET /plan query', { tenantKey: tenantKey.slice(0, 12), missionId: missionId.slice(0, 24) });
    }
    const plan = await prisma.campaignPlan.findFirst({
      where: { tenantKey, missionId },
      orderBy: { updatedAt: 'desc' },
      select: planSelect,
    });
    if (!plan) {
      if (process.env.NODE_ENV !== 'production') {
        const countForTenant = await prisma.campaignPlan.count({ where: { tenantKey } });
        console.log('[Campaign] GET /plan no plan found', { tenantKey: tenantKey.slice(0, 12), missionId: missionId.slice(0, 24), planCountForTenant: countForTenant });
      }
      return res.status(404).json({ ok: false, error: 'not_found', message: 'No campaign plan found for this mission' });
    }
    const validation = await prisma.campaignValidationResult.findFirst({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
      select: validationSelect,
    });
    return res.status(200).json({ ok: true, plan, validation: validation ?? null });
  } catch (err) {
    console.error('[Campaign] GET /plan error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load plan' });
  }
});

/**
 * GET /api/campaign/plan/:planId
 * requireAuth; tenantKey scoped; returns plan + latest validation.
 * Response: { plan, validation }.
 */
router.get('/plan/:planId', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const planId = typeof req.params.planId === 'string' && req.params.planId.trim() ? req.params.planId.trim() : null;
    if (!planId) return res.status(400).json({ ok: false, error: 'plan_id_required', message: 'planId is required' });
    const prisma = getPrismaClient();
    const plan = await prisma.campaignPlan.findFirst({
      where: { id: planId, tenantKey },
      select: planSelect,
    });
    if (!plan) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Plan not found or access denied' });
    }
    const validation = await prisma.campaignValidationResult.findFirst({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
      select: validationSelect,
    });
    return res.status(200).json({ ok: true, plan, validation: validation ?? null });
  } catch (err) {
    console.error('[Campaign] GET /plan/:planId error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load plan' });
  }
});

/**
 * GET /api/campaign/validation/:validationId
 * requireAuth; tenantKey scoped; returns validation + plan (for PhaseOutputs).
 * Response: { validation, plan }.
 */
router.get('/validation/:validationId', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const validationId = typeof req.params.validationId === 'string' && req.params.validationId.trim() ? req.params.validationId.trim() : null;
    if (!validationId) return res.status(400).json({ ok: false, error: 'validation_id_required', message: 'validationId is required' });
    const prisma = getPrismaClient();
    const validation = await prisma.campaignValidationResult.findFirst({
      where: { id: validationId, tenantKey },
      select: validationSelect,
    });
    if (!validation) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Validation not found or access denied' });
    }
    const plan = await prisma.campaignPlan.findUnique({
      where: { id: validation.planId },
      select: planSelect,
    });
    if (!plan || plan.tenantKey !== tenantKey) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Plan not found or access denied' });
    }
    return res.status(200).json({ ok: true, validation, plan });
  } catch (err) {
    console.error('[Campaign] GET /validation/:validationId error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load validation' });
  }
});

/** Phase B: lightweight select for campaign read (no secrets) */
const campaignV2Select = {
  id: true,
  tenantKey: true,
  planId: true,
  missionId: true,
  storeId: true,
  draftStoreId: true,
  title: true,
  objective: true,
  status: true,
  degradedMode: true,
  allowedChannels: true,
  createdAt: true,
  updatedAt: true,
};

/** Preview limit for schedule/deployments in read responses (UI shows full count via scheduleCount/deploymentCount) */
const SCHEDULE_PREVIEW_TAKE = 5;

/** Shared campaign read select: _count for true totals, preview lists (take 5), offer. */
const campaignWithRelationsSelect = {
  ...campaignV2Select,
  _count: { select: { scheduleItems: true, channelDeployments: true, creativeCopies: true, creativeAssets: true } },
  creativeCopies: { take: SCHEDULE_PREVIEW_TAKE, select: { id: true, kind: true, text: true } },
  creativeAssets: { take: SCHEDULE_PREVIEW_TAKE, select: { id: true, type: true, prompt: true } },
  scheduleItems: { take: SCHEDULE_PREVIEW_TAKE, orderBy: { scheduledAt: 'asc' }, select: { id: true, channel: true, scheduledAt: true, status: true } },
  channelDeployments: { take: SCHEDULE_PREVIEW_TAKE, select: { id: true, channel: true, mode: true, status: true } },
  offers: { take: 1, select: { id: true, type: true, status: true, data: true } },
};

/**
 * Enrich campaign for response: add scheduleCount, scheduleRange, deploymentCount from _count + aggregate (min/max scheduledAt).
 * Removes _count from payload; keeps scheduleItems as preview list.
 */
async function enrichCampaignForResponse(prisma, campaign) {
  if (!campaign?.id) return campaign;
  const campaignId = campaign.id;
  if (process.env.NODE_ENV !== 'production') {
    const scheduleRowCount = await prisma.campaignScheduleItem.count({
      where: { campaignId },
    });
    console.log('[Campaign] schedule rows count', { campaignId, scheduleRowCount });
  }
  const agg = await prisma.campaignScheduleItem.aggregate({
    where: { campaignId },
    _count: { id: true },
    _min: { scheduledAt: true },
    _max: { scheduledAt: true },
  }).catch(() => ({ _count: { id: 0 }, _min: { scheduledAt: null }, _max: { scheduledAt: null } }));
  const { _count, ...rest } = campaign;
  return {
    ...rest,
    scheduleCount: _count?.scheduleItems ?? agg._count?.id ?? (campaign.scheduleItems?.length ?? 0),
    scheduleRange: {
      firstAt: agg._min?.scheduledAt ?? null,
      lastAt: agg._max?.scheduledAt ?? null,
    },
    deploymentCount: _count?.channelDeployments ?? (campaign.channelDeployments?.length ?? 0),
  };
}

/**
 * GET /api/campaign/by-plan/:planId
 * tenantKey scoped; returns latest CampaignV2 for plan (lightweight: copies, assets, schedules, deployments, offer).
 */
router.get('/by-plan/:planId', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const planId = typeof req.params.planId === 'string' && req.params.planId.trim() ? req.params.planId.trim() : null;
    if (!planId) return res.status(400).json({ ok: false, error: 'plan_id_required', message: 'planId is required' });
    const prisma = getPrismaClient();
    const plan = await prisma.campaignPlan.findFirst({
      where: { id: planId, tenantKey },
      select: { id: true },
    });
    if (!plan) return res.status(404).json({ ok: false, error: 'not_found', message: 'Plan not found or access denied' });
    const campaign = await prisma.campaignV2.findFirst({
      where: { planId, tenantKey },
      orderBy: { createdAt: 'desc' },
      select: campaignWithRelationsSelect,
    });
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'No campaign found for this plan' });
    const offer = campaign.offers?.[0] ?? null;
    const { offers, ...rest } = campaign;
    const enriched = await enrichCampaignForResponse(prisma, { ...rest, offer });
    return res.status(200).json({ ok: true, campaign: enriched });
  } catch (err) {
    console.error('[Campaign] GET /by-plan/:planId error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load campaign' });
  }
});

/**
 * GET /api/campaign/by-mission?missionId=...
 * requireAuth; tenantKey scoped; returns latest CampaignV2 for (tenantKey, missionId) with schedules, creatives, offer, deployments.
 * Fallback: if no campaign with missionId, get latest plan by missionId then campaign by planId.
 * Response: { campaign }. No secrets/tokens.
 */
router.get('/by-mission', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] GET /by-mission', userId ? 'authenticated' : 'anon', req.query.missionId ? 'missionId=' + String(req.query.missionId).slice(0, 12) : '');
    }
    const tenantKey = getTenantId(req.user) || userId;
    const missionId = typeof req.query.missionId === 'string' && req.query.missionId.trim() ? req.query.missionId.trim() : null;
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId query is required' });
    }
    const prisma = getPrismaClient();
    let campaign = await prisma.campaignV2.findFirst({
      where: { tenantKey, missionId },
      orderBy: { createdAt: 'desc' },
      select: campaignWithRelationsSelect,
    });
    if (!campaign) {
      const plan = await prisma.campaignPlan.findFirst({
        where: { tenantKey, missionId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (plan) {
        campaign = await prisma.campaignV2.findFirst({
          where: { planId: plan.id, tenantKey },
          orderBy: { createdAt: 'desc' },
          select: campaignWithRelationsSelect,
        });
      }
    }
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'No campaign found for this mission' });
    const offer = campaign.offers?.[0] ?? null;
    const { offers, ...rest } = campaign;
    const enriched = await enrichCampaignForResponse(prisma, { ...rest, offer });
    return res.status(200).json({ ok: true, campaign: enriched });
  } catch (err) {
    console.error('[Campaign] GET /by-mission error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load campaign' });
  }
});

/**
 * Phase C: Build deterministic report from campaign (no LLM).
 * Returns { summary, links, scheduleRecap, nextSteps } for persistence.
 * When scheduleOverride is provided (from DB aggregate), use it so report is not truncated.
 */
function buildCampaignReportContent(campaign, missionId, scheduleOverride) {
  const scheduleCount = scheduleOverride?.count ?? (Array.isArray(campaign.scheduleItems) ? campaign.scheduleItems.length : 0);
  const deploymentCount = campaign.deploymentCount ?? (Array.isArray(campaign.channelDeployments) ? campaign.channelDeployments.length : 0);
  const copyCount = Array.isArray(campaign.creativeCopies) ? campaign.creativeCopies.length : 0;
  const assetCount = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets.length : 0;
  const offer = campaign.offer && typeof campaign.offer === 'object' ? campaign.offer : null;
  const offerValue = offer?.data?.value ?? null;
  const timeWindow = offer?.data?.validFrom && offer?.data?.validTo
    ? `${new Date(offer.data.validFrom).toLocaleDateString()} – ${new Date(offer.data.validTo).toLocaleDateString()}`
    : '';

  let summary = `Your ${scheduleCount > 0 ? scheduleCount + '-post' : 'promotion'} campaign is scheduled.`;
  if (offerValue) summary += ` Offer: ${offerValue}.`;
  if (timeWindow) summary += ` Window: ${timeWindow}.`;
  if (deploymentCount > 0) summary += ` ${deploymentCount} channel(s) configured.`;

  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '';
  const storeId = campaign.storeId || campaign.draftStoreId || null;
  const links = [
    {
      label: storeId ? 'Storefront' : 'Storefront (connect store)',
      url: storeId && baseUrl ? `${baseUrl.replace(/\/$/, '')}/store/${storeId}` : '#',
      kind: 'storefront',
    },
    { label: 'Share link', url: '#', kind: 'share' },
    { label: 'QR', url: '#', kind: 'qr' },
    { label: 'UTM template', url: '#', kind: 'utm' },
  ];

  const firstAt = scheduleOverride?.firstAt ?? (() => {
    const schedules = Array.isArray(campaign.scheduleItems) ? campaign.scheduleItems : [];
    const dates = schedules.map((s) => (s.scheduledAt ? new Date(s.scheduledAt).getTime() : null)).filter(Boolean);
    return dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;
  })();
  const lastAt = scheduleOverride?.lastAt ?? (() => {
    const schedules = Array.isArray(campaign.scheduleItems) ? campaign.scheduleItems : [];
    const dates = schedules.map((s) => (s.scheduledAt ? new Date(s.scheduledAt).getTime() : null)).filter(Boolean);
    return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
  })();
  const campaignWindow =
    firstAt && lastAt
      ? `${new Date(firstAt).toLocaleDateString()} – ${new Date(lastAt).toLocaleDateString()}`
      : null;
  const windowDays =
    firstAt && lastAt ? Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / (24 * 60 * 60 * 1000)) : 0;
  const cadence =
    scheduleCount > 0 && windowDays > 0
      ? (scheduleCount / (windowDays / 7)).toFixed(1)
      : null;
  const scheduleRecap = {
    count: scheduleCount,
    firstAt,
    lastAt,
    campaignWindow: campaignWindow ?? undefined,
    cadence: cadence ? `${cadence} posts/week` : undefined,
  };
  if (campaignWindow) summary += ` Campaign window: ${campaignWindow}.`;
  if (cadence) summary += ` Cadence: ${cadence} posts/week.`;

  const nextSteps = [];
  if (copyCount > 0) nextSteps.push({ title: 'Review captions', detail: `${copyCount} creative copy/copies`, priority: 'medium' });
  const deployments = Array.isArray(campaign.channelDeployments) ? campaign.channelDeployments : [];
  const hasScheduledOnly = deployments.some((d) => d.mode === 'scheduled_posts');
  const hasDropped = deployments.some((d) => d.data && (Array.isArray(d.data.reasonCodes) ? d.data.reasonCodes.length > 0 : false));
  if (hasDropped || hasScheduledOnly) {
    nextSteps.push({ title: 'Connect social accounts', detail: 'Link accounts for direct publishing', priority: 'high' });
  }
  if (assetCount === 0) nextSteps.push({ title: 'Prepare product photos', detail: 'Add assets for creatives', priority: 'medium' });
  if (nextSteps.length === 0) nextSteps.push({ title: 'Review and launch', detail: 'Confirm schedules and deploy', priority: 'low' });

  return { summary, links, scheduleRecap, nextSteps, missionId: missionId || campaign.missionId || null };
}

/**
 * GET /api/campaign/:campaignId/report
 * requireAuth; tenantKey scoped; returns latest CampaignReport for campaign.
 */
router.get('/:campaignId/report', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const campaignId = typeof req.params.campaignId === 'string' && req.params.campaignId.trim() ? req.params.campaignId.trim() : null;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaign_id_required', message: 'campaignId is required' });
    const prisma = getPrismaClient();
    const campaign = await prisma.campaignV2.findFirst({
      where: { id: campaignId, tenantKey },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'Campaign not found or access denied' });
    const report = await prisma.campaignReport.findFirst({
      where: { campaignId, tenantKey },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, campaignId: true, missionId: true, summary: true, links: true, scheduleRecap: true, nextSteps: true, createdAt: true, updatedAt: true },
    });
    if (!report) return res.status(404).json({ ok: false, error: 'not_found', message: 'No report yet for this campaign' });
    return res.status(200).json({ ok: true, report });
  } catch (err) {
    console.error('[Campaign] GET /:campaignId/report error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load report' });
  }
});

/**
 * POST /api/campaign/:campaignId/report
 * requireAuth; tenantKey scoped; builds report from campaign, upserts CampaignReport, optional monitor task, audit event.
 */
router.post('/:campaignId/report', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const campaignId = typeof req.params.campaignId === 'string' && req.params.campaignId.trim() ? req.params.campaignId.trim() : null;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaign_id_required', message: 'campaignId is required' });
    const prisma = getPrismaClient();
    const missionId = typeof req.body?.missionId === 'string' && req.body.missionId.trim() ? req.body.missionId.trim() : null;
    const campaign = await prisma.campaignV2.findFirst({
      where: { id: campaignId, tenantKey },
      select: {
        id: true,
        missionId: true,
        storeId: true,
        draftStoreId: true,
        objective: true,
        scheduleItems: { select: { id: true, scheduledAt: true } },
        channelDeployments: { select: { id: true, channel: true, mode: true, status: true, data: true } },
        offers: { take: 1, select: { id: true, type: true, data: true } },
        creativeCopies: { select: { id: true } },
        creativeAssets: { select: { id: true } },
      },
    });
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'Campaign not found or access denied' });
    const offer = campaign.offers?.[0] ?? null;
    const agg = await prisma.campaignScheduleItem.aggregate({
      where: { campaignId },
      _count: { id: true },
      _min: { scheduledAt: true },
      _max: { scheduledAt: true },
    });
    const scheduleOverride = {
      count: agg._count.id ?? 0,
      firstAt: agg._min.scheduledAt ? new Date(agg._min.scheduledAt).toISOString() : null,
      lastAt: agg._max.scheduledAt ? new Date(agg._max.scheduledAt).toISOString() : null,
    };
    const payload = buildCampaignReportContent(
      { ...campaign, offer },
      missionId || campaign.missionId || null,
      scheduleOverride
    );
    const existing = await prisma.campaignReport.findFirst({
      where: { campaignId, tenantKey },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    let report;
    if (existing) {
      report = await prisma.campaignReport.update({
        where: { id: existing.id },
        data: {
          summary: payload.summary,
          links: payload.links,
          scheduleRecap: payload.scheduleRecap,
          nextSteps: payload.nextSteps,
          missionId: payload.missionId,
          updatedAt: new Date(),
        },
        select: { id: true, campaignId: true, missionId: true, summary: true, links: true, scheduleRecap: true, nextSteps: true, createdAt: true, updatedAt: true },
      });
    } else {
      report = await prisma.campaignReport.create({
        data: {
          tenantKey,
          campaignId,
          missionId: payload.missionId,
          summary: payload.summary,
          links: payload.links,
          scheduleRecap: payload.scheduleRecap,
          nextSteps: payload.nextSteps,
        },
        select: { id: true, campaignId: true, missionId: true, summary: true, links: true, scheduleRecap: true, nextSteps: true, createdAt: true, updatedAt: true },
      });
    }
    const reportId = report.id;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] report upserted', { reportId, campaignId, tenantKey: tenantKey.slice(0, 12) });
      const verify = await prisma.campaignReport.findUnique({ where: { id: reportId }, select: { id: true } });
      if (verify) console.log('[Campaign] report exists', reportId);
    }
    try {
      const taskPayload = { campaignId, tenantKey, missionId: payload.missionId, tags: { campaignId, missionId: payload.missionId, phaseId: 'campaign_report' } };
      const monitorTask = await prisma.orchestratorTask.create({
        data: { entryPoint: 'campaign.monitor.performance', tenantId: tenantKey, userId, status: 'queued', request: taskPayload },
      });
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: monitorTask.id,
        toStatus: 'running',
        fromStatus: 'queued',
        actorType: 'automation',
        reason: 'CAMPAIGN_REPORT',
        correlationId: campaignId,
      });
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: monitorTask.id,
        toStatus: 'completed',
        fromStatus: 'running',
        actorType: 'automation',
        reason: 'CAMPAIGN_REPORT',
        correlationId: campaignId,
        result: { reportId },
      });
    } catch (taskErr) {
      if (process.env.NODE_ENV !== 'production') console.warn('[Campaign] report monitor task create/transition failed:', taskErr?.message);
    }
    await prisma.auditEvent.create({
      data: {
        entityType: 'CampaignV2',
        entityId: campaignId,
        action: 'campaign_report_created',
        fromStatus: null,
        toStatus: null,
        actorType: 'human',
        actorId: userId,
        reason: 'campaign_report',
        metadata: { reportId },
      },
    });
    return res.status(200).json({ ok: true, reportId, report });
  } catch (err) {
    console.error('[Campaign] POST /:campaignId/report error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to create report' });
  }
});

/**
 * GET /api/campaign/:campaignId/tasks
 * requireAuth; tenantKey scoped; returns OrchestratorTask rows for this campaign (request.campaignId), newest first, limit 20.
 */
router.get('/:campaignId/tasks', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const campaignId = typeof req.params.campaignId === 'string' && req.params.campaignId.trim() ? req.params.campaignId.trim() : null;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaign_id_required', message: 'campaignId is required' });
    const prisma = getPrismaClient();
    const campaign = await prisma.campaignV2.findFirst({
      where: { id: campaignId, tenantKey },
      select: { id: true },
    });
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'Campaign not found or access denied' });
    const raw = await prisma.orchestratorTask.findMany({
      where: { tenantId: tenantKey },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, entryPoint: true, status: true, updatedAt: true, request: true, result: true },
    });
    const tasks = raw
      .filter((t) => {
        if (!t.request || typeof t.request !== 'object') return false;
        const r = t.request;
        return r.campaignId === campaignId || (r.tags && r.tags.campaignId === campaignId);
      })
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        type: t.entryPoint,
        status: t.status,
        updatedAt: t.updatedAt,
        error: t.result && typeof t.result === 'object' && t.result.error ? String(t.result.error).slice(0, 120) : null,
      }));
    return res.status(200).json({ ok: true, tasks });
  } catch (err) {
    console.error('[Campaign] GET /:campaignId/tasks error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load tasks' });
  }
});

/**
 * GET /api/campaign/:campaignId
 * tenantKey scoped; returns campaign with copies, assets, schedules, deployments, offer (lightweight).
 */
router.get('/:campaignId', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const campaignId = typeof req.params.campaignId === 'string' && req.params.campaignId.trim() ? req.params.campaignId.trim() : null;
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaign_id_required', message: 'campaignId is required' });
    const prisma = getPrismaClient();
    const campaign = await prisma.campaignV2.findFirst({
      where: { id: campaignId, tenantKey },
      select: campaignWithRelationsSelect,
    });
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found', message: 'Campaign not found or access denied' });
    const offer = campaign.offers?.[0] ?? null;
    const { offers, ...rest } = campaign;
    const enriched = await enrichCampaignForResponse(prisma, { ...rest, offer });
    return res.status(200).json({ ok: true, campaign: enriched });
  } catch (err) {
    console.error('[Campaign] GET /:campaignId error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message || 'Failed to load campaign' });
  }
});

/**
 * POST /api/campaign/validate-scope
 * Body: { missionId?, storeId?, draftStoreId?, objective, target?, timeWindow?, budget?, channels? }
 * Returns: { planId, validationId, status, checks, blockers, warnings, risk, confidence, degradedMode? }
 */
router.post('/validate-scope', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] POST /validate-scope', userId ? 'authenticated' : 'anon');
    }
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const tenantKey = getTenantId(req.user) || userId;
    const prisma = getPrismaClient();
    const body = req.body ?? {};

    const missionId = typeof body.missionId === 'string' && body.missionId.trim() ? body.missionId.trim() : null;
    const storeId = typeof body.storeId === 'string' && body.storeId.trim() ? body.storeId.trim() : null;
    const draftStoreId = typeof body.draftStoreId === 'string' && body.draftStoreId.trim() ? body.draftStoreId.trim() : null;
    const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
    const target = body.target && typeof body.target === 'object' ? body.target : null;
    const timeWindow = body.timeWindow && typeof body.timeWindow === 'object' ? body.timeWindow : null;
    const budget = body.budget && typeof body.budget === 'object' ? body.budget : null;
    const channels = toChannelsArray(body.channels);

    const checks = [];
    const blockers = [];
    const warnings = [];
    let risk = 'med';
    let confidence = 'med';
    let degradedMode = null;

    // --- Required: objective
    if (!objective) {
      blockers.push({ code: 'MISSING_OBJECTIVE', message: 'objective is required' });
    }
    checks.push({
      code: 'HAS_OBJECTIVE',
      ok: !!objective,
      message: objective ? 'Objective provided' : 'Objective is required',
    });

    // --- Tenant scoping: store (consistent with canAccessBusiness)
    let storeExists = false;
    let storeOwnedByTenant = false;
    if (storeId) {
      const store = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true, userId: true },
      });
      storeExists = !!store;
      storeOwnedByTenant = storeExists && (await canAccessBusiness(prisma, { tenantKey, user: req.user, storeId }));
      if (!storeExists) {
        blockers.push({ code: 'STORE_NOT_FOUND', message: 'Store not found' });
      } else if (!storeOwnedByTenant) {
        blockers.push({ code: 'STORE_ACCESS_DENIED', message: 'Store does not belong to your account' });
      }
      checks.push({
        code: 'STORE_EXISTS_AND_OWNED',
        ok: storeExists && storeOwnedByTenant,
        message: storeExists && storeOwnedByTenant ? 'Store exists and is accessible' : (storeExists ? 'Store does not belong to your account' : 'Store not found'),
      });
    }

    // --- Tenant scoping: draft store
    let draftExists = false;
    let draftOwnedByTenant = false;
    if (draftStoreId) {
      const draft = await prisma.draftStore.findUnique({
        where: { id: draftStoreId },
        select: { id: true, ownerUserId: true },
      });
      draftExists = !!draft;
      draftOwnedByTenant = draft?.ownerUserId === userId;
      if (!draftExists) {
        blockers.push({ code: 'DRAFT_STORE_NOT_FOUND', message: 'Draft store not found' });
      } else if (!draftOwnedByTenant) {
        blockers.push({ code: 'DRAFT_STORE_ACCESS_DENIED', message: 'Draft store does not belong to your account' });
      }
      checks.push({
        code: 'DRAFT_STORE_EXISTS_AND_OWNED',
        ok: draftExists && draftOwnedByTenant,
        message: draftExists && draftOwnedByTenant ? 'Draft store exists and is accessible' : (draftExists ? 'Draft store does not belong to your account' : 'Draft store not found'),
      });
    }

    // --- At least one of store or draft (if either provided, must be valid)
    const hasStoreOrDraft = (storeId && storeExists && storeOwnedByTenant) || (draftStoreId && draftExists && draftOwnedByTenant);
    if (storeId || draftStoreId) {
      checks.push({
        code: 'SCOPE_STORE_OR_DRAFT',
        ok: hasStoreOrDraft,
        message: hasStoreOrDraft ? 'Store or draft store is valid' : 'Provide a valid store or draft store',
      });
      if (!hasStoreOrDraft && (storeId || draftStoreId)) {
        blockers.push({ code: 'NO_VALID_SCOPE', message: 'Provide a valid store or draft store you own' });
      }
    }

    // --- If storeId valid: at least one product
    let productCount = 0;
    let productsWithImages = 0;
    if (storeId && storeExists && storeOwnedByTenant) {
      const products = await prisma.product.findMany({
        where: { businessId: storeId },
        select: { id: true, imageUrl: true, images: true },
      });
      productCount = products.length;
      productsWithImages = products.filter((p) => (p.imageUrl && p.imageUrl.trim()) || (Array.isArray(p.images) && p.images.length > 0)).length;
      checks.push({
        code: 'HAS_PRODUCTS',
        ok: productCount > 0,
        message: productCount > 0 ? `Store has ${productCount} product(s)` : 'Store has no products',
      });
      if (productCount === 0) {
        blockers.push({ code: 'NO_PRODUCTS', message: 'Store has no products; add at least one product' });
      }
      if (productCount > 0 && productsWithImages < productCount) {
        warnings.push({ code: 'SOME_PRODUCTS_MISSING_IMAGES', message: `${productCount - productsWithImages} product(s) missing images` });
        checks.push({
          code: 'PRODUCTS_HAVE_IMAGES',
          ok: false,
          message: 'Some products are missing images',
        });
      } else if (productCount > 0) {
        checks.push({
          code: 'PRODUCTS_HAVE_IMAGES',
          ok: true,
          message: 'All products have images',
        });
      }
    }

    // --- Channels: if user requested social channels, assume OAuth not connected (no OAuth table yet) -> warning + degraded
    const channelsRequested = channels.length > 0 ? channels : ['scheduled_posts'];
    const socialChannelRequested = channels.some((c) => /instagram|facebook|twitter|linkedin|tiktok|social/i.test(String(c)));
    if (channels.length > 0 && socialChannelRequested) {
      warnings.push({ code: 'OAUTH_NOT_CONNECTED', message: 'Social channels require OAuth; falling back to scheduled posts only' });
      degradedMode = {
        reasonCodes: ['OAUTH_NOT_CONNECTED'],
        allowedChannels: ['scheduled_posts'],
      };
      checks.push({
        code: 'CHANNELS_AVAILABLE',
        ok: true,
        message: 'Degraded: scheduled posts only (OAuth not connected)',
      });
    } else if (channels.length > 0) {
      checks.push({
        code: 'CHANNELS_AVAILABLE',
        ok: true,
        message: 'Requested channels available',
      });
    }

    // --- Risk/confidence from blockers
    if (blockers.length > 0) {
      risk = 'high';
      confidence = 'low';
    } else if (warnings.length > 0) {
      risk = 'med';
      confidence = 'med';
    } else {
      risk = 'low';
      confidence = 'high';
    }

    const responseStatus = blockers.length > 0 ? 'blocked' : 'validated';
    const planStatus = blockers.length > 0 ? 'draft' : 'validated';

    // Only persist store/draft ids when ownership passed (do not store other tenants' ids)
    const safeStoreId = storeId && storeExists && storeOwnedByTenant ? storeId : undefined;
    const safeDraftStoreId = draftStoreId && draftExists && draftOwnedByTenant ? draftStoreId : undefined;

    // --- Persist: CampaignPlan (upsert by tenantKey + missionId or create new)
    let plan = null;
    if (missionId) {
      plan = await prisma.campaignPlan.findFirst({
        where: { tenantKey, missionId },
        orderBy: { updatedAt: 'desc' },
      });
    }
    const planPayload = {
      tenantKey,
      missionId: missionId ?? undefined,
      storeId: safeStoreId,
      draftStoreId: safeDraftStoreId,
      objective: objective || 'Untitled',
      target: target ?? undefined,
      timeWindow: timeWindow ?? undefined,
      budget: budget ?? undefined,
      channelsRequested: channelsRequested.length ? channelsRequested : undefined,
      status: planStatus,
      updatedAt: new Date(),
    };
    if (plan) {
      plan = await prisma.campaignPlan.update({
        where: { id: plan.id },
        data: planPayload,
      });
    } else {
      plan = await prisma.campaignPlan.create({
        data: {
          ...planPayload,
          objective: planPayload.objective,
        },
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] validate-scope saved plan', { planId: plan.id, tenantKey, missionIdStored: plan.missionId ?? null, status: plan.status });
    }

    const validationResult = await prisma.campaignValidationResult.create({
      data: {
        tenantKey,
        planId: plan.id,
        checks,
        blockers,
        warnings,
        risk,
        confidence,
        updatedAt: new Date(),
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'CampaignPlan',
        entityId: plan.id,
        action: 'campaign_plan_validated',
        fromStatus: null,
        toStatus: responseStatus,
        actorType: 'human',
        actorId: userId,
        reason: 'validate_scope',
        metadata: {
          risk,
          confidence,
          blockerCount: blockers.length,
          warningCount: warnings.length,
          validationId: validationResult.id,
        },
      },
    });

    return res.status(200).json({
      ok: true,
      planId: plan.id,
      validationId: validationResult.id,
      status: responseStatus,
      checks,
      blockers,
      warnings,
      risk,
      confidence,
      ...(degradedMode && { degradedMode }),
    });
  } catch (err) {
    console.error('[Campaign] validate-scope error:', err);
    return res.status(500).json({
      ok: false,
      error: 'validate_scope_failed',
      message: err.message || 'Validation failed',
    });
  }
});

/**
 * POST /api/campaign/create-from-plan (Phase B.1 + B.2)
 * B.1: CampaignV2 + 2 CampaignScheduleItem + campaign.create + schedule.create tasks + AuditEvents.
 * B.2 (optional, generateCreatives !== false): 3 CreativeCopy + 1 CreativeAsset (image_prompt) + creative.generate task + creative_created AuditEvent. Template-only; no LLM.
 * requireAuth; plan must be validated (no blockers).
 */
router.post('/create-from-plan', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] POST /create-from-plan', userId ? 'authenticated' : 'anon');
    }
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    const tenantKey = getTenantId(req.user) || userId;
    const prisma = getPrismaClient();
    const body = req.body ?? {};
    const planId = typeof body.planId === 'string' && body.planId.trim() ? body.planId.trim() : null;
    if (!planId) return res.status(400).json({ ok: false, error: 'plan_id_required', message: 'planId is required' });

    const plan = await prisma.campaignPlan.findFirst({
      where: { id: planId, tenantKey },
      select: { id: true, tenantKey: true, missionId: true, storeId: true, draftStoreId: true, objective: true, status: true, timeWindow: true, target: true, channelsRequested: true },
    });
    if (!plan) return res.status(404).json({ ok: false, error: 'not_found', message: 'Plan not found or access denied' });
    if (plan.tenantKey !== tenantKey) return res.status(403).json({ ok: false, error: 'forbidden', message: 'Plan does not belong to your tenant' });

    const latestValidation = await prisma.campaignValidationResult.findFirst({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, blockers: true, warnings: true },
    });
    const blockers = Array.isArray(latestValidation?.blockers) ? latestValidation.blockers : [];
    if (!latestValidation || blockers.length > 0 || plan.status !== 'validated') {
      return res.status(409).json({
        ok: false,
        error: 'plan_not_validated',
        message: 'Plan must be validated with no blockers before creating campaign',
        reasonCodes: blockers.length ? blockers.map((b) => b.code || 'BLOCKER') : ['NO_VALIDATION', 'PLAN_NOT_VALIDATED'],
      });
    }

    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : plan.objective;
    const planTz = plan.timeWindow && typeof plan.timeWindow === 'object' && typeof plan.timeWindow.tz === 'string' ? plan.timeWindow.tz : null;
    let scheduleTimes;
    let scheduleDefaultTz = 'UTC';
    const SCHEDULE_MIN = 2;
    const SCHEDULE_MAX = 30;
    if (Array.isArray(body.schedule?.times) && body.schedule.times.length > 0) {
      scheduleTimes = body.schedule.times
        .filter((t) => typeof t === 'string')
        .map((t) => new Date(t))
        .filter((d) => !isNaN(d.getTime()));
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Campaign] create-from-plan using body.schedule.times', { length: scheduleTimes.length, first: scheduleTimes[0]?.toISOString?.(), last: scheduleTimes[scheduleTimes.length - 1]?.toISOString?.() });
      }
      if (scheduleTimes.length < SCHEDULE_MIN) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_schedule',
          message: `schedule.times must have at least ${SCHEDULE_MIN} valid ISO date strings (got ${scheduleTimes.length})`,
        });
      }
      if (scheduleTimes.length > SCHEDULE_MAX) {
        scheduleTimes = scheduleTimes.slice(0, SCHEDULE_MAX);
      }
      scheduleTimes.sort((a, b) => a.getTime() - b.getTime());
    } else {
      const smart = smartScheduleFallback(plan);
      if (smart && smart.length >= 2) {
        scheduleTimes = smart.slice(0, SCHEDULE_MAX);
        scheduleDefaultTz = 'UTC';
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Campaign] create-from-plan using smart schedule fallback', { length: scheduleTimes.length });
        }
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[Campaign] create-from-plan using default schedule (body.schedule.times missing or empty)', { hasSchedule: !!body.schedule, timesLength: body.schedule?.times?.length ?? 'n/a' });
        }
        const def = defaultScheduleTimes(planTz);
        scheduleTimes = def.times.map((s) => new Date(s));
        scheduleDefaultTz = def.defaultTz;
      }
    }
    if (scheduleTimes.length < SCHEDULE_MIN) {
      const def = defaultScheduleTimes(planTz);
      scheduleTimes = def.times.map((s) => new Date(s));
      scheduleDefaultTz = def.defaultTz;
    }
    // Channels for schedule items: one row per (time, channel) so 8 times × N channels = 8×N items. No change to schedule engine.
    const rawChannels = Array.isArray(body.channels) ? body.channels : (Array.isArray(plan.channelsRequested) ? plan.channelsRequested : []);
    const channelAllowList = ['scheduled_posts', 'facebook', 'instagram', 'tiktok', 'email', 'qr', 'website_banner'];
    const channelsForSchedule = rawChannels.length > 0
      ? [...new Set(rawChannels.filter((c) => typeof c === 'string' && channelAllowList.includes(String(c).trim())))]
      : ['scheduled_posts'];
    if (channelsForSchedule.length === 0) channelsForSchedule.push('scheduled_posts');

    const warningsList = Array.isArray(latestValidation?.warnings) ? latestValidation.warnings : [];
    const hasOauthWarning = warningsList.some((w) => w && (w.code === 'OAUTH_NOT_CONNECTED' || (Array.isArray(w.reasonCodes) && w.reasonCodes.includes('OAUTH_NOT_CONNECTED'))));
    const degradedMode = hasOauthWarning ? { reasonCodes: ['OAUTH_NOT_CONNECTED'], allowedChannels: ['scheduled_posts'] } : null;
    const degradedFromPlan = latestValidation?.degradedMode ?? plan?.degradedMode ?? degradedMode ?? null;

    const out = { campaignId: null, schedules: [] };

    await prisma.$transaction(async (tx) => {
      const cv2 = await tx.campaignV2.create({
        data: {
          tenantKey,
          planId: plan.id,
          missionId: plan.missionId ?? undefined,
          storeId: plan.storeId ?? undefined,
          draftStoreId: plan.draftStoreId ?? undefined,
          title,
          objective: plan.objective,
          status: 'DRAFT',
          degradedMode: degradedMode ?? undefined,
        },
      });
      out.campaignId = cv2.id;

      for (let i = 0; i < scheduleTimes.length; i++) {
        const scheduledAt = scheduleTimes[i];
        for (const ch of channelsForSchedule) {
          const item = await tx.campaignScheduleItem.create({
            data: {
              tenantKey,
              campaignId: cv2.id,
              channel: ch,
              scheduledAt,
              status: 'SCHEDULED',
            },
          });
          out.schedules.push({ id: item.id, channel: ch, scheduledAt: item.scheduledAt, status: item.status });
        }
      }

      await tx.auditEvent.create({
        data: {
          entityType: 'CampaignV2',
          entityId: cv2.id,
          action: 'campaign_created',
          fromStatus: null,
          toStatus: 'DRAFT',
          actorType: 'human',
          actorId: userId,
          reason: 'create_from_plan',
          metadata: { planId: plan.id },
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'CampaignV2',
          entityId: cv2.id,
          action: 'schedule_created',
          fromStatus: null,
          toStatus: null,
          actorType: 'human',
          actorId: userId,
          reason: 'create_from_plan',
          metadata: { campaignId: cv2.id, count: scheduleTimes.length * channelsForSchedule.length, scheduleDefaultTz, channels: channelsForSchedule },
        },
      });
      // CampaignV2 stays DRAFT until tasks complete; status updated after task lifecycle below.
    });

    const campaignId = out.campaignId;
    if (!campaignId) {
      return res.status(500).json({ ok: false, error: 'create_campaign_failed', message: 'Campaign id not set after transaction' });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Campaign] create-from-plan saved campaign', { campaignId, tenantKey, missionIdStored: plan.missionId ?? null, planId: plan.id });
    }

    const taskPayload = {
      campaignId,
      planId,
      tenantKey,
      tags: { campaignId, missionId: plan.missionId ?? null, phaseId: 'create_campaign' },
    };
    const tasks = [];
    const ACTOR = 'automation';

    const t1 = await prisma.orchestratorTask.create({
      data: { entryPoint: 'campaign.create', tenantId: tenantKey, userId, status: 'queued', request: taskPayload },
    });
    const run1 = await transitionOrchestratorTaskStatus({
      prisma,
      taskId: t1.id,
      toStatus: 'running',
      fromStatus: 'queued',
      actorType: ACTOR,
      reason: 'CAMPAIGN_CREATE',
      correlationId: campaignId,
    });
    const completed1 = run1.ok
      ? await transitionOrchestratorTaskStatus({
          prisma,
          taskId: t1.id,
          toStatus: 'completed',
          fromStatus: 'running',
          actorType: ACTOR,
          reason: 'CAMPAIGN_CREATE',
          correlationId: campaignId,
          result: { campaignId, planId },
        })
      : { ok: false };
    const status1 = completed1.ok ? 'completed' : run1.ok ? 'running' : 'queued';
    tasks.push({ id: t1.id, type: 'campaign.create', status: status1 });

    const t2 = await prisma.orchestratorTask.create({
      data: { entryPoint: 'schedule.create', tenantId: tenantKey, userId, status: 'queued', request: taskPayload },
    });
    const run2 = await transitionOrchestratorTaskStatus({
      prisma,
      taskId: t2.id,
      toStatus: 'running',
      fromStatus: 'queued',
      actorType: ACTOR,
      reason: 'SCHEDULE_CREATE',
      correlationId: campaignId,
    });
    const completed2 = run2.ok
      ? await transitionOrchestratorTaskStatus({
          prisma,
          taskId: t2.id,
          toStatus: 'completed',
          fromStatus: 'running',
          actorType: ACTOR,
          reason: 'SCHEDULE_CREATE',
          correlationId: campaignId,
          result: { count: scheduleTimes.length },
        })
      : { ok: false };
    const status2 = completed2.ok ? 'completed' : run2.ok ? 'running' : 'queued';
    tasks.push({ id: t2.id, type: 'schedule.create', status: status2 });

    const bothSucceeded = completed1.ok && completed2.ok;

    let creatives = null;
    const generateCreatives = body.generateCreatives !== false;
    if (generateCreatives) {
      try {
        const copies = [];
        for (let i = 0; i < 3; i++) {
          const text = generateCaptionFromPlan(plan, i);
          const row = await prisma.creativeCopy.create({
            data: { tenantKey, campaignId, kind: 'caption', text },
          });
          copies.push({ id: row.id, text: row.text });
        }
        const prompt = generateImagePromptFromPlan(plan);
        const asset = await prisma.creativeAsset.create({
          data: { tenantKey, campaignId, type: 'image_prompt', prompt },
        });
        const t3 = await prisma.orchestratorTask.create({
          data: { entryPoint: 'creative.generate', tenantId: tenantKey, userId, status: 'queued', request: { ...taskPayload, copyCount: 3, assetCount: 1 } },
        });
        const run3 = await transitionOrchestratorTaskStatus({
          prisma,
          taskId: t3.id,
          toStatus: 'running',
          fromStatus: 'queued',
          actorType: ACTOR,
          reason: 'CREATIVE_GENERATE',
          correlationId: campaignId,
        });
        const completed3 = run3.ok
          ? await transitionOrchestratorTaskStatus({
              prisma,
              taskId: t3.id,
              toStatus: 'completed',
              fromStatus: 'running',
              actorType: ACTOR,
              reason: 'CREATIVE_GENERATE',
              correlationId: campaignId,
              result: { copyCount: 3, assetCount: 1 },
            })
          : { ok: false };
        tasks.push({ id: t3.id, type: 'creative.generate', status: completed3.ok ? 'completed' : run3.ok ? 'running' : 'queued' });
        await prisma.auditEvent.create({
          data: {
            entityType: 'CampaignV2',
            entityId: campaignId,
            action: 'creative_created',
            fromStatus: null,
            toStatus: null,
            actorType: 'human',
            actorId: userId,
            reason: 'create_from_plan',
            metadata: { copyCount: 3, assetCount: 1 },
          },
        });
        creatives = {
          copies,
          assets: [{ id: asset.id, type: asset.type, prompt: asset.prompt }],
        };
      } catch (creativeErr) {
        console.error('[Campaign] create-from-plan creatives error:', creativeErr);
        creatives = null;
        const errCode = creativeErr?.code || 'CREATIVE_CREATE_FAILED';
        const category = creativeErr?.name === 'PrismaClientKnownRequestError' ? 'database' : 'runtime';
        await prisma.auditEvent.create({
          data: {
            entityType: 'CampaignV2',
            entityId: campaignId,
            action: 'creative_create_failed',
            fromStatus: null,
            toStatus: null,
            actorType: 'automation',
            actorId: userId,
            reason: 'create_from_plan',
            metadata: { errorCode: errCode, category },
          },
        }).catch((auditErr) => console.warn('[Campaign] audit creative_create_failed failed:', auditErr?.message));
      }
    }

    // Phase B.3: Offer + ChannelDeployments + channel.deploy task
    const rawRequested = Array.isArray(body.channels) ? body.channels : (Array.isArray(plan.channelsRequested) ? plan.channelsRequested : []);
    const requestedChannels = rawRequested.filter((c) => typeof c === 'string').map((c) => String(c).trim());
    const allowedFromDegraded = degradedFromPlan?.allowedChannels && Array.isArray(degradedFromPlan.allowedChannels) && degradedFromPlan.allowedChannels.length > 0
      ? degradedFromPlan.allowedChannels
      : (degradedFromPlan ? ['scheduled_posts'] : null);
    const allowedChannels = allowedFromDegraded ?? (requestedChannels.length > 0 ? requestedChannels : ['scheduled_posts']);
    const normalizedChannels = [...new Set(allowedChannels.filter((c) => channelAllowList.includes(c)))];
    const channelsToDeploy = normalizedChannels.length > 0 ? normalizedChannels : ['scheduled_posts'];
    const droppedChannels = requestedChannels.length > 0 ? requestedChannels.filter((c) => !channelsToDeploy.includes(c)) : [];

    const offerPayload = body.offer && typeof body.offer === 'object' && (body.offer.type || body.offer.data)
      ? { type: body.offer.type || 'discount', data: typeof body.offer.data === 'object' ? body.offer.data : {} }
      : null;
    const timeWindow = plan.timeWindow && typeof plan.timeWindow === 'object' ? plan.timeWindow : {};
    const validFrom = timeWindow.start && typeof timeWindow.start === 'string' ? timeWindow.start : new Date().toISOString();
    const validTo = timeWindow.end && typeof timeWindow.end === 'string' ? timeWindow.end : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const target = plan.target && typeof plan.target === 'object' ? plan.target : {};
    const appliesTo = target.productId ?? target.category ?? 'all';
    const defaultOfferData = { value: '10%', appliesTo, validFrom, validTo };
    const offerData = offerPayload ? { ...defaultOfferData, ...offerPayload.data } : defaultOfferData;
    const offerType = offerPayload?.type ?? 'discount';

    const offerRow = await prisma.offer.create({
      data: { tenantKey, campaignId, type: offerType, data: offerData, status: 'ACTIVE' },
    });
    const deploymentsOut = [];
    for (const ch of channelsToDeploy) {
      const mode = 'scheduled_posts';
      const depData = {};
      if (degradedFromPlan?.reasonCodes?.length) depData.reasonCodes = degradedFromPlan.reasonCodes;
      if (requestedChannels.length) depData.requestedChannels = requestedChannels;
      if (droppedChannels.length) depData.droppedChannels = droppedChannels;
      const dep = await prisma.channelDeployment.create({
        data: { tenantKey, campaignId, channel: ch, mode, status: 'ACTIVE', data: Object.keys(depData).length > 0 ? depData : undefined },
      });
      deploymentsOut.push({ id: dep.id, channel: dep.channel, mode: dep.mode, status: dep.status });
    }

    const t4 = await prisma.orchestratorTask.create({
      data: { entryPoint: 'channel.deploy', tenantId: tenantKey, userId, status: 'queued', request: { ...taskPayload, mode: 'scheduled_posts', degraded: !!degradedFromPlan, channelCount: channelsToDeploy.length } },
    });
    const run4 = await transitionOrchestratorTaskStatus({
      prisma,
      taskId: t4.id,
      toStatus: 'running',
      fromStatus: 'queued',
      actorType: ACTOR,
      reason: 'CHANNEL_DEPLOY',
      correlationId: campaignId,
    });
    const completed4 = run4.ok
      ? await transitionOrchestratorTaskStatus({
          prisma,
          taskId: t4.id,
          toStatus: 'completed',
          fromStatus: 'running',
          actorType: ACTOR,
          reason: 'CHANNEL_DEPLOY',
          correlationId: campaignId,
          result: { mode: 'scheduled_posts', degraded: !!degradedFromPlan, deploymentCount: deploymentsOut.length },
        })
      : { ok: false };
    tasks.push({ id: t4.id, type: 'channel.deploy', status: completed4.ok ? 'completed' : run4.ok ? 'running' : 'queued' });

    await prisma.auditEvent.create({
      data: {
        entityType: 'Offer',
        entityId: offerRow.id,
        action: 'offer_created',
        fromStatus: null,
        toStatus: null,
        actorType: 'human',
        actorId: userId,
        reason: 'create_from_plan',
        metadata: { campaignId, type: offerType, appliesTo },
      },
    });
    await prisma.auditEvent.create({
      data: {
        entityType: 'CampaignV2',
        entityId: campaignId,
        action: 'deployments_created',
        fromStatus: null,
        toStatus: null,
        actorType: 'human',
        actorId: userId,
        reason: 'create_from_plan',
        metadata: { count: deploymentsOut.length, channels: channelsToDeploy },
      },
    });

    // SCHEDULED requires schedules (B.1) + deployments (B.3); cache allowedChannels for UI
    const finalStatus = (bothSucceeded && deploymentsOut.length > 0)
      ? 'SCHEDULED'
      : (bothSucceeded ? 'DRAFT' : 'FAILED');
    await prisma.campaignV2.update({
      where: { id: campaignId },
      data: { status: finalStatus, allowedChannels: channelsToDeploy, updatedAt: new Date() },
    });

    return res.status(200).json({
      ok: true,
      campaignId,
      status: finalStatus,
      schedules: out.schedules,
      tasks,
      deployments: deploymentsOut,
      offer: { id: offerRow.id, type: offerRow.type, status: offerRow.status, data: offerRow.data },
      ...(creatives !== null && { creatives }),
    });
  } catch (err) {
    console.error('[Campaign] create-from-plan error:', err);
    return res.status(500).json({
      ok: false,
      error: 'create_campaign_failed',
      message: err.message || 'Create campaign failed',
    });
  }
});

export default router;

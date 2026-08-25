/**
 * Admin overview aggregator for marketing Facebook operator.
 */

import { Features, snapshotFeatures } from '../../config/features.js';
import { getCardbeyCapabilityRegistry } from './capabilityRegistry.js';
import { FUNNEL_STAGES } from './constants.js';
import { getMetaIntegrationDiagnostics } from './diagnostics.js';
import { generateRecommendation } from './aiGeneration.js';
import { marketingRepo } from './repository.js';

/**
 * @returns {Promise<object>}
 */
export async function getMarketingFacebookOverview() {
  const flags = snapshotFeatures().marketingOperator;
  const registry = getCardbeyCapabilityRegistry();

  let counts = {
    campaigns: 0,
    contentDrafts: 0,
    contentApproved: 0,
    publications: 0,
    engagementsOpen: 0,
    webhookEvents: 0,
  };

  try {
    counts.campaigns = await marketingRepo.campaign.count({});
    counts.contentDrafts = await marketingRepo.content.count({ where: { status: 'DRAFT' } });
    counts.contentApproved = await marketingRepo.content.count({ where: { status: 'APPROVED' } });
    const pubs = await marketingRepo.publication.findMany({ take: 500 });
    counts.publications = pubs.length;
    counts.engagementsOpen = await marketingRepo.engagement.count({ where: { status: 'OPEN' } });
    counts.webhookEvents = await marketingRepo.webhookEvent.count({});
  } catch {
    counts.error = 'tables_unavailable';
  }

  const diagnostics = await getMetaIntegrationDiagnostics();

  return {
    ok: true,
    enabled: Features.marketingOperator.v1 === true,
    flags,
    capability: {
      positioning: registry.positioning,
      languages: registry.languages,
      readiness: registry.readiness,
      targetTypeThisPhase: 'USER_ACQUISITION',
      reservedTargetTypes: ['INVESTOR_DISCOVERY'],
      channel: 'facebook',
    },
    counts,
    diagnostics: {
      configured: diagnostics.configured,
      graphApiVersion: diagnostics.graphApiVersion,
      liveMetaVerified: false,
      webhook: diagnostics.webhook,
      lastSuccessAt: diagnostics.lastSuccessAt,
      readinessRows: diagnostics.readinessRows,
    },
    killSwitches: {
      master: !flags.v1,
      livePublishing: !flags.livePublishingV1,
      responseSending: !flags.responseSendingV1,
      webhookConsume: !flags.webhookConsumeV1,
      autonomy: !flags.autonomyV1,
    },
    note: 'Channel operator under Marketing Operations. Foundation overview — NOT live Meta verified. Live actions default OFF.',
    marketingOperations: {
      layer: 'channel_operator',
      consumesSharedCampaignContract: true,
      liveMeta: false,
    },
  };
}

/**
 * Structured funnel analytics (flag-gated). Never invent Meta reach as real.
 * @param {{ campaignId?: string, rangeDays?: number }} [opts]
 */
export async function getMarketingAnalytics(opts = {}) {
  if (!Features.marketingOperator.analyticsV1) {
    return { ok: false, error: 'analytics_disabled' };
  }

  const rangeDays = Math.min(Math.max(Number(opts.rangeDays) || 30, 1), 90);
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const campaignId = opts.campaignId || null;

  try {
    const conversionWhere = {
      occurredAt: { gte: since },
      ...(campaignId ? { campaignId } : {}),
    };
    const conversions = await marketingRepo.conversion.findMany({
      where: conversionWhere,
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
    const contentItems = await marketingRepo.content.findMany({
      where: campaignId ? { campaignId } : {},
      take: 200,
    });
    const metrics = await marketingRepo.metric.findMany({
      where: {
        capturedAt: { gte: since },
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { capturedAt: 'desc' },
      take: 50,
    });

    const stages = FUNNEL_STAGES.map((stage) => {
      const rows = conversions.filter((c) => c.eventType === stage.key);
      const simulated = rows.some((c) => c.simulated === true);
      const firstParty = rows.some((c) => c.simulated !== true);
      let source = 'unavailable';
      if (rows.length === 0) source = 'unavailable';
      else if (simulated && !firstParty) source = 'simulated';
      else if (firstParty) source = 'first_party';
      else source = 'mock';
      return {
        key: stage.key,
        label: stage.label,
        count: rows.length,
        source,
      };
    });

    const byLanguage = {};
    for (const c of contentItems) {
      const lang = c.language || 'unknown';
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    }

    const byContent = contentItems.slice(0, 50).map((c) => ({
      id: c.id,
      title: c.title,
      language: c.language,
      status: c.status,
      contentType: c.contentType,
    }));

    const rec = await generateRecommendation({
      campaignId,
      stats: { stages, contentCount: contentItems.length },
    });

    return {
      ok: true,
      range: { days: rangeDays, since: since.toISOString() },
      stages,
      byLanguage,
      byContent,
      recommendations: [rec.recommendation],
      // Raw retained for debugging — not Meta reach claims
      snapshots: { metricsCount: metrics.length, conversionCount: conversions.length },
      liveMetaVerified: false,
      note: 'Funnel counts are first-party/simulated/mock only. Meta reach is unavailable.',
    };
  } catch (err) {
    return { ok: false, error: 'analytics_unavailable', message: err?.message };
  }
}

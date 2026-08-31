/**
 * Meta integration diagnostics — never expose tokens.
 */

import { Features } from '../../config/features.js';
import { getMetaGraphApiVersion } from './constants.js';
import { marketingRepo } from './repository.js';
import { isWebhookVerificationConfigured, WEBHOOK_VERIFICATION_NOT_CONFIGURED } from './webhookMeta.js';

/**
 * @returns {Promise<object>}
 */
export async function getMetaIntegrationDiagnostics() {
  const pageId = String(process.env.CARDBEY_FACEBOOK_PAGE_ID || '').trim();
  const verifyTokenSet = Boolean(String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim());
  const appSecretSet = Boolean(String(process.env.META_WEBHOOK_APP_SECRET || '').trim());
  const appIdSet = Boolean(
    String(process.env.FACEBOOK_CLIENT_ID || process.env.FACEBOOK_APP_ID || '').trim(),
  );
  const webhookConfigured = isWebhookVerificationConfigured();

  let lastPublication = null;
  let webhookCounts = { received: 0, processed: 0, rejected: 0 };
  try {
    const pubs = await marketingRepo.publication.findMany({
      where: { provider: { in: ['facebook', 'meta_facebook_page', 'mock'] }, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 1,
    });
    lastPublication = pubs[0]
      ? {
          id: pubs[0].id,
          publishedAt: pubs[0].publishedAt,
          provider: pubs[0].provider,
          status: pubs[0].status,
        }
      : null;
    webhookCounts.received = await marketingRepo.webhookEvent.count({});
    webhookCounts.processed = await marketingRepo.webhookEvent.count({
      where: { status: 'PROCESSED' },
    });
    webhookCounts.rejected = await marketingRepo.webhookEvent.count({
      where: { status: 'REJECTED' },
    });
  } catch {
    /* tables may be missing pre-migrate */
  }

  const flags = {
    v1: Features.marketingOperator.v1,
    facebookProviderV1: Features.marketingOperator.facebookProviderV1,
    aiGenerationV1: Features.marketingOperator.aiGenerationV1,
    approvalWorkflowV1: Features.marketingOperator.approvalWorkflowV1,
    livePublishingV1: Features.marketingOperator.livePublishingV1,
    engagementInboxV1: Features.marketingOperator.engagementInboxV1,
    responseSendingV1: Features.marketingOperator.responseSendingV1,
    webhookConsumeV1: Features.marketingOperator.webhookConsumeV1,
    attributionV1: Features.marketingOperator.attributionV1,
    analyticsV1: Features.marketingOperator.analyticsV1,
    autoScheduleV1: Features.marketingOperator.autoScheduleV1,
  };

  /** @type {Array<{ check: string, state: 'ok'|'warn'|'blocked', action: string }>} */
  const readinessRows = [
    {
      check: 'marketing_operator_v1',
      state: flags.v1 ? 'ok' : 'blocked',
      action: flags.v1 ? 'Operator enabled' : 'Set ENABLE_MARKETING_OPERATOR_V1=true for pilot',
    },
    {
      check: 'approval_workflow_v1',
      state: flags.approvalWorkflowV1 ? 'ok' : 'warn',
      action: flags.approvalWorkflowV1
        ? 'Approvals enabled'
        : 'Enable ENABLE_MARKETING_APPROVAL_WORKFLOW_V1 for approve/schedule integrity',
    },
    {
      check: 'webhook_verification',
      state: webhookConfigured ? 'ok' : 'blocked',
      action: webhookConfigured
        ? 'Verify token + app secret present'
        : `Configure META_WEBHOOK_VERIFY_TOKEN and META_WEBHOOK_APP_SECRET (${WEBHOOK_VERIFICATION_NOT_CONFIGURED})`,
    },
    {
      check: 'webhook_consume',
      state: !flags.webhookConsumeV1
        ? 'ok'
        : webhookConfigured
          ? 'warn'
          : 'blocked',
      action: !flags.webhookConsumeV1
        ? 'Consume OFF (safe default)'
        : webhookConfigured
          ? 'Consume ON — ensure Meta app signed webhooks only'
          : 'Consume ON but verification not configured — fail-closed',
    },
    {
      check: 'live_publishing',
      state: flags.livePublishingV1 ? 'blocked' : 'ok',
      action: flags.livePublishingV1
        ? 'LIVE publishing flag is ON — confirm intentional; not live Meta verified by default'
        : 'Live publishing OFF (mock provider default)',
    },
    {
      check: 'response_sending',
      state: flags.responseSendingV1 ? 'blocked' : 'ok',
      action: flags.responseSendingV1
        ? 'Live response sending flag ON — still not Meta verified; use mock-send for pilot'
        : 'Response sending OFF; use mock-send for pilot',
    },
    {
      check: 'auto_schedule_worker',
      state: flags.autoScheduleV1 ? 'warn' : 'ok',
      action: flags.autoScheduleV1
        ? 'Worker polling ON (mock unless live flags)'
        : 'Worker polling OFF; admin run-cycle can force in non-production',
    },
  ];

  return {
    ok: true,
    configured: {
      appIdPresent: appIdSet,
      pageIdPresent: Boolean(pageId),
      pageId: pageId || null,
      webhookVerifyTokenPresent: verifyTokenSet,
      webhookAppSecretPresent: appSecretSet,
      scopesKnown: false,
      scopes: null,
    },
    graphApiVersion: getMetaGraphApiVersion(),
    liveMetaVerified: false,
    lastSuccessAt: lastPublication?.publishedAt || null,
    lastPublication,
    webhook: {
      consumeEnabled: flags.webhookConsumeV1,
      verifyConfigured: webhookConfigured,
      verificationCode: webhookConfigured ? null : WEBHOOK_VERIFICATION_NOT_CONFIGURED,
      counts: webhookCounts,
    },
    flags,
    readinessRows,
    readiness: {
      foundationReady: true,
      controlledPilotReady: flags.v1 && flags.approvalWorkflowV1,
      livePublishingReady: false,
      note: 'Foundation/controlled pilot diagnostics — NOT live Meta verified.',
    },
  };
}

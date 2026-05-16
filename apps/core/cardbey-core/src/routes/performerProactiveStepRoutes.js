/**
 * POST /api/performer/proactive-step
 * Proactive campaign runway: run one allowlisted tool via toolDispatcher and update MissionPipeline
 * status/runState so GET /api/missions/:id/state reflects progress (resolver reads MissionPipeline).
 *
 * POST /api/performer/proactive-step/confirm — Phase B after product selection.
 *
 * --- Wave 3.1 (architecture) ---
 * **Execution entry:** This router is the live Performer execution surface for proactive runway
 * (orchestrated tool dispatch + confirm-phase services). MissionPipeline holds timeline/state;
 * planner produces intent/plan elsewhere. MissionPipeline writes go through `advanceProactivePipelineStep`
 * (gated on executionMode; see advanceProactivePipelineStep.js).
 * Do not route new execution here without Integrator review — wrapper: `dispatchExecution`.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { advanceProactivePipelineStep } from '../lib/orchestrator/advanceProactivePipelineStep.js';
import { dispatchExecution } from '../lib/orchestrator/dispatchExecution.js';
import { getTenantId } from '../lib/missionAccess.js';
import { dispatchTaskWithAgentHint } from '../lib/agentPlanning/agentOrchestrator.js';
import { PROACTIVE_RUNWAY_TOOL_SET, resolveRunwayDispatchToolName } from '../lib/missionPlan/proactiveRunwayToolAllowlist.js';
import { hasRole } from '../lib/authorization.js';
import {
  resolveCodeFixProposedPatchForApply,
  buildCanonicalCodeFixErrorOutput,
} from '../services/codeFixCanonicalOutput.js';
import {
  createMissionContext,
  snapshotMissionStep,
  closeMissionContext,
  checkAndCorrectCourse,
} from '../services/missionContextService.js';
import { buildAndStoreMissionHypothesis } from '../services/missionContextService.js';
import {
  buildStepContext,
  writeStepOutput,
  shouldPersistStepOutputToBus,
} from '../lib/missionContextBus.js';
import {
  sendCampaignEmail,
  createCalendarEvent,
  createStripePromotion,
} from '../lib/externalActions/index.js';

const isDev = process.env.NODE_ENV !== 'production';

function proactivePlanStepTitle(body) {
  const ps = body?.proactivePlanStep;
  if (ps && typeof ps === 'object' && typeof ps.title === 'string' && ps.title.trim()) {
    return ps.title.trim();
  }
  return null;
}

/**
 * Same ownership idea as missionBlackboard / missionAccess: pipeline id may also exist as a shadow Mission row.
 * MissionAccess resolves Mission first (kind=mission), which made POST / reject when we required kind=mission_pipeline only.
 * Here: authorize via MissionPipeline if present, else Mission — rules aligned with missionAccess.js.
 *
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'NOT_FOUND' | 'FORBIDDEN' }>}
 */
async function assertProactivePipelineOrMissionAccess(user, missionId) {
  const prisma = getPrismaClient();
  const pipeline = await prisma.missionPipeline.findFirst({
    where: { id: missionId },
    select: { id: true, tenantId: true, createdBy: true },
  });

  if (pipeline) {
    const tenantId = getTenantId(user);
    const allowed =
      !pipeline.tenantId ||
      pipeline.tenantId === tenantId ||
      (pipeline.createdBy && user?.id && pipeline.createdBy === user.id);
    if (!allowed) {
      if (isDev) console.log('[ProactiveStep] forbidden mission_pipeline missionId=', missionId);
      return { ok: false, reason: 'FORBIDDEN' };
    }
    if (isDev) console.log('[ProactiveStep] access ok via mission_pipeline missionId=', missionId);
    return { ok: true };
  }

  const mission = await prisma.mission.findFirst({
    where: { id: missionId },
    select: { id: true, tenantId: true, createdByUserId: true },
  });

  if (!mission) {
    if (isDev) console.log('[ProactiveStep] not found missionId=', missionId);
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const ownerId = user?.id;
  const businessId = user?.business?.id;
  const isOwner =
    mission.createdByUserId === ownerId ||
    mission.tenantId === ownerId ||
    mission.tenantId === businessId;
  const devPlaceholder =
    mission.createdByUserId === 'temp' ||
    mission.tenantId === 'temp' ||
    mission.createdByUserId === 'dev-user-id' ||
    mission.tenantId === 'dev-user-id';
  const devBypass = isDev && ownerId && devPlaceholder;
  if (!(isOwner || devBypass)) {
    if (isDev) console.log('[ProactiveStep] forbidden mission missionId=', missionId);
    return { ok: false, reason: 'FORBIDDEN' };
  }
  if (isDev) console.log('[ProactiveStep] access ok via mission (shadow) missionId=', missionId);
  return { ok: true };
}

const router = express.Router();

const openClawMissionSteps = process.env.OPENCLAW_MISSION_STEPS === 'true';
console.log(
  '[ProactiveStep] agent dispatch mode:',
  openClawMissionSteps ? 'OpenClaw (OPENCLAW_MISSION_STEPS=true)' : 'dispatchTool (OpenClaw disabled)',
);

// Full tool allowlist — must match toolRegistry.js (via proactiveRunwayToolAllowlist.js) +
// PLAN_STEP_ALLOWED_TOOLS in performerIntakeRoutes.js. When adding a registry tool, it is included automatically.
const ALLOWED_TOOLS = PROACTIVE_RUNWAY_TOOL_SET;

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** @returns {boolean} true if HTTP error response was sent (caller should return). */
function respondIfAdvanceFailed(res, advanceResult) {
  if (advanceResult.ok) return false;
  const status =
    advanceResult.code === 'NOT_GUIDED' ? 409 : advanceResult.code === 'NOT_FOUND' ? 404 : 500;
  res.status(status).json({
    ok: false,
    message: advanceResult.message,
    code: advanceResult.code,
  });
  return true;
}

const SOCIAL_POST_COMPLETE_TOOLS = new Set(['publish_to_social', 'connect_social_account']);

function landingPageUrlFromDeployChannels(channels) {
  if (!Array.isArray(channels)) return null;
  for (const ch of channels) {
    if (!ch || typeof ch !== 'object') continue;
    if (String(ch.channel) === 'landing_page' && typeof ch.landingPageUrl === 'string' && ch.landingPageUrl.trim()) {
      return ch.landingPageUrl.trim();
    }
  }
  return null;
}

/**
 * Adds social_share_recommendation to launch_campaign output when phase is deployed.
 * @param {object} stepOut — mutated in place
 */
async function attachSocialShareRecommendationToLaunchOutput(stepOut, { userId, prisma, stepOutputs }) {
  if (!stepOut || typeof stepOut !== 'object' || Array.isArray(stepOut)) return;
  if (String(stepOut.phase) !== 'deployed') return;
  try {
    const connectedAccounts = await prisma.oAuthConnection.findMany({
      where: { userId },
      select: { platform: true, pageName: true },
    });
    const lc = asObject(stepOutputs?.launch_campaign);
    const campaignUrl =
      landingPageUrlFromDeployChannels(stepOut.channels) ??
      (typeof stepOut.landingPageUrl === 'string' ? stepOut.landingPageUrl.trim() : null) ??
      landingPageUrlFromDeployChannels(lc.channels) ??
      (typeof lc.landingPageUrl === 'string' ? lc.landingPageUrl.trim() : null) ??
      null;

    stepOut.recommendation = {
      type: 'social_share_recommendation',
      tool: 'publish_to_social',
      priority: 'high',
      campaignUrl,
      connectedPlatforms: connectedAccounts.map((a) => a.platform),
      message:
        connectedAccounts.length > 0
          ? `Your campaign is live! Share it on ${connectedAccounts.map((a) => a.platform).join(', ')}?`
          : 'Your campaign is live! Share it on social media?',
      actions:
        connectedAccounts.length > 0
          ? [
              {
                label: `Share to ${connectedAccounts[0].pageName ?? connectedAccounts[0].platform}`,
                tool: 'publish_to_social',
                params: { platforms: [connectedAccounts[0].platform], postMode: 'auto' },
              },
              {
                label: 'Share link everywhere',
                tool: 'publish_to_social',
                params: { platforms: ['all'], postMode: 'share_link' },
              },
              { label: 'Copy campaign link', action: 'copy_link', value: campaignUrl },
            ]
          : [
              {
                label: 'Share to Facebook',
                tool: 'publish_to_social',
                params: { platforms: ['facebook'], postMode: 'share_link' },
              },
              {
                label: 'Share to Zalo',
                tool: 'publish_to_social',
                params: { platforms: ['zalo'], postMode: 'share_link' },
              },
              {
                label: 'Share everywhere',
                tool: 'publish_to_social',
                params: { platforms: ['all'], postMode: 'share_link' },
              },
              {
                label: 'Connect Facebook for auto-posting',
                tool: 'connect_social_account',
                params: { platform: 'facebook' },
              },
            ],
    };
    console.log('[ProactiveStep] launch_campaign recommendation emitted', {
      connectedCount: connectedAccounts.length,
      campaignUrl,
    });
  } catch (e) {
    console.warn('[ProactiveStep] recommendation hook failed:', e?.message ?? e);
  }
}

/**
 * Read agentHint from persisted LLM/registry task graph (mission.context.agentMemory.taskGraph).
 * @param {string} missionId
 * @param {number} stepNumber 1-based proactive step index
 * @returns {Promise<string>}
 */
async function resolveAgentHintForStep(missionId, stepNumber) {
  try {
    const prisma = getPrismaClient();
    const mission = await prisma.mission
      .findUnique({
        where: { id: missionId },
        select: { context: true },
      })
      .catch(() => null);

    if (!mission?.context) return 'dispatchTool';

    const ctx = typeof mission.context === 'object' && mission.context !== null ? mission.context : {};
    const agentMemory = ctx.agentMemory && typeof ctx.agentMemory === 'object' ? ctx.agentMemory : {};
    const taskGraph = agentMemory.taskGraph;

    if (!taskGraph?.tasks || !Array.isArray(taskGraph.tasks)) {
      return 'dispatchTool';
    }

    const task = taskGraph.tasks[stepNumber - 1];
    const hint = task?.agentHint;
    return typeof hint === 'string' && hint.trim() ? hint.trim() : 'dispatchTool';
  } catch {
    return 'dispatchTool';
  }
}

/**
 * POST /api/performer/proactive-step/confirm
 * - code_fix: approve or reject a proposed fix (store content or source code).
 * - create_promotion (default): Phase B after product selection — generate content.
 * - launch_campaign: Phase B after channel selection — deploy landing / WhatsApp / social.
 *
 * Confirm paths call promotionContentGenerator / promotionLaunchDeployer directly (not dispatchTool /
 * dispatchTaskWithAgentHint); keep approval-gated Phase B separate from allowlisted proactive-step dispatch.
 */
router.post('/confirm', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const missionId = String(body.missionId ?? '').trim();
    const stepNumber = Number(body.stepNumber);
    const stepKey = String(body.stepKey ?? '').trim() || 'create_promotion';

    if (!missionId || !Number.isFinite(stepNumber)) {
      return res.status(400).json({
        ok: false,
        message: 'missionId and stepNumber are required',
      });
    }

    const access = await assertProactivePipelineOrMissionAccess(req.user, missionId);
    if (!access.ok) {
      return res.status(403).json({ ok: false, message: 'Access denied' });
    }

    const prisma = getPrismaClient();
    const pipeline = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: { id: true, targetId: true, metadataJson: true, executionMode: true },
    });

    if (!pipeline) {
      return res.status(404).json({ ok: false, message: 'Mission not found' });
    }

    const meta = asObject(pipeline.metadataJson);
    const stepOutputs = asObject(meta.stepOutputs);

    // ── code_fix confirm (approve / reject) ───────────────────────────────────
    if (stepKey === 'code_fix') {
      const decision = String(body.decision ?? body.value ?? '').trim().toLowerCase();
      const cf = asObject(stepOutputs.code_fix);
      const phase = String(cf.phase ?? '');

      if (phase !== 'awaiting_approval') {
        return res.status(409).json({ ok: false, message: 'code_fix not awaiting approval' });
      }

      const proactivePlanTotalCf = Math.max(0, Math.floor(Number(body.proactivePlanTotal) || 0));
      const isLastStepCf = proactivePlanTotalCf > 0 && stepNumber >= proactivePlanTotalCf;

      // Reject path — no apply, just update phase
      if (decision === 'reject') {
        if (
          respondIfAdvanceFailed(
            res,
            await advanceProactivePipelineStep(prisma, {
              missionId,
              executionMode: pipeline.executionMode,
              data: {
                status: isLastStepCf ? 'completed' : 'executing',
                runState: isLastStepCf ? 'done' : 'idle',
                metadataJson: {
                  ...meta,
                  stepOutputs: {
                    ...stepOutputs,
                    code_fix: { ...cf, phase: 'rejected', tool: 'code_fix' },
                  },
                },
              },
              source: 'performer_proactive_confirm',
              correlationId: missionId,
            }),
          )
        ) {
          return;
        }
        return res.json({ ok: true, stepNumber, output: { phase: 'rejected', tool: 'code_fix' } });
      }

      if (decision !== 'approve') {
        return res.status(400).json({ ok: false, message: 'decision must be approve or reject' });
      }

      // Approve path — classify patch type using sentinel from codeFixPerformerService
      const patch = resolveCodeFixProposedPatchForApply(cf);
      const patchFilePath = String(patch?.filePath ?? '');

      // Store content fix: filePath starts with "store:" (set by detectStoreContentFix in
      // codeFixPerformerService.js) OR the isStoreContentFix flag is set on the persisted output.
      // Source code fix: real monorepo-relative path with a source file extension.
      const isStoreContentFix =
        patchFilePath.startsWith('store:') ||
        Boolean(cf.isStoreContentFix);

      // Source code patches require super_admin and are blocked in production
      if (!isStoreContentFix) {
        if (!hasRole(req.user, 'super_admin')) {
          return res.status(403).json({
            ok: false,
            message: 'Super admin required to apply source code fix',
          });
        }
        if (process.env.NODE_ENV === 'production') {
          return res.status(403).json({
            ok: false,
            message: 'Code fix apply disabled in production',
          });
        }
      }

      // Validate patch has minimum required fields
      if (!patchFilePath || (!isStoreContentFix && !patch.oldStr)) {
        return res.status(400).json({ ok: false, message: 'Invalid proposedPatch on mission' });
      }

      // Apply the patch via the appropriate service
      let applied;
      if (isStoreContentFix) {
        // Resolve storeId for content patch — pipeline.targetId is often empty for code_fix
        // missions created via the bridge (no store target set on the mission shell).
        // Fall back to the user's active business, same as campaign confirm paths do.
        let contentPatchStoreId = String(pipeline.targetId || meta.storeId || '').trim();
        if (!contentPatchStoreId) {
          try {
            const biz = await prisma.business.findFirst({
              where: { userId: req.user.id, isActive: true },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });
            contentPatchStoreId = biz?.id ?? '';
          } catch {
            // leave empty — applyStoreContentPatch will return a clear error
          }
        }

        const outs = asObject(meta.outputsJson ?? meta.outputs ?? {});
        const preferredDraftId =
          String(body.draftId ?? body.websiteDraftId ?? '').trim() ||
          String(outs.draftId ?? outs.createdDraftId ?? meta.draftId ?? '').trim() ||
          null;

        // Store content fix: write to DB via storeContentPatchService — no filesystem access
        try {
          const { applyStoreContentPatch } = await import('../services/storeContentPatchService.js');
          applied = await applyStoreContentPatch({
            storeId: contentPatchStoreId,
            userId: req.user.id,
            patch,
            storeContentPatch: cf.storeContentPatch,
            description: String(cf.rootCause ?? cf.bugDescription ?? ''),
            preferredDraftId,
          });
        } catch (e) {
          return res.status(400).json({
            ok: false,
            message: e?.message || 'store_content_patch_failed',
          });
        }
      } else {
        // Source code fix: write to filesystem (super_admin + dev only, already guarded above)
        try {
          const { applySrcPatchWrite } = await import('../lib/dev/applyPatchToSrc.js');
          applied = applySrcPatchWrite({
            filePath: patchFilePath,
            oldStr: patch.oldStr,
            newStr: patch.newStr,
          });
        } catch (e) {
          return res.status(400).json({
            ok: false,
            message: e?.message || 'apply_failed',
            code: e?.code,
          });
        }
      }

      // Persist applied state
      if (
        respondIfAdvanceFailed(
          res,
          await advanceProactivePipelineStep(prisma, {
            missionId,
            executionMode: pipeline.executionMode,
            data: {
              status: isLastStepCf ? 'completed' : 'executing',
              runState: isLastStepCf ? 'done' : 'idle',
              metadataJson: {
                ...meta,
                stepOutputs: {
                  ...stepOutputs,
                  code_fix: {
                    ...cf,
                    phase: 'applied',
                    tool: 'code_fix',
                    applyResult: applied,
                  },
                },
              },
            },
            source: 'performer_proactive_confirm',
            correlationId: missionId,
          }),
        )
      ) {
        return;
      }

      return res.json({
        ok: true,
        stepNumber,
        output: {
          phase: 'applied',
          tool: 'code_fix',
          applyResult: applied,
        },
      });
    }

    // ── Shared storeId resolution for campaign confirm paths ──────────────────
    let storeId = typeof meta.storeId === 'string' && meta.storeId.trim() ? meta.storeId.trim() : null;
    if (!storeId && pipeline.targetId && String(pipeline.targetId).trim()) {
      storeId = String(pipeline.targetId).trim();
    }

    if (!storeId) {
      const biz = await prisma.business.findFirst({
        where: { userId: req.user.id, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      storeId = biz?.id ?? null;
    }

    if (!storeId) {
      return res.status(400).json({
        ok: false,
        message: 'No store found for this user',
      });
    }

    // ── launch_campaign confirm (channel selection → deploy) ──────────────────
    if (stepKey === 'launch_campaign') {
      const phase = String(body.phase ?? '').trim();
      const promotionId = String(body.promotionId ?? '').trim();
      const selectedChannels = Array.isArray(body.selectedChannels)
        ? body.selectedChannels.map((c) => String(c ?? '').trim()).filter(Boolean)
        : [];

      if (phase !== 'channel_selection' || !promotionId || selectedChannels.length === 0) {
        return res.status(400).json({
          ok: false,
          message: 'phase must be channel_selection with promotionId and non-empty selectedChannels',
        });
      }

      const prom = await prisma.promotion.findUnique({
        where: { id: promotionId },
        select: { id: true, storeId: true },
      });
      if (!prom || prom.storeId !== storeId) {
        return res.status(403).json({ ok: false, message: 'Promotion not found or access denied' });
      }

      if (
        respondIfAdvanceFailed(
          res,
          await advanceProactivePipelineStep(prisma, {
            missionId,
            executionMode: pipeline.executionMode,
            data: { status: 'executing', runState: 'running' },
            source: 'performer_proactive_confirm',
            correlationId: missionId,
          }),
        )
      ) {
        return;
      }

      const co = asObject(stepOutputs.create_promotion);
      const contentIdFromBody = String(body.contentId ?? '').trim();
      const contentId =
        contentIdFromBody ||
        (typeof co.instanceId === 'string' && co.instanceId.trim() ? co.instanceId.trim() : '') ||
        (typeof co.contentId === 'string' && co.contentId.trim() ? co.contentId.trim() : '');

      let deployResult;
      try {
        const { deployLaunchCampaignChannels } = await import('../services/promotionLaunchDeployer.js');
        const tenantKey = getTenantId(req.user) || 'default';
        deployResult = await dispatchExecution(
          {
            source: 'performer',
            executionType: 'proactive_confirm',
            missionId,
            action: 'deployLaunchCampaignChannels',
            correlationId: missionId,
            legacySource: 'performer_proactive_confirm',
            context: { stepKey: 'launch_campaign' },
          },
          () =>
            deployLaunchCampaignChannels({
              prisma,
              promotionId,
              selectedChannels,
              tenantKey,
              contentId: contentId || undefined,
            }),
        );
      } catch (deployErr) {
        const advDeployFail = await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: { status: 'failed', runState: 'error' },
          source: 'performer_proactive_confirm',
          correlationId: missionId,
        });
        if (!advDeployFail.ok && isDev) {
          console.warn('[ProactiveStep] advance after deploy failure:', advDeployFail.code, advDeployFail.message);
        }
        closeMissionContext(missionId, {
          success: false,
          completedAt: new Date(),
        }).catch(() => {});
        throw deployErr;
      }

      const proactivePlanTotalLc = Math.max(0, Math.floor(Number(body.proactivePlanTotal) || 0));
      const isLastStepLc = proactivePlanTotalLc > 0 && stepNumber >= proactivePlanTotalLc;

      await attachSocialShareRecommendationToLaunchOutput(deployResult, {
        userId: req.user.id,
        prisma,
        stepOutputs,
      });

      // Best-effort external actions (post-approval confirm phase). Failures must not block pipeline.
      // Idempotency: if we already ran these for the deployed output, do not re-run on retry.
      const priorLaunch = asObject(stepOutputs.launch_campaign);
      const priorExternal = asObject(priorLaunch.externalActions);
      const externalAlreadyCompleted = Boolean(priorExternal.completed === true);

      let externalActions = priorExternal;
      if (!externalAlreadyCompleted) {
        externalActions = {
          ...priorExternal,
          attemptedAt: new Date().toISOString(),
        };

        // Compose a minimal campaign summary payload for notifications.
        const cp = asObject(stepOutputs.create_promotion);
        const copy = asObject(cp.copy);
        const title =
          (typeof copy.title === 'string' && copy.title.trim()) ||
          (typeof cp.productName === 'string' && cp.productName.trim()
            ? `Promotion: ${cp.productName.trim()}`
            : 'Campaign');
        const landingPageUrl =
          landingPageUrlFromDeployChannels(deployResult?.channels) ??
          (typeof deployResult?.landingPageUrl === 'string' && deployResult.landingPageUrl.trim()
            ? deployResult.landingPageUrl.trim()
            : null);

        const campaignData = {
          title,
          promotionId,
          selectedChannels,
          landingPageUrl,
        };

        // Email (Gmail MCP) — optional
        try {
          const emailRes = await sendCampaignEmail(missionId, campaignData, {
            prisma,
            userId: req.user.id,
          });
          externalActions.email_sent = emailRes;
        } catch (e) {
          externalActions.email_sent = { ok: false, error: e?.message ?? String(e) };
        }

        // Calendar — via existing Google Calendar tool (OAuthConnection)
        try {
          const validityDaysRaw = Number(cp.validityDays ?? copy.validityDays ?? cp.validityDays);
          const validityDays = Number.isFinite(validityDaysRaw) ? Math.max(1, Math.min(365, Math.floor(validityDaysRaw))) : 7;
          const start = new Date();
          const end = new Date(start.getTime() + validityDays * 24 * 60 * 60 * 1000);
          const calRes = await createCalendarEvent(
            missionId,
            {
              summary: `Campaign ends: ${title}`.slice(0, 120),
              startDateTime: start.toISOString(),
              endDateTime: end.toISOString(),
              timeZone: 'UTC',
              description: landingPageUrl ? `Campaign link: ${landingPageUrl}` : undefined,
            },
            { prisma, userId: req.user.id },
          );
          externalActions.calendar_event = calRes;
        } catch (e) {
          externalActions.calendar_event = { ok: false, error: e?.message ?? String(e) };
        }

        // Stripe coupon — optional (skips silently if STRIPE_SECRET_KEY missing)
        try {
          const discountPercentRaw = Number(copy.discountPercent ?? cp.discountPercent ?? copy.percentOff);
          const discountPercent = Number.isFinite(discountPercentRaw) ? discountPercentRaw : 10;
          const stripeRes = await createStripePromotion(missionId, { title, discountPercent });
          externalActions.stripe_coupon = stripeRes;
        } catch (e) {
          externalActions.stripe_coupon = { ok: false, error: e?.message ?? String(e) };
        }

        externalActions.completed = true;
        externalActions.completedAt = new Date().toISOString();
      }

      if (
        respondIfAdvanceFailed(
          res,
          await advanceProactivePipelineStep(prisma, {
            missionId,
            executionMode: pipeline.executionMode,
            data: {
              status: isLastStepLc ? 'completed' : 'executing',
              runState: isLastStepLc ? 'done' : 'idle',
              metadataJson: {
                ...meta,
                stepOutputs: {
                  ...stepOutputs,
                  launch_campaign: {
                    ...(priorLaunch && typeof priorLaunch === 'object' ? priorLaunch : {}),
                    ...deployResult,
                    externalActions,
                  },
                },
              },
            },
            source: 'performer_proactive_confirm',
            correlationId: missionId,
          }),
        )
      ) {
        return;
      }

      if (isLastStepLc) {
        closeMissionContext(missionId, {
          success: true,
          completedAt: new Date(),
        }).catch(() => {});
      }

      return res.json({
        ok: true,
        stepNumber,
        output: deployResult,
      });
    }

    // ── create_promotion confirm (product selection → generate content) ────────
    const productId = String(body.productId ?? '').trim();
    const isUploadedProduct = !productId && !!body.productImageUrl;
    if (!productId && !isUploadedProduct) {
      return res.status(400).json({
        ok: false,
        message: 'missionId, stepNumber, and productId are required',
      });
    }

    const cr = asObject(stepOutputs.campaign_research);
    const mr = asObject(stepOutputs.market_research);
    const marketReport =
      (cr.marketReport && typeof cr.marketReport === 'object' ? cr.marketReport : null) ??
      (mr.marketReport && typeof mr.marketReport === 'object' ? mr.marketReport : null) ??
      {};

    const ownerEditedPrompt =
      typeof body.ownerEditedPrompt === 'string' ? body.ownerEditedPrompt.trim().slice(0, 200) : '';

    const product = {
      productId: productId || null,
      name: String(body.productName ?? '') || 'Your product',
      price: body.productPrice != null && body.productPrice !== '' ? Number(body.productPrice) : null,
      category: body.productCategory ?? null,
      imageUrl: body.productImageUrl ?? null,
      isUploaded: isUploadedProduct,
    };

    if (
      respondIfAdvanceFailed(
        res,
        await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: { status: 'executing', runState: 'running' },
          source: 'performer_proactive_confirm',
          correlationId: missionId,
        }),
      )
    ) {
      return;
    }

    createMissionContext(missionId, {
      rawIntent: body.intent ?? body.recommendedTool ?? stepKey ?? 'unknown',
      canonicalIntent: stepKey ?? 'create_promotion',
      storeId,
    }).then(() =>
      buildAndStoreMissionHypothesis(
        missionId,
        body.intent ?? body.recommendedTool ?? stepKey ?? 'unknown',
        storeId
      )
    ).catch(() => {});

    let result;
    try {
      let priorStepsContext = '';
      try {
        priorStepsContext =
          (await buildStepContext({
            missionId,
            currentStepIndex: stepNumber,
          })) || '';
      } catch (e) {
        console.warn('[ProactiveConfirm] buildStepContext:', e?.message || e);
      }

      const { generatePromotionContent } = await import('../services/promotionContentGenerator.js');
      const tenantKey = getTenantId(req.user) || 'default';
      result = await dispatchExecution(
        {
          source: 'performer',
          executionType: 'proactive_confirm',
          missionId,
          action: 'generatePromotionContent',
          correlationId: missionId,
          legacySource: 'performer_proactive_confirm',
          context: { stepKey: 'create_promotion' },
        },
        () =>
          generatePromotionContent({
            storeId,
            userId: req.user.id,
            product,
            marketReport,
            tenantKey,
            ownerEditedPrompt: ownerEditedPrompt || undefined,
            priorStepsContext: priorStepsContext || undefined,
          }),
      );

      if (body.uploadedMediaUrl) {
        await prisma.promotion.update({
          where: { id: result.promotionId },
          data: {
            mediaUrl: body.uploadedMediaUrl,
            mediaType: body.uploadedMediaType ?? 'video',
          },
        });
      }

      snapshotMissionStep(missionId, stepKey ?? 'create_promotion', {
        inputState: {
          storeId,
          stepNumber,
          productId: body.productId ?? null,
          isUploaded: body.isUploaded ?? false,
        },
        outputState: result ?? {},
        decision: `executed step ${stepNumber} via dispatchExecution`,
      }).catch(() => {});

      checkAndCorrectCourse(missionId).catch(() => {});
    } catch (genErr) {
      const advGenFail = await advanceProactivePipelineStep(prisma, {
        missionId,
        executionMode: pipeline.executionMode,
        data: { status: 'failed', runState: 'error' },
        source: 'performer_proactive_confirm',
        correlationId: missionId,
      });
      if (!advGenFail.ok && isDev) {
        console.warn('[ProactiveStep] advance after gen failure:', advGenFail.code, advGenFail.message);
      }
      closeMissionContext(missionId, {
        success: false,
        completedAt: new Date(),
      }).catch(() => {});
      throw genErr;
    }

    const proactivePlanTotalCp = Math.max(0, Math.floor(Number(body.proactivePlanTotal) || 0));
    const isLastStepCp = proactivePlanTotalCp > 0 && stepNumber >= proactivePlanTotalCp;

    if (
      respondIfAdvanceFailed(
        res,
        await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: {
            status: isLastStepCp ? 'completed' : 'executing',
            runState: isLastStepCp ? 'done' : 'idle',
            metadataJson: {
              ...meta,
              stepOutputs: {
                ...stepOutputs,
                create_promotion: {
                  ...asObject(stepOutputs.create_promotion),
                  phase: 'content_ready',
                  instanceId: result.instanceId,
                  promotionId: result.promotionId,
                  productId: result.product.productId,
                  productName: result.product.name,
                  copy: result.copy,
                  contentCreated: true,
                  message: 'Promotion content generated and ready in Content Studio',
                },
              },
            },
          },
          source: 'performer_proactive_confirm',
          correlationId: missionId,
        }),
      )
    ) {
      return;
    }

    if (isLastStepCp) {
      closeMissionContext(missionId, {
        success: true,
        completedAt: new Date(),
      }).catch(() => {});
    }

    return res.json({
      ok: true,
      stepNumber,
      output: {
        instanceId: result.instanceId,
        promotionId: result.promotionId,
        productId: result.product.productId,
        productName: result.product.name,
        copy: result.copy,
        contentCreated: true,
        message: 'Promotion content generated and ready in Content Studio',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/performer/proactive-step ────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
    const stepNumber = Number(body.stepNumber);
    const recommendedTool = typeof body.recommendedTool === 'string' ? body.recommendedTool.trim().toLowerCase() : '';
    const proactivePlanTotal = Math.max(0, Math.floor(Number(body.proactivePlanTotal) || 0));

    if (!missionId || !recommendedTool || !Number.isFinite(stepNumber)) {
      return res.status(400).json({
        ok: false,
        message: 'missionId, stepNumber, and recommendedTool are required',
      });
    }
    if (!ALLOWED_TOOLS.has(recommendedTool)) {
      return res.status(400).json({ ok: false, message: 'recommendedTool not allowed for proactive step' });
    }

    const access = await assertProactivePipelineOrMissionAccess(req.user, missionId);
    if (!access.ok) {
      return res.status(403).json({ ok: false, message: 'Mission pipeline not found or access denied' });
    }

    const prisma = getPrismaClient();
    const pipeline = await prisma.missionPipeline.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        status: true,
        runState: true,
        metadataJson: true,
        targetId: true,
        executionMode: true,
      },
    });
    if (!pipeline) {
      return res.status(404).json({ ok: false, message: 'Mission pipeline not found' });
    }

    const st = String(pipeline.status || '').toLowerCase();
    const rs = String(pipeline.runState || '').toLowerCase();
    const wasCompleted = st === 'completed' && rs === 'done';
    const isSocialFollowUpTool = SOCIAL_POST_COMPLETE_TOOLS.has(recommendedTool);
    if (['completed', 'cancelled', 'failed'].includes(st) && !(wasCompleted && isSocialFollowUpTool)) {
      return res.status(409).json({ ok: false, message: 'Mission is already in a terminal state' });
    }

    const meta = asObject(pipeline.metadataJson);
    const stepOutputs = asObject(meta.stepOutputs);

    if (!(wasCompleted && isSocialFollowUpTool)) {
      if (
        respondIfAdvanceFailed(
          res,
          await advanceProactivePipelineStep(prisma, {
            missionId,
            executionMode: pipeline.executionMode,
            data: { status: 'executing', runState: 'running' },
            source: 'performer_proactive_step',
            correlationId: missionId,
          }),
        )
      ) {
        return;
      }
    }

    const parameters = asObject(body.parameters);
    const payload = { ...parameters };
    payload.missionId = payload.missionId || missionId;
    if (recommendedTool === 'create_promotion') {
      const rawImg = parameters.imageDataUrl ?? body.imageDataUrl;
      if (typeof rawImg === 'string' && rawImg.trim()) {
        payload.imageDataUrl = String(rawImg).trim();
      }
    }
    if (recommendedTool === 'create_promotion') {
      console.log(
        '[DEBUG cp] imageDataUrl in payload:',
        payload.imageDataUrl ? 'PRESENT len=' + payload.imageDataUrl.length : 'MISSING',
      );
    }
    if (!payload.storeId && typeof meta.storeId === 'string' && meta.storeId.trim()) {
      payload.storeId = meta.storeId.trim();
    }
    if (!payload.storeId && pipeline.targetId && String(pipeline.targetId).trim()) {
      payload.storeId = String(pipeline.targetId).trim();
    }

    if (!payload.storeId) {
      try {
        const userBusiness = await prisma.business.findFirst({
          where: { userId: req.user.id, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (userBusiness?.id) {
          payload.storeId = userBusiness.id;
          console.log('[ProactiveStep] storeId resolved from user business:', payload.storeId);
        }
      } catch (e) {
        console.warn('[ProactiveStep] could not resolve storeId from user business:', e?.message || e);
      }
    }

    console.log('[ProactiveStep] final payload.storeId:', payload.storeId ?? 'MISSING');

    if (!payload.userId && req.user?.id) {
      payload.userId = req.user.id;
    }

    const stepTitleForBus = proactivePlanStepTitle(body);

    if (stepNumber > 1) {
      try {
        const prior = await buildStepContext({
          missionId,
          currentStepIndex: stepNumber,
          step: { index: stepNumber, toolName: recommendedTool, name: stepTitleForBus ?? undefined },
        });
        if (prior) payload.priorStepsContext = prior;
      } catch (e) {
        console.warn('[ProactiveStep] buildStepContext skipped:', e?.message || e);
      }
    }

    let toolResult;

    if (recommendedTool === 'code_fix') {
      const description =
        String(body.description ?? '').trim() ||
        String(parameters.description ?? '').trim() ||
        String(parameters.prompt ?? '').trim() ||
        String(parameters.message ?? '').trim() ||
        '';
      const filePathsFromBody = Array.isArray(body.filePaths) ? body.filePaths : null;
      const filePathsFromParams = Array.isArray(parameters.filePaths) ? parameters.filePaths : null;
      const filePaths = filePathsFromBody || filePathsFromParams || [];
      const repoContext =
        String(body.repoContext ?? parameters.repoContext ?? '').trim() || undefined;
      const hasSourceFilePaths = filePaths.some((p) =>
        /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/i.test(String(p ?? '').trim()),
      );
      const { runCodeFixAnalysis, tryBuildStoreContentFixOutputFromIntakePatch } = await import(
        '../services/codeFixPerformerService.js',
      );
      const intakePatch = parameters.storeContentPatch ?? body.storeContentPatch;
      const fromIntake = tryBuildStoreContentFixOutputFromIntakePatch({
        storeContentPatch: intakePatch,
        description,
      });
      if (fromIntake && !hasSourceFilePaths) {
        toolResult = { status: 'ok', output: fromIntake.output };
      } else {
        const analysis = await runCodeFixAnalysis({ description, filePaths, repoContext });
        if (!analysis.ok) {
          const advCf = await advanceProactivePipelineStep(prisma, {
            missionId,
            executionMode: pipeline.executionMode,
            data: { status: 'failed', runState: 'error' },
            source: 'performer_proactive_step',
            correlationId: missionId,
          });
          if (respondIfAdvanceFailed(res, advCf)) return;
          return res.status(200).json({
            ok: false,
            message: analysis.message,
            output: buildCanonicalCodeFixErrorOutput(analysis.message),
          });
        }
        toolResult = { status: 'ok', output: analysis.output };
      }
    } else if (recommendedTool === 'generate_slideshow') {
      toolResult = {
        status: 'ok',
        output: {
          slideshowUrl: null,
          status: 'pending_client_export',
          promotionId: parameters.promotionId ?? payload.promotionId ?? null,
          instanceId: parameters.instanceId ?? payload.instanceId ?? null,
        },
      };
    } else if (recommendedTool === 'general_chat') {
      toolResult = { status: 'ok', output: { message: 'OK' } };
    } else {
      const dispatchName = resolveRunwayDispatchToolName(recommendedTool);
      const ctx = {
        missionId,
        tenantId: getTenantId(req.user),
        userId: req.user?.id,
        createdBy: req.user?.id,
        stepOutputs,
        storeId: payload.storeId,
      };
      const agentHint = await resolveAgentHintForStep(missionId, stepNumber);
      if (recommendedTool === 'create_promotion') {
        console.log('[DEBUG cp] agentHint:', agentHint, 'dispatchName:', dispatchName);
      }
      toolResult = await dispatchExecution(
        {
          source: 'performer',
          executionType: 'proactive_step',
          missionId,
          action: dispatchName,
          correlationId: missionId,
          legacySource: 'performer_proactive_step',
          context: { stepNumber, recommendedTool },
        },
        () =>
          dispatchTaskWithAgentHint(dispatchName, { ...payload, _agentHint: agentHint }, ctx),
      );
      if (isDev) {
        console.log('[ProactiveStep] dispatched via orchestrator', {
          tool: dispatchName,
          agentHint,
          missionId,
          stepNumber,
        });
      }
    }

    const failed = toolResult.status === 'failed' || toolResult.status === 'blocked';
    if (failed) {
      if (!(wasCompleted && isSocialFollowUpTool)) {
        const advToolFail = await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: { status: 'failed', runState: 'error' },
          source: 'performer_proactive_step',
          correlationId: missionId,
        });
        if (!advToolFail.ok && isDev) {
          console.warn('[ProactiveStep] advance on tool failure:', advToolFail.code, advToolFail.message);
        }
      }
      return res.status(200).json({
        ok: false,
        message:
          toolResult.error?.message ||
          toolResult.blocker?.message ||
          'proactive_step_failed',
        output: toolResult.output ?? toolResult,
      });
    }

    const isLastStep = proactivePlanTotal > 0 && stepNumber >= proactivePlanTotal;
    const stepOut = toolResult.output && typeof toolResult.output === 'object' ? toolResult.output : {};
    const blocksTerminalComplete =
      (recommendedTool === 'create_promotion' && stepOut.phase === 'awaiting_product_selection') ||
      (recommendedTool === 'launch_campaign' && stepOut.phase === 'awaiting_channel_selection') ||
      (recommendedTool === 'code_fix' && stepOut.phase === 'awaiting_approval') ||
      (recommendedTool === 'edit_artifact' && stepOut.phase === 'image_search_results');
    const pipelineComplete = isLastStep && !blocksTerminalComplete;

    if (recommendedTool === 'launch_campaign' && stepOut.phase !== 'awaiting_channel_selection') {
      await attachSocialShareRecommendationToLaunchOutput(stepOut, {
        userId: req.user.id,
        prisma,
        stepOutputs,
      });
    }

    const restoreCompletedAfterSocial =
      wasCompleted && isSocialFollowUpTool && toolResult.status === 'ok';
    const nextStatus = restoreCompletedAfterSocial ? 'completed' : pipelineComplete ? 'completed' : 'executing';
    const nextRunState = restoreCompletedAfterSocial ? 'done' : pipelineComplete ? 'done' : 'idle';

    if (
      respondIfAdvanceFailed(
        res,
        await advanceProactivePipelineStep(prisma, {
          missionId,
          executionMode: pipeline.executionMode,
          data: {
            status: nextStatus,
            runState: nextRunState,
            metadataJson: {
              ...meta,
              stepOutputs: {
                ...stepOutputs,
                [recommendedTool]: toolResult.output ?? {},
              },
            },
          },
          source: 'performer_proactive_step',
          correlationId: missionId,
        }),
      )
    ) {
      return;
    }

    if (shouldPersistStepOutputToBus(recommendedTool)) {
      writeStepOutput(
        missionId,
        {
          stepIndex: stepNumber,
          toolName: recommendedTool,
          stepTitle: stepTitleForBus,
        },
        stepOut,
      ).catch((e) => console.warn('[missionContextBus] writeStepOutput:', e?.message || e));
    }

    return res.json({
      ok: true,
      output: toolResult.output ?? { status: toolResult.status },
      stepNumber,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

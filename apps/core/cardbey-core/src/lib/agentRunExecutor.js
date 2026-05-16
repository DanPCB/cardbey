/**
 * In-process execution of AgentRun (research, planner, or ocr). Dev-safe behind env flags for research/planner.
 * Research: MISSION_RUN_INPROCESS=true. Planner: MISSION_PLANNER_INPROCESS=true. OCR: always in-process when dispatched.
 * Emits system messages to the mission timeline via createAgentMessage (run_lifecycle).
 */

import { getPrismaClient } from '../lib/prisma.js';
import { updateAgentRunStatus, createAgentRun } from './agentRun.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { getChainPlan, advanceChainCursor, computeChainStatus } from './chainPlan.js';
import { maybeAutoDispatch } from './maybeAutoDispatch.js';
import { mergeMissionContext } from './mission.js';
import { runPlannerInProcess } from './plannerExecutor.js';
import { extractTextWithFallback } from './ocr/ocrFallback.js';
import { parseOcrToEntities, buildSummaryAndBullets } from './ocrToEntities.js';
import { parseBusinessCardOCR, truncateRawTextForPayload, entitiesToBusinessProfile } from './businessCardParser.js';
import { resolvePublicUrl } from '../utils/publicUrl.js';
import { findMissionTaskBySuggestion, findMissionTaskById, updateMissionTaskStatus, updateMissionTaskStatusAndMeta } from './missionTask.js';
import { runIntentExecutor, INTENT_V0_SET } from './intentExecutors.js';
import { INTERNAL_TOOLS, executeInternalTool } from './internalTools.js';
import { executeOpsTool, isUserAdmin, MAX_REBIND_CHANGES } from './opsToolRegistry.js';
import { recordAssignmentCompletion } from './assignmentReward.js';
import { completeAgentTask } from './biddingTask.js';
import { mapErrorToTaxonomy, normalizeTaxonomy } from './errorTaxonomy.js';
import { isTextOnlyMission } from './missionConfig.js';

/** User-facing message when Agent Chat OCR fails (refusal or unreadable). Kept local to avoid ESM dependency on runOcr.js at startup. */
const AGENT_CHAT_OCR_FAILURE_MESSAGE =
  'OCR failed (unreadable or provider error). Please type business name + phone + address.';

/** True if OCR/vision response looks like a refusal (do not store as business card). */
function isRefusalResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length > 500) return false;
  const refusalPhrases = ["i can't", "i cannot", "i'm unable", "unable to", "cannot process", "can't process", "no text", "could not extract"];
  return refusalPhrases.some((p) => t.toLowerCase().includes(p));
}

/** True if text looks like business card OCR (email, url, enough digits, or AU state+postcode). */
function businessCardLooksLikeOcrText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 10) return false;
  if (/@/.test(t)) return true;
  if (/\bwww\.|https?:\/\/|\.com\b|\.au\b/i.test(t)) return true;
  const digitCount = (t.replace(/\s/g, '').match(/\d/g) || []).length;
  if (digitCount >= 8) return true;
  if (/(?:VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\s*\d{4}/i.test(t)) return true;
  return false;
}

/**
 * Record a failed run with error taxonomy (stored in run.error + run.output.errorTaxonomy) and post run_lifecycle failed with payload.errorTaxonomy.
 * Backward compatible: UI can show generic error when no taxonomy present.
 *
 * @param {string} missionId
 * @param {string} runId
 * @param {string} agentKey
 * @param {Error|string} err
 * @param {{ input?: object }} [run]
 * @returns {Promise<object>} taxonomy
 */
async function recordRunFailed(missionId, runId, agentKey, err, run = null) {
  const taxonomy = normalizeTaxonomy(mapErrorToTaxonomy(err, { runInput: run?.input }));
  await updateAgentRunStatus(runId, 'failed', {
    error: taxonomy.message,
    output: { errorTaxonomy: taxonomy },
  }).catch(() => {});
  await postSystemMessage(missionId, agentKey, `Run failed: ${agentKey} — ${taxonomy.message}`, {
    kind: 'run_lifecycle',
    runId,
    agentKey,
    status: 'failed',
    error: taxonomy.message,
    errorTaxonomy: taxonomy,
  }).catch(() => {});
  return taxonomy;
}

/**
 * When run was created via bidding layer (input.assignmentId), record completion and mark task.
 */
async function recordBiddingOutcomeIfPresent(run, success) {
  const assignmentId = run?.input && typeof run.input === 'object' ? run.input.assignmentId : null;
  if (!assignmentId) return;
  const prisma = getPrismaClient();
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { taskId: true } }).catch(() => null);
  if (!assignment) return;
  const latencyMs = run.createdAt ? Date.now() - new Date(run.createdAt).getTime() : null;
  await recordAssignmentCompletion(assignmentId, { success, latencyMs }).catch(() => {});
  await completeAgentTask(assignment.taskId, success ? 'completed' : 'failed').catch(() => {});
}

/**
 * Post a lifecycle system message to the mission timeline.
 * Uses createAgentMessage so it emits the same SSE event as normal agent messages.
 * Keeps text unchanged for older UIs; adds payload for run_lifecycle (machine-readable).
 */
async function postSystemMessage(missionId, agentKey, text, payload = null) {
  await createAgentMessage({
    missionId,
    senderType: 'system',
    senderId: 'mission-run',
    channel: 'main',
    text,
    messageType: 'system',
    payload,
    visibleToUser: true,
  });
}

/**
 * Fetch HTTP(S) image URL and return data URL for performMenuOcr.
 * TRANSIENT retry: maxAttempts=3, exponential backoff (in dev immediate).
 */
async function imageUrlToDataUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') throw new Error('imageUrl required');
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  const maxAttempts = 3;
  const isDev = process.env.NODE_ENV === 'development';
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(trimmed, { headers: { 'User-Agent': 'Cardbey-OCR/1.0' } });
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      return `data:${contentType};base64,${base64}`;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const delayMs = isDev ? 0 : Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/**
 * Resolve image from trigger message or adjacent messages. Prefer storageKey (Media lookup).
 * Returns { imageUrl: string } or null. Uses resolvePublicUrl(_, null) for relative paths (PUBLIC_BASE_URL).
 */
async function resolveImageFromMissionMessages(prisma, missionId, triggerMessageId) {
  let imageUrl = null;
  let storageKey = null;
  if (triggerMessageId) {
    const trigger = await prisma.agentMessage.findUnique({
      where: { id: triggerMessageId, missionId },
      select: { content: true, payload: true, messageType: true, createdAt: true },
    });
    if (trigger?.content && typeof trigger.content === 'object') {
      if (trigger.content.storageKey && typeof trigger.content.storageKey === 'string') storageKey = trigger.content.storageKey.trim();
      if (trigger.content.imageUrl && typeof trigger.content.imageUrl === 'string') imageUrl = trigger.content.imageUrl.trim();
    }
    if (!imageUrl && !storageKey && trigger?.payload && typeof trigger.payload === 'object') {
      const p = trigger.payload;
      if (p.storageKey && typeof p.storageKey === 'string') storageKey = p.storageKey.trim();
      if (p.preview?.imageUrl && typeof p.preview.imageUrl === 'string') imageUrl = p.preview.imageUrl.trim();
      if (!imageUrl && p.url && typeof p.url === 'string') imageUrl = p.url.trim();
    }
  }
  if (!imageUrl && !storageKey) {
    const recent = await prisma.agentMessage.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { content: true, payload: true, messageType: true },
    });
    for (const msg of recent) {
      const c = msg.content && typeof msg.content === 'object' ? msg.content : {};
      const p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      if (c.storageKey && typeof c.storageKey === 'string') { storageKey = c.storageKey.trim(); break; }
      if (c.imageUrl && typeof c.imageUrl === 'string') { imageUrl = c.imageUrl.trim(); break; }
      if (msg.messageType === 'artifact') {
        if (p.storageKey && typeof p.storageKey === 'string') { storageKey = p.storageKey.trim(); break; }
        if (p.preview?.imageUrl && typeof p.preview.imageUrl === 'string') { imageUrl = p.preview.imageUrl.trim(); break; }
        if (p.url && typeof p.url === 'string') { imageUrl = p.url.trim(); break; }
      }
    }
  }
  if (storageKey) {
    const media = await prisma.media.findFirst({
      where: { storageKey },
      select: { url: true },
    });
    if (media?.url) {
      const abs = media.url.startsWith('http') ? media.url : resolvePublicUrl(media.url, null);
      return { imageUrl: abs };
    }
  }
  if (imageUrl) {
    const abs = imageUrl.startsWith('http') ? imageUrl : resolvePublicUrl(imageUrl, null);
    return { imageUrl: abs };
  }
  return null;
}

/**
 * Post a planner agent message (for text-only mission fallback when OCR is skipped or fails gracefully).
 */
async function postPlannerFallbackMessage(missionId, text) {
  await createAgentMessage({
    missionId,
    senderType: 'agent',
    senderId: 'planner',
    channel: 'main',
    text,
    messageType: 'text',
    payload: null,
    visibleToUser: true,
  });
}

/**
 * Create a planner run and execute in-process (used after OCR skip or graceful OCR failure for text-only mission).
 */
async function triggerPlannerAfterOcr(prisma, missionId, tenantId, triggerMessageId, ocrRunId) {
  const researchMsg = await prisma.agentMessage.findFirst({
    where: { missionId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  }).catch(() => null);
  const triggerForPlanner = researchMsg?.id ?? triggerMessageId;
  const plannerRun = await createAgentRun({
    missionId,
    tenantId: tenantId || missionId,
    agentKey: 'planner',
    triggerMessageId: triggerForPlanner,
    input: { triggeredByOcrRunId: ocrRunId },
  });
  if (process.env.MISSION_PLANNER_INPROCESS === 'true') {
    executeAgentRunInProcess(plannerRun.id).catch((err) =>
      console.warn('[agentRunExecutor] planner run after OCR skip/fail failed:', err?.message || err)
    );
  }
}

/**
 * OCR executor: resolve image from trigger/adjacent messages, run extractTextWithFallback (primary + optional Google Vision fallback), post research_result, merge businessProfile.
 * After success: auto-dispatch planner once (idempotent). If chain plan exists and mode auto_safe, maybeAutoDispatch; else create planner run.
 * For test-mission-agent-chat (text-only): no image or OCR refusal → post planner message, mark completed, trigger planner; never return hard failure.
 * Reuses existing OCR module. Never throws.
 */
async function runOcrExecutor(prisma, runId, missionId, agentKey, triggerMessageId, tenantId) {
  try {
    const resolved = await resolveImageFromMissionMessages(prisma, missionId, triggerMessageId);

    if (isTextOnlyMission(missionId)) {
      if (!resolved?.imageUrl) {
        await postPlannerFallbackMessage(missionId, "No image attached. Describe your goal in text and I'll help.");
        await updateAgentRunStatus(runId, 'completed', { output: { skipped: true, reason: 'no_image' } }).catch(() => {});
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey} (skipped - text-only mission)`, {
          kind: 'run_lifecycle',
          runId,
          agentKey,
          status: 'completed',
        }).catch(() => {});
        await triggerPlannerAfterOcr(prisma, missionId, tenantId, triggerMessageId, runId);
        return { ok: true };
      }
    }

    if (!resolved?.imageUrl) return { ok: false, error: 'No image found in trigger message or adjacent messages' };
    let dataUrl = resolved.imageUrl;
    if (!dataUrl.trim().startsWith('data:image/')) {
      try {
        dataUrl = await imageUrlToDataUrl(resolved.imageUrl);
      } catch (fetchErr) {
        return { ok: false, error: fetchErr?.message || 'Failed to fetch image' };
      }
    }
    let ocrResult;
    try {
      ocrResult = await extractTextWithFallback({
        imageDataUrl: dataUrl,
        purpose: 'business_card',
      });
    } catch (ocrErr) {
      return { ok: false, error: ocrErr?.message || 'OCR failed' };
    }
    const extractedText = ocrResult.text;
    const dataUrlPrefix = typeof dataUrl === 'string' ? dataUrl.slice(0, 50) : '(no dataUrl)';
    const imageByteSize =
      typeof dataUrl === 'string' && dataUrl.startsWith('data:')
        ? Math.floor((dataUrl.length - (dataUrl.indexOf(',') >= 0 ? dataUrl.indexOf(',') + 1 : 0)) * 0.75)
        : 0;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[agentRunExecutor] OCR providerUsed:', ocrResult.providerUsed, 'didFallback:', ocrResult.didFallback);
      console.log('[agentRunExecutor] image dataUrl prefix:', dataUrlPrefix);
      console.log('[agentRunExecutor] image byte size (approx):', imageByteSize);
      console.log('[agentRunExecutor] OCR text first 80 chars:', (extractedText || '').slice(0, 80));
    }
    const ocrRejected = isRefusalResponse(extractedText) || !businessCardLooksLikeOcrText(extractedText);
    if (ocrRejected) {
      if (isTextOnlyMission(missionId)) {
        console.warn('[agentRunExecutor] OCR refused/unreadable for text-only mission; posting planner fallback');
        await postPlannerFallbackMessage(
          missionId,
          "I couldn't read the image. Describe your goal in text and I'll help."
        );
        await updateAgentRunStatus(runId, 'completed', { output: { skipped: true, reason: 'ocr_unreadable' } }).catch(
          () => {}
        );
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey} (skipped - unreadable)`, {
          kind: 'run_lifecycle',
          runId,
          agentKey,
          status: 'completed',
        }).catch(() => {});
        await triggerPlannerAfterOcr(prisma, missionId, tenantId, triggerMessageId, runId);
        return { ok: true };
      }
      console.warn('[agentRunExecutor] OCR returned refusal or non–business-card text; not creating research_result');
      return { ok: false, error: AGENT_CHAT_OCR_FAILURE_MESSAGE };
    }
    const parsed = parseBusinessCardOCR(extractedText, { country: 'AU' });
    const hasStructured = parsed.extractedEntities && Object.keys(parsed.extractedEntities).length > 0;
    const entities = hasStructured ? parsed.extractedEntities : parseOcrToEntities(extractedText);
    const { summary, bullets } = buildSummaryAndBullets(entities, extractedText);
    const rawTextStored = truncateRawTextForPayload(extractedText);
    const payload = {
      title: 'Image summary (OCR)',
      summary,
      bullets,
      extractedEntities: entities,
      query: 'OCR from attachment',
      details: { rawText: rawTextStored },
      meta: {
        providerUsed: ocrResult.providerUsed,
        ...(triggerMessageId && { triggerMessageId }),
      },
    };
    if (hasStructured && parsed.confidence && Object.keys(parsed.confidence).length > 0) {
      payload.confidence = parsed.confidence;
    }
    const researchMsg = await createAgentMessage({
      missionId,
      senderType: 'agent',
      senderId: 'research',
      channel: 'main',
      text: summary,
      messageType: 'research_result',
      payload,
      visibleToUser: true,
    });
    const normalizedProfile = entitiesToBusinessProfile(entities);
    if (Object.keys(normalizedProfile).length > 0) {
      const businessProfileSource =
        triggerMessageId && researchMsg?.id
          ? { triggerMessageId, researchMessageId: researchMsg.id }
          : undefined;
      await mergeMissionContext(missionId, {
        businessProfile: normalizedProfile,
        ...(businessProfileSource && { businessProfileSource }),
      }).catch(() => {});
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agentRunExecutor] businessProfile merged keys:', Object.keys(normalizedProfile));
      }
    }
    await updateAgentRunStatus(runId, 'completed', { output: { extractedText, entities } }).catch(() => {});
    await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
      kind: 'run_lifecycle',
      runId,
      agentKey,
      status: 'completed',
    }).catch(() => {});

    const triggerForPlanner = researchMsg?.id ?? triggerMessageId;
    const existingPlannerForOcr = await prisma.agentRun.findMany({
      where: { missionId, agentKey: 'planner' },
      select: { id: true, input: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const alreadyDispatched = existingPlannerForOcr.some(
      (r) => r.input && typeof r.input === 'object' && r.input.triggeredByOcrRunId === runId
    );
    if (!alreadyDispatched) {
      const plan = await getChainPlan(missionId).catch(() => null);
      const mode = plan?.mode === 'auto_safe' ? 'auto_safe' : plan?.mode === 'auto_drafts' ? 'auto_drafts' : 'manual';
      if (plan && mode === 'auto_safe') {
        maybeAutoDispatch(missionId, 'ocr_completed').catch((err) =>
          console.warn('[agentRunExecutor] maybeAutoDispatch after OCR failed:', err?.message || err)
        );
      } else {
        const plannerRun = await createAgentRun({
          missionId,
          tenantId: tenantId || missionId,
          agentKey: 'planner',
          triggerMessageId: triggerForPlanner,
          input: { triggeredByOcrRunId: runId },
        });
        if (process.env.MISSION_PLANNER_INPROCESS === 'true') {
          executeAgentRunInProcess(plannerRun.id).catch((err) =>
            console.warn('[agentRunExecutor] planner run after OCR failed:', err?.message || err)
          );
        }
      }
    }
    return { ok: true };
  } catch (err) {
    console.warn('[agentRunExecutor] OCR executor error:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Execute an AgentRun in-process (research only). Safe to call fire-and-forget.
 * - Loads run; if status !== "queued" returns without change.
 * - Marks "running", posts "Run started: research", runs research agent, marks "completed" or "failed", posts result.
 * Catches errors so it never throws; logs and sets run to "failed".
 *
 * @param {string} runId - AgentRun id
 */
export async function executeAgentRunInProcess(runId) {
  if (!runId) return;
  const prisma = getPrismaClient();
  let run;
  try {
    run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { id: true, missionId: true, tenantId: true, agentKey: true, status: true, triggerMessageId: true, input: true },
    });
  } catch (err) {
    console.warn('[agentRunExecutor] load run failed:', err?.message || err);
    return;
  }
  if (!run || run.status !== 'queued') return;
  const agentKey = run.agentKey;
  const isResearch = agentKey === 'research';
  const isPlanner = agentKey === 'planner';
  const isOcr = agentKey === 'ocr';
  const isReviewer = agentKey === 'reviewer';
  const isOps = agentKey === 'ops';
  if (!isResearch && !isPlanner && !isOcr && !isReviewer && !isOps) return;
  if (isResearch && process.env.MISSION_RUN_INPROCESS !== 'true') return;
  if (isReviewer && process.env.ENABLE_REVIEWER !== 'true') return;
  const runInput = run.input && typeof run.input === 'object' ? run.input : {};
  const runHasTaskId = !!runInput.taskId;
  const runTriggeredByContextPatch = !!runInput.triggeredByContextPatch;
  const isInternalTool = !!(runInput.intent && INTERNAL_TOOLS.has(runInput.intent));
  if (!isResearch && !isPlanner && !isOcr && !isReviewer && !isInternalTool && !isOps) return;
  if (isPlanner && !isInternalTool && process.env.MISSION_PLANNER_INPROCESS !== 'true' && !runHasTaskId && !runTriggeredByContextPatch) return;

  const { missionId, tenantId, triggerMessageId, input } = run;
  try {
    await updateAgentRunStatus(runId, 'running');
    await postSystemMessage(missionId, agentKey, `Run started: ${agentKey}`, {
      kind: 'run_lifecycle',
      runId,
      agentKey,
      status: 'running',
    });
  } catch (err) {
    console.warn('[agentRunExecutor] set running / system message failed:', err?.message || err);
    await recordRunFailed(missionId, runId, agentKey, err, run);
    return;
  }

  if (isOps && runInput.objective === 'FIX_IMAGE_MISMATCH') {
    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { createdByUserId: true } }).catch(() => null);
    const userId = mission?.createdByUserId || null;
    const correlationId = `${missionId}:${runId}`;
    try {
      const entityType = runInput.entityType || 'DraftStore';
      const entityId = runInput.entityId;
      if (!entityId) {
        await recordRunFailed(missionId, runId, agentKey, 'FIX_IMAGE_MISMATCH requires entityId', run);
        return;
      }
      const ctx = { missionId, runId, userId };
      const A = await executeOpsTool('images.detectMismatch', { entityType, entityId }, ctx);
      if (!A.ok) {
        await recordRunFailed(missionId, runId, agentKey, A.error, run);
        return;
      }
      const mismatches = A.data?.mismatches || [];
      if (mismatches.length === 0) {
        await createAgentMessage({
          missionId,
          senderType: 'agent',
          senderId: agentKey,
          channel: 'main',
          text: 'No mismatches detected.',
          messageType: 'text',
          payload: null,
          visibleToUser: true,
        });
        await updateAgentRunStatus(runId, 'completed', { output: { step: 'detect', mismatches: 0 } });
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, { kind: 'run_lifecycle', runId, agentKey, status: 'completed' });
        return;
      }
      const C = await executeOpsTool('images.rebindByStableKey', { entityType, entityId, dryRun: true }, ctx);
      if (!C.ok) {
        await recordRunFailed(missionId, runId, agentKey, C.error, run);
        return;
      }
      const proposedChanges = C.data?.changes || [];
      if (proposedChanges.length > MAX_REBIND_CHANGES) {
        await createAgentMessage({
          missionId,
          senderType: 'agent',
          senderId: agentKey,
          channel: 'main',
          text: `Too many proposed changes (${proposedChanges.length}). Max ${MAX_REBIND_CHANGES} per run. Please confirm or narrow scope.`,
          messageType: 'text',
          payload: null,
          visibleToUser: true,
        });
        await updateAgentRunStatus(runId, 'completed', { output: { step: 'dry_run', blocked: true, count: proposedChanges.length } });
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey} (blocked)`, { kind: 'run_lifecycle', runId, agentKey, status: 'completed' });
        return;
      }
      let applied = false;
      if (proposedChanges.length > 0 && (await isUserAdmin(userId))) {
        const D = await executeOpsTool('images.rebindByStableKey', { entityType, entityId, dryRun: false }, ctx);
        if (D.ok && D.data?.applied) applied = true;
      }
      const E = await executeOpsTool('images.detectMismatch', { entityType, entityId }, ctx);
      const afterMismatches = E.ok ? (E.data?.mismatches || []).length : 0;
      const summary = `Image repair: ${mismatches.length} mismatch(es) detected; ${applied ? proposedChanges.length + ' fixed.' : 'dry run only (no apply).'} After: ${afterMismatches} remaining.`;
      await createAgentMessage({
        missionId,
        senderType: 'agent',
        senderId: agentKey,
        channel: 'main',
        text: summary,
        messageType: 'text',
        payload: { correlationId, mismatchesBefore: mismatches.length, changesApplied: applied ? proposedChanges.length : 0, mismatchesAfter: afterMismatches },
        visibleToUser: true,
      });
      await updateAgentRunStatus(runId, 'completed', {
        output: { mismatchesBefore: mismatches.length, changesApplied: applied ? proposedChanges.length : 0, mismatchesAfter: afterMismatches },
      });
      await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, { kind: 'run_lifecycle', runId, agentKey, status: 'completed' });
    } catch (err) {
      await recordRunFailed(missionId, runId, agentKey, err, run);
    }
    return;
  }

  if (process.env.ENABLE_TOOL_ADAPTER === 'true') {
    let toolAdapter;
    try {
      toolAdapter = await import('../tools/index.ts');
    } catch (e) {
      console.warn('[agentRunExecutor] tool adapter load failed:', e?.message || e);
    }
    if (toolAdapter?.isToolAdapterEnabled?.()) {
      const task = runInput.taskId
        ? await findMissionTaskById(missionId, runInput.taskId).catch(() => null)
        : null;
      const toolKey = toolAdapter.resolveToolForTask(task, runInput);
      if (toolKey) {
        const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { createdByUserId: true } }).catch(() => null);
        const ctx = {
          missionId,
          runId,
          taskId: runInput.taskId ?? undefined,
          userId: mission?.createdByUserId,
          tenantId,
        };
        const toolInput = { ...runInput, missionId };
        const postLifecycle = async (payload) => {
          const text = payload.status === 'running' ? `Run started: ${payload.toolKey ?? 'tool'}` : payload.status === 'completed' ? `Run completed: ${payload.toolKey ?? 'tool'}` : `Run failed: ${payload.toolKey ?? 'tool'}`;
          await postSystemMessage(missionId, agentKey, text, { kind: 'run_lifecycle', runId, agentKey, ...payload });
        };
        const audit = async (data) => {
          try {
            await prisma.auditEvent.create({
              data: {
                entityType: data.entityType,
                entityId: data.entityId,
                action: data.action,
                actorType: data.actorType,
                actorId: data.actorId ?? null,
                reason: data.reason ?? null,
                metadata: data.metadata ?? undefined,
              },
            });
          } catch (auditErr) {
            console.warn('[agentRunExecutor] tool audit failed:', auditErr?.message || auditErr);
          }
        };
        let toolResult;
        try {
          toolResult = await toolAdapter.executeTool(toolKey, ctx, toolInput, {
            getSecrets: () => ({ ...process.env }),
            postLifecycle,
            audit,
          });
        } catch (err) {
          await recordRunFailed(missionId, runId, agentKey, err, run);
          if (runInput.taskId) await updateMissionTaskStatusAndMeta(runInput.taskId, 'pending', { lastError: err?.message || String(err) }).catch(() => {});
          return;
        }
        if (toolResult.blocked) {
          const approvalPayload = {
            prompt: 'This step requires your approval before running.',
            options: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }],
            blockedRunId: runId,
            blockedTaskId: runInput.taskId ?? undefined,
            taskId: runInput.taskId ?? undefined,
            chainId: runInput.chainId ?? undefined,
            suggestionId: runInput.suggestionId ?? undefined,
            toolKey,
            intent: typeof runInput.intent === 'string' ? runInput.intent : task?.intent ?? undefined,
            risk: (task?.risk && ['R0', 'R1', 'R2', 'R3'].includes(task.risk)) ? task.risk : undefined,
          };
          await createAgentMessage({
            missionId,
            senderId: agentKey,
            senderType: 'agent',
            channel: 'main',
            text: 'This step requires your approval before running.',
            messageType: 'approval_required',
            payload: approvalPayload,
            visibleToUser: true,
          }).catch(() => null);
          await updateAgentRunStatus(runId, 'blocked', { output: { blocked: true, reason: 'approval_required', toolKey } }).catch(() => {});
          if (runInput.taskId) await updateMissionTaskStatusAndMeta(runInput.taskId, 'waiting_approval', { blocked: true }).catch(() => {});
          const plan = await getChainPlan(missionId).catch(() => null);
          if (plan) await mergeMissionContext(missionId, { chainPlan: { ...plan, status: 'waiting_approval' } }).catch(() => {});
          await postSystemMessage(missionId, agentKey, `Run waiting approval: ${toolKey}`, {
            kind: 'run_lifecycle',
            runId,
            agentKey,
            status: 'blocked',
            internalTool: toolKey,
            summary: { message: 'Approval required' },
          }).catch(() => {});
          return;
        }
        if (!toolResult.ok) {
          const errMsg = (toolResult.error || 'Tool failed').slice(0, 200);
          await recordRunFailed(missionId, runId, agentKey, errMsg, run);
          if (runInput.taskId) await updateMissionTaskStatusAndMeta(runInput.taskId, 'pending', { lastError: errMsg }).catch(() => {});
          return;
        }
        const artifacts = Array.isArray(toolResult.artifacts) ? toolResult.artifacts : [];
        for (const art of artifacts) {
          await createAgentMessage({
            missionId,
            senderId: agentKey,
            senderType: 'agent',
            channel: 'main',
            text: art.title || toolResult.summary?.message || 'Artifact',
            messageType: 'artifact',
            payload: { ...art.payload, title: art.title, mimeType: art.mimeType, internalTool: art.internalTool ?? toolKey },
            visibleToUser: true,
          }).catch(() => null);
        }
        await updateAgentRunStatus(runId, 'completed', { output: { summary: toolResult.summary, toolKey, artifacts: artifacts.length } }).catch(() => {});
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
          kind: 'run_lifecycle',
          runId,
          agentKey,
          status: 'completed',
          internalTool: toolKey,
          summary: toolResult.summary,
        }).catch(() => {});
        if (runInput.taskId) {
          const task = await findMissionTaskById(missionId, runInput.taskId).catch(() => null);
          if (task) {
            await updateMissionTaskStatusAndMeta(runInput.taskId, 'completed').catch(() => {});
            await postSystemMessage(missionId, agentKey, `Task completed: ${task.title || 'Step'}`, {
              kind: 'task_completed',
              taskId: runInput.taskId,
              title: task.title,
            }).catch(() => {});
          }
        }
        if (runInput.chainId && runInput.suggestionId && runInput.taskId) {
          const plan = await getChainPlan(missionId).catch(() => null);
          const cursor = plan ? Number(plan.cursor) : 0;
          const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
          if (plan && plan.chainId === runInput.chainId && currentSuggestion?.id === runInput.suggestionId) {
            await advanceChainCursor(missionId).catch(() => {});
            maybeAutoDispatch(missionId, 'run_completed').catch(() => {});
          }
        }
        return;
      }
    }
  }

  if (isInternalTool) {
    let toolResult;
    try {
      toolResult = await executeInternalTool(missionId, runInput.intent, runInput, run);
    } catch (err) {
      await recordRunFailed(missionId, runId, agentKey, err, run);
      if (runInput.taskId) {
        const task = await findMissionTaskById(missionId, runInput.taskId).catch(() => null);
        if (task) await updateMissionTaskStatusAndMeta(runInput.taskId, 'pending', { lastError: err?.message || String(err) }).catch(() => {});
      }
      return;
    }
    if (!toolResult.ok) {
      const errMsg = (toolResult.error || 'Internal tool failed').slice(0, 200);
      await recordRunFailed(missionId, runId, agentKey, errMsg, run);
      if (runInput.taskId) {
        const task = await findMissionTaskById(missionId, runInput.taskId).catch(() => null);
        if (task) await updateMissionTaskStatusAndMeta(runInput.taskId, 'pending', { lastError: errMsg }).catch(() => {});
      }
      return;
    }
    const summary = toolResult.summary || { tool: runInput.intent, message: 'Completed' };
    try {
      await createAgentMessage({
        missionId,
        senderId: agentKey,
        senderType: 'agent',
        channel: 'main',
        text: summary.message || `Internal operation: ${runInput.intent}`,
        messageType: 'artifact',
        payload: {
          title: `Internal operation: ${runInput.intent}`,
          mimeType: 'application/json',
          summary,
          internalTool: runInput.intent,
        },
        visibleToUser: true,
      }).catch(() => null);
      await updateAgentRunStatus(runId, 'completed', { output: { summary, internalTool: runInput.intent } }).catch(() => {});
      await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
        kind: 'run_lifecycle',
        runId,
        agentKey,
        status: 'completed',
        internalTool: runInput.intent,
        summary,
      }).catch(() => {});
      if (runInput.taskId) {
        const task = await findMissionTaskById(missionId, runInput.taskId).catch(() => null);
        if (task) {
          await updateMissionTaskStatusAndMeta(runInput.taskId, 'completed').catch(() => {});
          await postSystemMessage(missionId, agentKey, `Task completed: ${task.title || 'Step'}`, {
            kind: 'task_completed',
            taskId: runInput.taskId,
            title: task.title,
          }).catch(() => {});
        }
      }
      if (runInput.chainId && runInput.suggestionId && runInput.taskId) {
        const plan = await getChainPlan(missionId).catch(() => null);
        const cursor = plan ? Number(plan.cursor) : 0;
        const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
        if (plan && plan.chainId === runInput.chainId && currentSuggestion?.id === runInput.suggestionId) {
          await advanceChainCursor(missionId).catch(() => {});
          maybeAutoDispatch(missionId, 'run_completed').catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[agentRunExecutor] internal tool post-complete failed:', err?.message || err);
    }
    return;
  }

  if (isPlanner) {
    const runInput = run.input && typeof run.input === 'object' ? run.input : {};
    const taskId = runInput.taskId;
    const intent = runInput.intent;
    const useIntentExecutor = taskId && intent && INTENT_V0_SET.has(intent);

    const plannerInput = { ...input, triggerMessageId: input.triggerMessageId ?? run.triggerMessageId };
    const result = useIntentExecutor
      ? await runIntentExecutor(missionId, intent)
      : await runPlannerInProcess(missionId, plannerInput).catch((err) => {
          console.warn('[agentRunExecutor] planner failed:', err?.message || err);
          return { ok: false, error: err?.message || String(err) };
        });

    if (!result?.ok) {
      const errMsg = (result?.error || 'Planner failed').slice(0, 200);
      await recordRunFailed(missionId, runId, agentKey, errMsg, run);
      await recordBiddingOutcomeIfPresent(run, false).catch(() => {});
      if (taskId) {
        const task = await findMissionTaskById(missionId, taskId);
        if (task) {
          await updateMissionTaskStatusAndMeta(taskId, 'pending', { lastError: errMsg }).catch(() => {});
        }
      }
      if (runInput.suggestionId && !taskId) {
        const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
        if (task) await updateMissionTaskStatus(task.id, 'pending').catch(() => {});
      }
      if (runInput.chainId && runInput.suggestionId) {
        const plan = await getChainPlan(missionId).catch(() => null);
        const cursor = plan ? Number(plan.cursor) : 0;
        const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
        if (plan && plan.chainId === runInput.chainId && currentSuggestion?.id === runInput.suggestionId) {
          await mergeMissionContext(missionId, { chainPlan: { ...plan, status: 'blocked_error' } }).catch(() => {});
        }
      }
      return;
    }
    try {
      await updateAgentRunStatus(runId, 'completed', { output: { done: true } });
      await recordBiddingOutcomeIfPresent(run, true).catch(() => {});
      await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
        kind: 'run_lifecycle',
        runId,
        agentKey,
        status: 'completed',
      });
      if (taskId) {
        const task = await findMissionTaskById(missionId, taskId);
        if (task) {
          const newStatus = task.risk === 'R3' ? 'review' : 'completed';
          await updateMissionTaskStatusAndMeta(taskId, newStatus).catch(() => {});
          await postSystemMessage(missionId, agentKey, `Task completed: ${task.title || 'Step'}`, {
            kind: 'task_completed',
            taskId,
            title: task.title,
          }).catch(() => {});
        }
      }
      if (runInput.suggestionId && !taskId) {
        const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
        if (task) await updateMissionTaskStatus(task.id, 'completed').catch(() => {});
      }
      if (runInput.chainId && runInput.suggestionId && !taskId) {
        const plan = await getChainPlan(missionId).catch(() => null);
        const cursor = plan ? Number(plan.cursor) : 0;
        const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
        const chainMatches = plan && plan.chainId === runInput.chainId;
        const stepMatches = currentSuggestion?.id === runInput.suggestionId;
        if (chainMatches && stepMatches) {
          await advanceChainCursor(missionId).catch(() => {});
          maybeAutoDispatch(missionId, 'run_completed').catch((err) =>
            console.warn('[agentRunExecutor] maybeAutoDispatch failed:', err?.message || err)
          );
        }
      }
    } catch (err) {
      console.warn('[agentRunExecutor] set completed (planner) failed:', err?.message || err);
    }
    return;
  }

  if (isReviewer) {
    const runInput = run.input && typeof run.input === 'object' ? run.input : {};
    const planMessageId = runInput.planMessageId || run.triggerMessageId;
    if (!planMessageId) {
      await recordRunFailed(missionId, runId, agentKey, 'reviewer requires planMessageId', run);
      return;
    }
    const { runReviewerInProcess } = await import('./reviewerExecutor.js');
    let result;
    try {
      result = await runReviewerInProcess(missionId, planMessageId, {
        triggerMessageId: runInput.triggerMessageId || run.triggerMessageId,
      });
    } catch (err) {
      await recordRunFailed(missionId, runId, agentKey, err, run);
      return;
    }
    const issues = Array.isArray(result.issues) ? result.issues : [];
    const reviewPayload = {
      status: result.status,
      summary: result.summary,
      issues: issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
        suggestedFix: typeof i.suggestedFix === 'string' ? i.suggestedFix : '',
      })),
      suggestedFixes: issues.map((i) => (typeof i.suggestedFix === 'string' ? i.suggestedFix : '')).filter(Boolean),
    };
    const reviewMsg = await createAgentMessage({
      missionId,
      senderId: 'reviewer',
      senderType: 'agent',
      channel: 'main',
      text: result.summary,
      messageType: 'review_result',
      payload: reviewPayload,
      visibleToUser: true,
    }).catch(() => null);
    await updateAgentRunStatus(runId, 'completed', { output: { status: result.status } }).catch(() => {});
    await mergeMissionContext(missionId, {
      review: {
        status: result.status,
        planMessageId,
        reviewMessageId: reviewMsg?.id ?? null,
        issues: reviewPayload.issues,
      },
    }).catch(() => {});
    await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
      kind: 'run_lifecycle',
      runId,
      agentKey,
      status: 'completed',
    }).catch(() => {});
    return;
  }

  if (isOcr) {
    if (isTextOnlyMission(missionId)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[agentRunExecutor] Skipping OCR for text-only mission:', missionId);
      }
      await updateAgentRunStatus(runId, 'completed', { output: { skipped: true, reason: 'text_only_mission' } }).catch(
        () => {}
      );
      await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey} (skipped - text-only mission)`, {
        kind: 'run_lifecycle',
        runId,
        agentKey,
        status: 'completed',
      }).catch(() => {});
      await triggerPlannerAfterOcr(prisma, missionId, run.tenantId, triggerMessageId, runId);
      return;
    }
    const ocrResult = await runOcrExecutor(prisma, runId, missionId, agentKey, triggerMessageId, run.tenantId);
    const runInput = run.input && typeof run.input === 'object' ? run.input : {};
    if (!ocrResult?.ok) {
      // Defensive: for text-only test mission, never surface hard OCR failure; treat as graceful and trigger planner
      if (isTextOnlyMission(missionId)) {
        console.warn('[agentRunExecutor] OCR failed for text-only mission; treating as graceful fallback');
        await postPlannerFallbackMessage(
          missionId,
          "I couldn't read the image. Describe your goal in text and I'll help."
        );
        await updateAgentRunStatus(runId, 'completed', { output: { skipped: true, reason: 'ocr_failed_graceful' } }).catch(
          () => {}
        );
        await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey} (skipped - unreadable)`, {
          kind: 'run_lifecycle',
          runId,
          agentKey,
          status: 'completed',
        }).catch(() => {});
        await triggerPlannerAfterOcr(prisma, missionId, run.tenantId, triggerMessageId, runId);
        return;
      }
      const errMsg = (ocrResult?.error && String(ocrResult.error).slice(0, 200)) || 'OCR failed';
      await recordRunFailed(missionId, runId, agentKey, errMsg, run);
      if (runInput.suggestionId) {
        const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
        if (task) await updateMissionTaskStatus(task.id, 'pending').catch(() => {});
      }
      if (runInput.chainId && runInput.suggestionId) {
        const plan = await getChainPlan(missionId).catch(() => null);
        if (plan && plan.chainId === runInput.chainId) {
          await mergeMissionContext(missionId, { chainPlan: { ...plan, status: 'blocked_error' } }).catch(() => {});
        }
      }
      await createAgentMessage({
        missionId,
        senderType: 'agent',
        senderId: 'planner',
        channel: 'main',
        text: AGENT_CHAT_OCR_FAILURE_MESSAGE,
        messageType: 'text',
        visibleToUser: true,
      }).catch(() => {});
    } else if (runInput.suggestionId) {
      const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
      if (task) await updateMissionTaskStatus(task.id, 'completed').catch(() => {});
    }
    return;
  }

  let userMessage = (input && typeof input === 'object' && input.intent) ? String(input.intent) : '';
  if (!userMessage && triggerMessageId) {
    try {
      const trigger = await prisma.agentMessage.findUnique({
        where: { id: triggerMessageId },
        select: { content: true },
      });
      if (trigger?.content && typeof trigger.content === 'object' && trigger.content.text) {
        userMessage = String(trigger.content.text);
      }
    } catch (_) {}
  }
  if (!userMessage.trim()) userMessage = 'Research request';

  try {
    const { runResearchAgent } = await import('../agents/researchAgent.js');
    await runResearchAgent({
      missionId,
      tenantId,
      userMessage,
      threadId: undefined,
    });
  } catch (err) {
    console.warn('[agentRunExecutor] research agent failed:', err?.message || err);
    await recordRunFailed(missionId, runId, agentKey, err, run);
    await recordBiddingOutcomeIfPresent(run, false).catch(() => {});
    const runInput = run.input && typeof run.input === 'object' ? run.input : {};
    if (runInput.suggestionId) {
      const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
      if (task) await updateMissionTaskStatus(task.id, 'pending').catch(() => {});
    }
    if (runInput.chainId && runInput.suggestionId) {
      const plan = await getChainPlan(missionId).catch(() => null);
      const cursor = plan ? Number(plan.cursor) : 0;
      const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
      const chainMatches = plan && plan.chainId === runInput.chainId;
      const stepMatches = currentSuggestion?.id === runInput.suggestionId;
      if (chainMatches && stepMatches) {
        await mergeMissionContext(missionId, { chainPlan: { ...plan, status: 'blocked_error' } }).catch(() => {});
      }
    }
    return;
  }

  try {
    await updateAgentRunStatus(runId, 'completed', { output: { done: true } });
    await recordBiddingOutcomeIfPresent(run, true).catch(() => {});
    await postSystemMessage(missionId, agentKey, `Run completed: ${agentKey}`, {
      kind: 'run_lifecycle',
      runId,
      agentKey,
      status: 'completed',
    });
    const runInput = run.input && typeof run.input === 'object' ? run.input : {};
    if (runInput.suggestionId) {
      const task = await findMissionTaskBySuggestion(missionId, runInput.suggestionId);
      if (task) await updateMissionTaskStatus(task.id, 'completed').catch(() => {});
    }
    if (runInput.chainId && runInput.suggestionId) {
      const plan = await getChainPlan(missionId).catch(() => null);
      const cursor = plan ? Number(plan.cursor) : 0;
      const currentSuggestion = Array.isArray(plan?.suggestions) ? plan.suggestions[cursor] : null;
      const expectedSuggestionId = currentSuggestion?.id ?? null;
      const chainMatches = plan && plan.chainId === runInput.chainId;
      const stepMatches = expectedSuggestionId !== null && expectedSuggestionId === runInput.suggestionId;
      if (chainMatches && stepMatches) {
        await advanceChainCursor(missionId).catch(() => {});
        maybeAutoDispatch(missionId, 'run_completed').catch((err) =>
          console.warn('[agentRunExecutor] maybeAutoDispatch failed:', err?.message || err)
        );
      } else if (chainMatches && !stepMatches && process.env.NODE_ENV !== 'production') {
        console.debug('[agentRunExecutor] cursor not advanced (run does not match current step)', {
          missionId,
          runId,
          chainId: runInput.chainId,
          suggestionId: runInput.suggestionId,
          expectedSuggestionId,
        });
      }
    }
  } catch (err) {
    console.warn('[agentRunExecutor] set completed / system message failed:', err?.message || err);
  }
}

/**
 * Agent messages API: user vs AI vs agents communication layer.
 * POST/GET /api/agent-messages, POST /api/agent-messages/stream-token (short-lived token for SSE).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { broadcastAgentMessage, broadcastThreadMessage } from '../realtime/simpleSse.js';
import { issueStreamToken } from '../lib/agentChatStreamAuth.js';
import { handleUserTurn } from '../orchestrator/agentChatTurn.js';
import { getOrCreateMission } from '../lib/mission.js';
import { getTenantId } from '../lib/tenant.js';
import { createAgentRun } from '../lib/agentRun.js';
import { executeAgentRunInProcess } from '../lib/agentRunExecutor.js';
import { shouldDispatchOnChatMessage } from '../lib/chatIntentClassifier.js';
import { isTextOnlyMission } from '../lib/missionConfig.js';
import { classifyIntent, INTENT_MARKETING, INTENT_FIX_IMAGE_MISMATCH } from '../lib/agentIntentRouter.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * Schedule one OCR run for a message with attachment. Idempotent: if an OCR run already exists
 * for this missionId+triggerMessageId, does nothing. Fire-and-forget safe.
 */
async function scheduleOcrForMessage(missionId, messageId, user) {
  const existing = await prisma.agentRun.findFirst({
    where: { missionId, triggerMessageId: messageId, agentKey: 'ocr' },
    select: { id: true },
  });
  if (existing) return;
  const mission = await getOrCreateMission(missionId, user);
  const tenantId = mission?.tenantId || getTenantId(user) || user?.id;
  if (!tenantId) return;
  const run = await createAgentRun({
    missionId,
    tenantId: String(tenantId),
    agentKey: 'ocr',
    triggerMessageId: messageId,
  });
  executeAgentRunInProcess(run.id).catch((err) => {
    console.warn('[agent-messages] OCR auto-run failed:', err?.message || err);
  });
}

const PAYLOAD_MAX_BYTES = 64 * 1024; // 64KB
const TEXT_MAX_BYTES = 32 * 1024;   // 32KB

/**
 * Validate structured message payload: must be plain object or array, JSON size <= PAYLOAD_MAX_BYTES.
 * @returns {{ valid: true } | { valid: false, code: string, message: string }}
 */
export function validatePayload(payload) {
  if (payload === null || payload === undefined) return { valid: true };
  const type = Object.prototype.toString.call(payload);
  if (type !== '[object Object]' && type !== '[object Array]') {
    return { valid: false, code: 'PAYLOAD_INVALID_TYPE', message: 'payload must be a JSON object or array' };
  }
  let json;
  try {
    json = JSON.stringify(payload);
  } catch (_) {
    return { valid: false, code: 'PAYLOAD_INVALID_JSON', message: 'payload is not JSON-serializable' };
  }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > PAYLOAD_MAX_BYTES) {
    return {
      valid: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: `payload must not exceed ${PAYLOAD_MAX_BYTES} bytes (got ${bytes})`,
    };
  }
  return { valid: true };
}

/**
 * Normalize/validate payload by messageType. Reject only when invalid; coerce when safe and set validationError.
 * @returns {{ ok: true, payload: object, validationError?: string } | { ok: false, code: string, message: string }}
 */
export function validatePayloadByMessageType(messageType, payload) {
  if (payload === null || payload === undefined) return { ok: true, payload: null };
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'PAYLOAD_INVALID_TYPE', message: 'payload must be an object for this messageType' };
  }
  const p = { ...payload };
  const warnings = [];

  switch (messageType) {
    case 'research_result': {
      if (p.summary != null && typeof p.summary !== 'string') p.summary = String(p.summary);
      if (p.query != null && typeof p.query !== 'string') p.query = String(p.query);
      if (p.citations != null && !Array.isArray(p.citations)) {
        p.citations = [];
        warnings.push('citations normalized to []');
      } else if (Array.isArray(p.citations)) {
        p.citations = p.citations.map((c) => (typeof c === 'string' ? c : String(c))).slice(0, 200);
      }
      if (p.sources != null && !Array.isArray(p.sources)) {
        p.sources = [];
        warnings.push('sources normalized to []');
      } else if (Array.isArray(p.sources)) {
        p.sources = p.sources.slice(0, 100).map((s) => (s && typeof s === 'object' && !Array.isArray(s) ? s : {}));
      }
      break;
    }
    case 'plan_update': {
      if (p.title != null && typeof p.title !== 'string') p.title = String(p.title);
      if (p.status != null && typeof p.status !== 'string') p.status = String(p.status);
      if (p.steps != null && !Array.isArray(p.steps)) {
        p.steps = [];
        warnings.push('steps normalized to []');
      } else if (Array.isArray(p.steps)) {
        p.steps = p.steps.map((s) => (typeof s === 'string' ? s : String(s))).slice(0, 50);
      }
      break;
    }
    case 'campaign_proposal': {
      if (p.title != null && typeof p.title !== 'string') p.title = String(p.title);
      if (p.sections != null && !Array.isArray(p.sections)) {
        p.sections = [];
        warnings.push('sections normalized to []');
      } else if (Array.isArray(p.sections)) {
        p.sections = p.sections.slice(0, 20).map((sec) => ({
          heading: sec && typeof sec === 'object' ? (typeof sec.heading === 'string' ? sec.heading : '') : '',
          body: sec && typeof sec === 'object' ? (typeof sec.body === 'string' ? sec.body : '') : '',
        }));
      }
      break;
    }
    case 'approval_required': {
      if (p.prompt != null && typeof p.prompt !== 'string') p.prompt = String(p.prompt);
      if (!Array.isArray(p.options) || p.options.length === 0) {
        return { ok: false, code: 'PAYLOAD_OPTIONS_REQUIRED', message: 'approval_required requires payload.options (non-empty array)' };
      }
      p.options = p.options.slice(0, 10).map((o) => ({
        id: o && typeof o === 'object' ? String(o.id ?? '') : String(o),
        label: o && typeof o === 'object' ? String(o.label ?? '') : String(o),
      }));
      if (p.options.some((o) => !o.id && !o.label)) warnings.push('some options had missing id/label');
      break;
    }
    case 'artifact': {
      if (p.title != null && typeof p.title !== 'string') p.title = String(p.title);
      if (p.url != null && typeof p.url !== 'string') p.url = String(p.url);
      if (p.mimeType != null && typeof p.mimeType !== 'string') p.mimeType = String(p.mimeType);
      if (p.preview != null && typeof p.preview !== 'string') p.preview = String(p.preview);
      break;
    }
    case 'execution_suggestions': {
      const validRisks = ['R0', 'R1', 'R2', 'R3'];
      if (p.suggestions != null && !Array.isArray(p.suggestions)) {
        p.suggestions = [];
        warnings.push('suggestions normalized to []');
      } else if (Array.isArray(p.suggestions)) {
        p.suggestions = p.suggestions.slice(0, 20).map((s, i) => {
          const obj = s && typeof s === 'object' ? s : {};
          const riskRaw = obj.risk != null ? String(obj.risk).toUpperCase() : 'R1';
          const risk = validRisks.includes(riskRaw) ? riskRaw : 'R1';
          return {
            id: typeof obj.id === 'string' && obj.id.trim() ? String(obj.id).slice(0, 64) : `s${i}`,
            label: String(obj.label ?? '').slice(0, 120),
            agentKey: String(obj.agentKey ?? 'planner').slice(0, 32),
            intent: String(obj.intent ?? '').slice(0, 80),
            risk,
            requiresApproval: obj.requiresApproval !== undefined ? Boolean(obj.requiresApproval) : risk === 'R3',
          };
        });
      }
      break;
    }
    case 'review_result': {
      const validStatus = ['approved', 'changes_requested'];
      if (p.status != null && !validStatus.includes(String(p.status))) p.status = 'changes_requested';
      if (p.summary != null && typeof p.summary !== 'string') p.summary = String(p.summary);
      if (p.issues != null && !Array.isArray(p.issues)) p.issues = [];
      else if (Array.isArray(p.issues)) {
        p.issues = p.issues.slice(0, 50).map((i) => ({
          code: i && typeof i === 'object' ? String(i.code ?? '').slice(0, 64) : '',
          severity: (i && typeof i === 'object' && ['low', 'medium', 'high'].includes(i.severity)) ? i.severity : 'medium',
          message: i && typeof i === 'object' ? String(i.message ?? '').slice(0, 500) : '',
          suggestedFix: i && typeof i === 'object' && typeof i.suggestedFix === 'string' ? String(i.suggestedFix).slice(0, 300) : '',
        }));
      }
      if (p.suggestedFixes != null && !Array.isArray(p.suggestedFixes)) p.suggestedFixes = [];
      else if (Array.isArray(p.suggestedFixes)) p.suggestedFixes = p.suggestedFixes.slice(0, 20).map((s) => String(s).slice(0, 200));
      break;
    }
    default:
      return { ok: true, payload: p };
  }

  const validationError = warnings.length ? warnings.join('; ') : undefined;
  return { ok: true, payload: p, validationError };
}

/**
 * Shared: can this user access messages/stream for this missionId?
 * When missionId is an OrchestratorTask id, allow owner/tenant or dev placeholder bypass.
 */
async function canAccessMission(missionIdTrimmed, user) {
  const task = await prisma.orchestratorTask.findUnique({
    where: { id: missionIdTrimmed },
    select: { userId: true, tenantId: true },
  });
  if (!task) return true;
  const ownerId = user?.id;
  const userBusinessId = user?.business?.id;
  const effectiveTenant = userBusinessId ?? ownerId;
  const isOwner =
    task.userId === ownerId ||
    task.userId === effectiveTenant ||
    task.tenantId === ownerId ||
    task.tenantId === userBusinessId;
  const devPlaceholder = task.userId === 'temp' || task.tenantId === 'temp' || task.userId === 'dev-user-id' || task.tenantId === 'dev-user-id';
  const devBypass = process.env.NODE_ENV !== 'production' && ownerId && devPlaceholder;
  return isOwner || devBypass;
}

/**
 * POST /api/agent-messages
 * Body (legacy): { missionId: string, channel?: string, text: string }
 * Body (structured): { missionId: string, channel?: string, messageType?: string, payload?: object|array, text?: string }
 * Body (system decision): { missionId: string, senderType: 'system', text: string, payload: { decidedMessageId, optionId, optionLabel } }
 * Same permission rules for all; system messages do not trigger planner reply.
 */
const IMAGE_URL_MAX_LENGTH = 2048;

router.post('/agent-messages', requireAuth, async (req, res, next) => {
  try {
    const { missionId, channel, text, messageType: bodyMessageType, payload: bodyPayload, senderType: bodySenderType, imageUrl: bodyImageUrl, threadId: bodyThreadId } = req.body ?? {};
    const threadIdTrimmed = typeof bodyThreadId === 'string' && bodyThreadId.trim() ? bodyThreadId.trim() : null;

    let missionIdTrimmed;
    if (threadIdTrimmed) {
      const participant = await prisma.chatThreadParticipant.findFirst({
        where: {
          threadId: threadIdTrimmed,
          participantType: 'user',
          participantId: req.user.id,
        },
        include: { thread: true },
      });
      if (!participant?.thread) {
        return res.status(403).json({
          ok: false,
          code: 'FORBIDDEN_THREAD',
          message: 'You are not a participant of this thread',
        });
      }
      missionIdTrimmed = (participant.thread.missionId || participant.thread.id || '').trim() || participant.thread.id;
    } else {
      if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
        return res.status(400).json({
          ok: false,
          code: 'MISSION_ID_REQUIRED',
          message: 'missionId is required and must be a non-empty string',
        });
      }
      missionIdTrimmed = missionId.trim();
    }

    const channelVal = (channel != null && typeof channel === 'string' && channel.trim()) ? channel.trim() : 'main';
    const isSystemDecision = bodySenderType === 'system';

    const isStructured = bodyMessageType !== undefined || bodyPayload !== undefined || isSystemDecision;
    let messageType = 'text';
    let payload = null;
    let contentText = '';

    let validationError = null;

    if (isSystemDecision) {
      contentText = typeof text === 'string' ? text : 'Decision recorded';
      if (bodyPayload !== undefined && bodyPayload !== null) {
        const v = validatePayload(bodyPayload);
        if (!v.valid) {
          return res.status(400).json({ ok: false, code: v.code, message: v.message });
        }
        payload = bodyPayload;
      }
    } else if (!isStructured) {
      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          ok: false,
          code: 'TEXT_REQUIRED',
          message: 'text is required and must be a string',
        });
      }
      contentText = text;
    } else {
      messageType = typeof bodyMessageType === 'string' && bodyMessageType.trim() ? bodyMessageType.trim() : 'text';
      if (bodyPayload !== undefined && bodyPayload !== null) {
        const v = validatePayload(bodyPayload);
        if (!v.valid) {
          return res.status(400).json({ ok: false, code: v.code, message: v.message });
        }
        const typeResult = validatePayloadByMessageType(messageType, bodyPayload);
        if (!typeResult.ok) {
          return res.status(400).json({ ok: false, code: typeResult.code, message: typeResult.message });
        }
        payload = typeResult.payload;
        if (typeResult.validationError) validationError = typeResult.validationError;
      }
      contentText = typeof text === 'string' ? text : '';
    }

    if (Buffer.byteLength(contentText, 'utf8') > TEXT_MAX_BYTES) {
      let n = contentText.length;
      while (n > 0 && Buffer.byteLength(contentText.slice(0, n), 'utf8') > TEXT_MAX_BYTES) n -= 1;
      contentText = contentText.slice(0, n);
      validationError = (validationError ? validationError + '; ' : '') + `text truncated to ${TEXT_MAX_BYTES} bytes`;
    }

    if (!threadIdTrimmed) {
      const allowed = await canAccessMission(missionIdTrimmed, req.user);
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          code: 'FORBIDDEN_MISSION',
          message: 'You do not have access to post messages for this mission',
        });
      }
    }

    let content = { text: contentText };
    if (!isSystemDecision && bodyImageUrl != null && typeof bodyImageUrl === 'string' && bodyImageUrl.trim()) {
      const imageUrlTrimmed = bodyImageUrl.trim();
      if (imageUrlTrimmed.length <= IMAGE_URL_MAX_LENGTH) {
        content = { text: contentText, imageUrl: imageUrlTrimmed };
      }
    }

    const senderType = isSystemDecision ? 'system' : 'user';
    const message = await prisma.agentMessage.create({
      data: {
        missionId: missionIdTrimmed,
        senderType,
        senderId: req.user.id,
        visibleToUser: true,
        channel: channelVal,
        performative: null,
        messageType,
        content,
        payload,
        threadId: threadIdTrimmed || undefined,
      },
    });
    if (process.env.NODE_ENV !== 'production') {
      if (typeof message.messageType !== 'string') throw new Error('AgentMessage.messageType must be string');
      if (message.payload !== null && typeof message.payload !== 'object') throw new Error('AgentMessage.payload must be null or object');
    }
    const responseBody = validationError ? { ...message, meta: { validationError } } : message;
    broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message: responseBody });
    if (threadIdTrimmed) {
      broadcastThreadMessage(threadIdTrimmed, { threadId: threadIdTrimmed, message: responseBody });
    }

    if (!isSystemDecision) {
      const tenantId = req.user?.business?.id ?? req.userId ?? req.user?.id;
      const intent = classifyIntent(contentText);
      if (tenantId) {
        const { shouldDispatch, reason } = shouldDispatchOnChatMessage(contentText);
        let allowHandleUserTurn = shouldDispatch;
        // Text-only test mission: always run planner so the chat never appears stuck without a reply
        if (isTextOnlyMission(missionIdTrimmed)) {
          allowHandleUserTurn = true;
        }
        // For normal missions, chain execution state can require explicit Continue/Approve.
        // For the text-only test mission, we intentionally bypass this gate to ensure every message gets a reply.
        if (allowHandleUserTurn && !isTextOnlyMission(missionIdTrimmed)) {
          const { getChainPlan, computeChainStatus } = await import('../lib/chainPlan.js');
          const plan = await getChainPlan(missionIdTrimmed).catch(() => null);
          if (plan) {
            const status = await computeChainStatus(missionIdTrimmed, plan).catch(() => 'running');
            if (status === 'waiting_approval' || status === 'running') {
              allowHandleUserTurn = false;
              if (process.env.NODE_ENV !== 'production') {
                console.log('[agent-messages] skip handleUserTurn: chain status', status, '- require explicit Continue/Approve');
              }
            }
          }
        } else if (process.env.NODE_ENV !== 'production' && reason) {
          console.log('[agent-messages] chat-only (no dispatch):', reason);
        }
        if (allowHandleUserTurn || intent === INTENT_FIX_IMAGE_MISMATCH) {
          handleUserTurn({
            missionId: missionIdTrimmed,
            tenantId: String(tenantId),
            userMessage: contentText,
            threadId: threadIdTrimmed ?? undefined,
            triggerMessageId: message.id,
          }).catch((err) => {
            console.warn('[agent-messages] handleUserTurn failed:', err?.message || err);
          });
        }
      }
      if (content?.imageUrl && intent !== INTENT_MARKETING && intent !== INTENT_FIX_IMAGE_MISMATCH) {
        scheduleOcrForMessage(missionIdTrimmed, message.id, req.user).catch((err) => {
          console.warn('[agent-messages] OCR auto-dispatch failed:', err?.message || err);
        });
      }
    } else {
      console.log('[agent-messages] System decision recorded', { missionId: missionIdTrimmed, messageId: message.id, payload: payload != null ? 'present' : 'none' });
      const optionId = payload && typeof payload === 'object' ? payload.optionId : null;
      const decidedMessageId = payload && typeof payload === 'object' ? payload.decidedMessageId : null;
      if ((optionId === 'skip' || optionId === 'run' || optionId === 'approve') && decidedMessageId) {
        const decidedMsg = await prisma.agentMessage.findUnique({
          where: { id: decidedMessageId, missionId: missionIdTrimmed },
          select: { payload: true },
        });
        const p = decidedMsg?.payload;
        const chainId = p && typeof p === 'object' ? (p.chainId ?? null) : null;
        const suggestionId = p && typeof p === 'object' ? (p.suggestionId ?? null) : null;
        const blockedTaskId =
          p && typeof p === 'object'
            ? (p.blockedTaskId ?? p.taskId ?? null)
            : null;
        if (optionId === 'approve' && blockedTaskId) {
          const { findMissionTaskById, setMissionTaskRunning } = await import('../lib/missionTask.js');
          const task = await findMissionTaskById(missionIdTrimmed, blockedTaskId).catch(() => null);
          if (task && (task.status === 'waiting_approval' || task.status === 'pending')) {
            const mission = await prisma.mission.findUnique({
              where: { id: missionIdTrimmed },
              select: { tenantId: true },
            });
            const tenantId = mission?.tenantId || missionIdTrimmed;
            const agentKey = (task.agentKeyRecommended || task.agentKey || 'planner').trim() || 'planner';
            const run = await createAgentRun({
              missionId: missionIdTrimmed,
              tenantId,
              agentKey,
              triggerMessageId: decidedMessageId,
              input: {
                taskId: blockedTaskId,
                intent:
                  (p && typeof p === 'object' && typeof p.intent === 'string'
                    ? p.intent
                    : task.intent) || undefined,
                chainId: (p && typeof p === 'object' && p.chainId) || task.chainId || chainId || undefined,
                suggestionId:
                  (p && typeof p === 'object' && p.suggestionId) || task.suggestionId || suggestionId || undefined,
                toolKey:
                  (p && typeof p === 'object' && typeof p.toolKey === 'string'
                    ? p.toolKey
                    : null) || undefined,
              },
            });
            await setMissionTaskRunning(blockedTaskId, run.id).catch(() => null);
            executeAgentRunInProcess(run.id).catch((err) =>
              console.warn('[agent-messages] executeAgentRunInProcess (approval re-dispatch) failed:', err?.message || err)
            );
          }
        } else if (chainId && suggestionId) {
          const { getChainPlan, advanceChainCursor } = await import('../lib/chainPlan.js');
          const { createAgentRun } = await import('../lib/agentRun.js');
          const { executeAgentRunInProcess } = await import('../lib/agentRunExecutor.js');
          const plan = await getChainPlan(missionIdTrimmed);
          const suggestion = plan?.suggestions?.find((s) => s.id === suggestionId);
          if (optionId === 'skip' && plan) {
            await advanceChainCursor(missionIdTrimmed).catch(() => {});
            const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
            maybeAutoDispatch(missionIdTrimmed, 'decision_recorded').catch((err) =>
              console.warn('[agent-messages] maybeAutoDispatch failed:', err?.message || err)
            );
          } else if (optionId === 'run' && suggestion && plan) {
            const mission = await prisma.mission.findUnique({
              where: { id: missionIdTrimmed },
              select: { tenantId: true },
            });
            const tenantId = mission?.tenantId || missionIdTrimmed;
            const run = await createAgentRun({
              missionId: missionIdTrimmed,
              tenantId,
              agentKey: suggestion.agentKey || 'planner',
              triggerMessageId: decidedMessageId,
              input: { intent: suggestion.intent || '', chainId, suggestionId },
            });
            if (suggestion.agentKey === 'research' && process.env.MISSION_RUN_INPROCESS === 'true') {
              executeAgentRunInProcess(run.id).catch((err) =>
                console.warn('[agent-messages] executeAgentRunInProcess failed:', err?.message || err)
              );
            }
            if (suggestion.agentKey === 'planner' && process.env.MISSION_PLANNER_INPROCESS === 'true') {
              executeAgentRunInProcess(run.id).catch((err) =>
                console.warn('[agent-messages] executeAgentRunInProcess failed:', err?.message || err)
              );
            }
          }
        }
      }
      const { maybeAutoDispatch } = await import('../lib/maybeAutoDispatch.js');
      maybeAutoDispatch(missionIdTrimmed, 'decision_recorded').catch((err) =>
        console.warn('[agent-messages] maybeAutoDispatch failed:', err?.message || err)
      );
      const { getChainPlan, computeChainStatus } = await import('../lib/chainPlan.js');
      const { mergeMissionContext } = await import('../lib/mission.js');
      const planAfter = await getChainPlan(missionIdTrimmed).catch(() => null);
      if (planAfter) {
        const status = await computeChainStatus(missionIdTrimmed, planAfter).catch(() => 'running');
        await mergeMissionContext(missionIdTrimmed, { chainPlan: { ...planAfter, status } }).catch(() => {});
      }
    }

    return res.status(201).json(responseBody);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent-messages/stream-token
 * Body: { missionId: string }
 * Returns short-lived streamToken for SSE. Same permission as GET /api/agent-messages.
 * Frontend must pass streamToken in GET /api/stream?key=agent-chat&missionId=...&streamToken=...
 */
router.post('/agent-messages/stream-token', requireAuth, async (req, res, next) => {
  try {
    const missionId = req.body?.missionId;
    if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'missionId is required and must be a non-empty string',
      });
    }
    const missionIdTrimmed = missionId.trim();
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission',
      });
    }
    const { streamToken, expiresIn } = issueStreamToken(missionIdTrimmed, req.user.id);
    return res.json({ ok: true, streamToken, expiresIn });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agent-messages/config
 * Query: missionId (string, required)
 * Returns { useResearchAgent: boolean, chatMode?: 'default'|'group_chat' } for the mission.
 */
router.get('/agent-messages/config', requireAuth, async (req, res, next) => {
  try {
    const missionId = req.query.missionId;
    if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'Query missionId is required',
      });
    }
    const missionIdTrimmed = missionId.trim();
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission',
      });
    }
    const [config, mission] = await Promise.all([
      prisma.agentChatConfig?.findUnique({
        where: { missionId: missionIdTrimmed },
        select: { useResearchAgent: true },
      }).catch(() => null),
      prisma.mission.findUnique({
        where: { id: missionIdTrimmed },
        select: { context: true },
      }).catch(() => null),
    ]);
    const ctx = mission?.context && typeof mission.context === 'object' ? mission.context : {};
    const chatMode = ctx.chatMode === 'group_chat' ? 'group_chat' : 'default';
    return res.json({
      missionId: missionIdTrimmed,
      useResearchAgent: config?.useResearchAgent ?? true,
      chatMode,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/agent-messages/config
 * Body: { missionId: string, useResearchAgent: boolean }
 * Upserts config for the mission.
 */
router.patch('/agent-messages/config', requireAuth, async (req, res, next) => {
  try {
    if (!prisma.agentChatConfig) {
      console.warn('[agent-messages] AgentChatConfig model not in Prisma client — run npx prisma generate and restart');
      return res.status(503).json({
        ok: false,
        code: 'CONFIG_UNAVAILABLE',
        message: 'Agent chat config is not available. Restart the server after running: npx prisma generate',
      });
    }
    const { missionId, useResearchAgent } = req.body ?? {};
    if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'Body missionId is required',
      });
    }
    const missionIdTrimmed = missionId.trim();
    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to this mission',
      });
    }
    const value = typeof useResearchAgent === 'boolean' ? useResearchAgent : true;
    const config = await prisma.agentChatConfig.upsert({
      where: { missionId: missionIdTrimmed },
      create: { missionId: missionIdTrimmed, useResearchAgent: value },
      update: { useResearchAgent: value },
      select: { missionId: true, useResearchAgent: true },
    });
    return res.json(config);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agent-messages
 * Query: missionId (string, required)
 * Returns messages where visibleToUser = true OR senderType = 'user', ordered by createdAt ASC.
 * When missionId equals an OrchestratorTask id, only the task owner (userId) may list messages; otherwise 403.
 */
router.get('/agent-messages', requireAuth, async (req, res, next) => {
  try {
    const missionId = req.query.missionId;
    if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'MISSION_ID_REQUIRED',
        message: 'Query missionId is required and must be a non-empty string',
      });
    }
    const missionIdTrimmed = missionId.trim();

    const allowed = await canAccessMission(missionIdTrimmed, req.user);
    if (!allowed) {
      if (process.env.NODE_ENV !== 'production') {
        const task = await prisma.orchestratorTask.findUnique({
          where: { id: missionIdTrimmed },
          select: { userId: true, tenantId: true },
        });
        if (task) {
          console.warn('[agent-messages] GET 403', {
            missionId: missionIdTrimmed,
            taskUserId: task.userId,
            taskTenantId: task.tenantId,
            reqUserId: req.user?.id,
            reqBusinessId: req.user?.business?.id,
          });
        }
      }
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_MISSION',
        message: 'You do not have access to messages for this mission',
      });
    }

    const messages = await prisma.agentMessage.findMany({
      where: {
        missionId: missionIdTrimmed,
        OR: [
          { visibleToUser: true },
          { senderType: 'user' },
          { senderType: 'system' }, // lifecycle / system messages (e.g. Run started/completed)
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(messages);
  } catch (err) {
    next(err);
  }
});

export { canAccessMission };
export default router;

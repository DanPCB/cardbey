/**
 * Block general_chat classification while a mission is actively running.
 * Proactive step UI actions and continuation phrases route to resume_active_mission.
 */

/** @typedef {{ actionType?: string, missionId?: string, stepId?: string | number, command?: string }} MissionStepActionPayload */

export const ACTIVE_MISSION_BLOCKING_STATUSES = new Set([
  'running',
  'executing',
  'queued',
  'in_progress',
  'awaiting_checkpoint',
  'awaiting_confirmation',
  'awaiting_input',
  'paused',
]);

/**
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isActiveMissionStatus(status) {
  const s = String(status ?? '').trim().toLowerCase();
  return s.length > 0 && ACTIVE_MISSION_BLOCKING_STATUSES.has(s);
}

/**
 * @param {string | null | undefined} message
 * @returns {boolean}
 */
export function isProactiveStepCommand(message) {
  const m = String(message ?? '').trim();
  if (!m) return false;
  if (/^run next step$/i.test(m)) return true;
  if (/^execute (the )?full proactive plan/i.test(m)) return true;
  if (/^(run|start|retry|improve results for)\s+(proactive\s+)?step\s+\d+/i.test(m)) return true;
  if (/^complete step\s+\d+$/i.test(m)) return true;
  return false;
}

/**
 * @param {string | null | undefined} message
 * @returns {boolean}
 */
export function isMissionContinuationCommand(message) {
  const m = String(message ?? '').trim().toLowerCase();
  if (!m) return false;
  if (['continue', 'resume', 'go on', 'keep going', 'next'].includes(m)) return true;
  return /^continue\b/.test(m);
}

/**
 * @param {string | null | undefined} message
 * @returns {boolean}
 */
export function isExplicitNewMissionIntent(message) {
  const m = String(message ?? '').trim().toLowerCase();
  if (!m) return false;
  if (/\b(new mission|start over|cancel mission|start fresh)\b/.test(m)) return true;
  if (/\b(create (a )?(new )?store|open (a )?(new )?shop|mini website)\b/.test(m)) return true;
  if (/\b(launch (a )?(new )?campaign|create (a )?(new )?campaign)\b/.test(m) && !isProactiveStepCommand(m)) {
    return true;
  }
  return false;
}

/**
 * @param {string | null | undefined} message
 * @returns {number | null}
 */
export function parseProactiveStepNumberFromMessage(message) {
  const m = String(message ?? '').trim();
  const match = m.match(/(?:proactive\s+)?step\s+(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {MissionStepActionPayload | null}
 */
export function readMissionStepActionFromBody(body) {
  const direct = body?.missionStepAction;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return /** @type {MissionStepActionPayload} */ (direct);
  }
  const ctx = body?.currentContext?.missionStepAction;
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    return /** @type {MissionStepActionPayload} */ (ctx);
  }
  const src = body?.intentSourceContext;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    const nested = /** @type {Record<string, unknown>} */ (src).missionStepAction;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return /** @type {MissionStepActionPayload} */ (nested);
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} classification
 * @param {{
 *   missionStatus?: string | null,
 *   missionId?: string | null,
 *   userMessage?: string | null,
 *   body?: Record<string, unknown> | null,
 * }} ctx
 * @returns {Record<string, unknown> | null | undefined}
 */
export function guardClassificationForActiveMission(classification, ctx) {
  if (!classification || typeof classification !== 'object') return classification;
  const missionId = String(ctx.missionId ?? '').trim();
  if (!missionId || !isActiveMissionStatus(ctx.missionStatus)) return classification;
  if (classification.tool !== 'general_chat' || classification.executionPath !== 'chat') {
    return classification;
  }

  const userMessage = String(ctx.userMessage ?? '').trim();
  const stepAction = readMissionStepActionFromBody(ctx.body ?? null);
  const explicitNew = isExplicitNewMissionIntent(userMessage);

  if (explicitNew) return classification;

  if (
    stepAction?.actionType === 'mission_step_action' ||
    isProactiveStepCommand(userMessage) ||
    isMissionContinuationCommand(userMessage)
  ) {
    const stepId =
      stepAction?.stepId != null
        ? stepAction.stepId
        : parseProactiveStepNumberFromMessage(userMessage);
    return {
      ...classification,
      executionPath: 'resume_active_mission',
      tool: 'resume_active_mission',
      confidence: 0.99,
      parameters: {
        missionId,
        ...(stepId != null ? { stepId } : {}),
        command:
          stepAction?.command ??
          (isMissionContinuationCommand(userMessage) ? 'continue' : 'run_step'),
        ...(userMessage ? { userInput: userMessage } : {}),
      },
      message: undefined,
    };
  }

  return {
    ...classification,
    executionPath: 'clarify',
    tool: 'resume_active_mission',
    confidence: 0.85,
    message:
      'Do you want to apply this to the current mission or start a new mission?',
    clarifyOptions: [
      {
        label: 'Apply to current mission',
        tool: 'resume_active_mission',
        parameters: { missionId, command: 'apply_input', userInput: userMessage },
      },
      {
        label: 'Start a new mission',
        tool: 'general_chat',
        parameters: { forceNewMission: true },
      },
    ],
  };
}

/**
 * @param {string | null | undefined} missionStatus
 * @param {string | null | undefined} userMessage
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {boolean}
 */
export function shouldSkipAgentLoopForActiveMission(missionStatus, userMessage, body) {
  if (!isActiveMissionStatus(missionStatus)) return false;
  const stepAction = readMissionStepActionFromBody(body ?? null);
  if (stepAction?.actionType === 'mission_step_action') return true;
  return isProactiveStepCommand(userMessage) || isMissionContinuationCommand(userMessage);
}

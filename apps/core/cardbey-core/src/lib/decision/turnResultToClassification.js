/**
 * Map TurnResult → intake-compatible classification (Phase 3).
 */

import { getToolEntry } from '../intake/intakeToolRegistry.js';

/**
 * @param {import('./decideTurn.js').TurnResult} turnResult
 * @returns {Record<string, unknown>}
 */
export function turnResultToClassification(turnResult) {
  const chosen = turnResult.chosen;
  const toolName = turnResult.tool?.name ?? 'general_chat';
  const toolEntry = getToolEntry(toolName);
  const confidence = chosen?.score ?? 0.7;

  const parameters =
    turnResult.tool?.parameters && typeof turnResult.tool.parameters === 'object'
      ? { ...turnResult.tool.parameters }
      : {};

  if (turnResult.governance?.requiresConfirmation) {
    parameters._autoSubmit = false;
  }

  /** @type {Record<string, unknown>} */
  const base = {
    tool: toolName,
    confidence,
    parameters,
    message: turnResult.rationale,
    _decisionLoop: true,
    _decisionNextStep: turnResult.nextStep,
    _reasoning: {
      intent: chosen?.intent ?? null,
      confidence,
      advisors: chosen?.advisorIds ?? [],
      rationale: turnResult.rationale,
    },
  };

  switch (turnResult.nextStep) {
    case 'present_options':
      return {
        ...base,
        executionPath: 'clarify',
        tool: toolName,
        clarifyOptions: (turnResult.options ?? []).map((opt) => ({
          label: opt.label,
          tool: opt.tool ?? toolName,
          parameters: opt.parameters ?? {},
        })),
      };

    case 'clarify':
    case 'guide_auth':
      return {
        ...base,
        executionPath: 'clarify',
        tool: turnResult.nextStep === 'guide_auth' ? 'general_chat' : toolName,
      };

    case 'checkpoint':
      return {
        ...base,
        executionPath: toolEntry?.executionPath ?? 'proactive_plan',
        parameters: { ...parameters, _autoSubmit: false },
      };

    case 'continue_workflow':
      return {
        ...base,
        executionPath: 'resume_active_mission',
        tool: 'general_chat',
        parameters: {
          ...parameters,
          missionId: turnResult.belief.anchors.missionId,
          command: 'continue',
        },
      };

    case 'chat':
      return {
        ...base,
        executionPath: 'chat',
        tool: 'general_chat',
      };

    case 'execute':
    default:
      return {
        ...base,
        executionPath: toolEntry?.executionPath ?? 'direct_action',
      };
  }
}

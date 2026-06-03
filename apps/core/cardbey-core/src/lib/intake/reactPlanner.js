/**
 * Cardbey ReAct Planner — Phase 1 (decision-only, pure module).
 *
 * Hard constraints:
 * - No DB calls (hydration happens in memoryHydrator before invoke)
 * - No route wiring
 * - No toolDispatcher / mission runtime imports
 * - Fully testable with mock toolRegistry + mock context
 */

/**
 * @typedef {{
 *   toolName: string;
 *   approvalRequired?: boolean;
 *   riskLevel?: 'safe_read'|'state_change'|'destructive'|string;
 *   parameterSchema?: { required?: string[], properties?: Record<string, { type?: string }> };
 * }} ReactPlannerToolDef
 */

/**
 * @typedef {{
 *   userMessage?: string;
 *   classification?: { tool?: string | null } | null;
 *   context?: { storeId?: string | null; hydratedContext?: import('../memory/memoryHydrator.js').HydratedContext } | null;
 *   hydratedContext?: import('../memory/memoryHydrator.js').HydratedContext | null;
 *   toolRegistry: ReactPlannerToolDef[];
 * }} ReactPlannerInput
 */

/**
 * @typedef {{
 *   kind: 'ask';
 *   prompt: string;
 *   missing: string[];
 *   toolName?: string;
 * }} AskDecision
 */

/**
 * @typedef {{
 *   kind: 'confirm';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 *   confirmation: { title: string; summary: string; riskLevel: 'state_change'|'destructive' };
 * }} ConfirmDecision
 */

/**
 * @typedef {{
 *   kind: 'execute';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 * }} ExecuteDecision
 */

/**
 * @typedef {{
 *   kind: 'unsupported';
 *   reason: 'no_matching_tool';
 *   userMessage: string;
 * }} UnsupportedDecision
 */

/**
 * @typedef {{
 *   kind: 'self_patch';
 *   errorMessage: string;
 *   stackTrace?: string;
 *   context?: string;
 * }} SelfPatchDecision
 */

/**
 * @typedef {{
 *   kind: 'control_tower_query';
 * }} ControlTowerQueryDecision
 */

/**
 * @typedef {{
 *   kind: 'i18n_sync';
 *   mode?: 'check' | 'sync';
 * }} I18nSyncDecision
 *
 * @typedef {AskDecision | ConfirmDecision | ExecuteDecision | UnsupportedDecision | SelfPatchDecision | ControlTowerQueryDecision | I18nSyncDecision} ReactPlannerDecision
 */

import {
  isMaintenanceIntent,
  isI18nMaintenanceIntent,
  getI18nSyncMode,
} from './maintenanceIntent.js';
import { buildResolutionAskFromErrors } from '../memory/plannerResolutionPrompt.js';
import { createEmptyHydratedContext } from '../memory/memoryHydrator.js';

function asTrimmedString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function getTool(toolRegistry, toolName) {
  const t = asTrimmedString(toolName);
  if (!t) return null;
  return (Array.isArray(toolRegistry) ? toolRegistry : []).find((x) => x && x.toolName === t) ?? null;
}

function requiredParamKeys(toolDef) {
  const req = toolDef?.parameterSchema?.required;
  return Array.isArray(req) ? req.filter((x) => typeof x === 'string' && x.trim()) : [];
}

function extractPlatformFromMessage(lower) {
  const s = String(lower || '');
  if (s.includes('facebook')) return 'facebook';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('zalo')) return 'zalo';
  if (s.includes('twitter') || s.includes('x.com')) return 'twitter';
  if (s.includes('tiktok')) return 'tiktok';
  return '';
}

function classifyToolHint(input) {
  const hint = input?.classification && typeof input.classification === 'object' ? input.classification.tool : null;
  return asTrimmedString(hint);
}

/**
 * Normalize legacy { userMessage, context } and new { hydratedContext } inputs.
 * @param {ReactPlannerInput} input
 */
function normalizePlannerInput(input) {
  if (input?.hydratedContext && typeof input.hydratedContext === 'object') {
    return {
      userMessage: asTrimmedString(input.hydratedContext.message ?? input.userMessage),
      classification: input.classification ?? null,
      context: input.context && typeof input.context === 'object' ? input.context : {},
      hydratedContext: input.hydratedContext,
      toolRegistry: Array.isArray(input.toolRegistry) ? input.toolRegistry : [],
    };
  }

  if (input?.message && !input?.userMessage && input?.hydratedContext) {
    return normalizePlannerInput({
      ...input,
      userMessage: input.message,
    });
  }

  if (input?.userMessage && !input?.hydratedContext) {
    const ctx = input.context && typeof input.context === 'object' ? input.context : {};
    const hydrated =
      ctx.hydratedContext && typeof ctx.hydratedContext === 'object'
        ? ctx.hydratedContext
        : createEmptyHydratedContext(input.userMessage, {
            userId: ctx.userId ?? null,
            missionId: ctx.missionId ?? null,
          });
    if (ctx.storeId && !hydrated.entities?.store) {
      hydrated.entities = {
        ...hydrated.entities,
        store: { id: String(ctx.storeId), name: '', slug: null },
      };
    }
    return {
      userMessage: asTrimmedString(input.userMessage),
      classification: input.classification ?? null,
      context: ctx,
      hydratedContext: hydrated,
      toolRegistry: Array.isArray(input.toolRegistry) ? input.toolRegistry : [],
    };
  }

  return {
    userMessage: asTrimmedString(input?.userMessage),
    classification: input?.classification ?? null,
    context: input?.context && typeof input.context === 'object' ? input.context : {},
    hydratedContext: createEmptyHydratedContext(input?.userMessage ?? ''),
    toolRegistry: Array.isArray(input?.toolRegistry) ? input.toolRegistry : [],
  };
}

/**
 * Decide ask/confirm/execute/unsupported.
 * @param {ReactPlannerInput} input
 * @returns {Promise<ReactPlannerDecision>}
 */
export async function reactPlanner(input) {
  const normalized = normalizePlannerInput(input);
  const userMessage = normalized.userMessage;
  const toolRegistry = normalized.toolRegistry;
  const context = normalized.context;
  const hydratedContext = normalized.hydratedContext;

  const storeId =
    asTrimmedString(hydratedContext?.entities?.store?.id) ||
    asTrimmedString(context?.storeId) ||
    asTrimmedString(hydratedContext?.working?.activeMission?.storeId) ||
    '';

  if (context?.operatorSession === true && isI18nMaintenanceIntent(userMessage)) {
    return {
      kind: 'i18n_sync',
      mode: getI18nSyncMode(userMessage),
    };
  }

  if (context?.operatorSession === true && isMaintenanceIntent(userMessage)) {
    const lower = String(userMessage || '').toLowerCase();
    const isHealthCheck = [
      'what is failing',
      'show me the blockers',
      'what needs fixing',
      'system health',
      'deployment status',
      'control tower',
      'what is broken',
      'overall status',
      'health check',
      'run a health check',
    ].some((p) => lower.includes(p));

    if (isHealthCheck) {
      return { kind: 'control_tower_query' };
    }

    return {
      kind: 'self_patch',
      errorMessage: userMessage,
      stackTrace: context.lastKnownError?.stackTrace ?? '',
      context: context.lastKnownError?.message ?? '',
    };
  }

  const resolutionAsk = buildResolutionAskFromErrors(hydratedContext?.resolution?.errors ?? []);
  if (resolutionAsk) {
    return {
      kind: 'ask',
      prompt: resolutionAsk.prompt,
      missing: resolutionAsk.missing,
    };
  }

  const msgLower = String(userMessage || '').toLowerCase();
  const looksDelete = /\bdelete\b|\bremove\b/.test(msgLower) && (msgLower.includes('menu') || msgLower.includes('item'));
  if (looksDelete) {
    return {
      kind: 'ask',
      prompt: 'Which 3 items should I delete? Please name them (or share their item IDs).',
      missing: ['itemIds'],
    };
  }

  const hintedTool = classifyToolHint(normalized);
  const hintedDef = hintedTool ? getTool(toolRegistry, hintedTool) : null;

  const wantsSlideshow = msgLower.includes('slideshow');
  const slideshowDef = wantsSlideshow ? getTool(toolRegistry, 'generate_slideshow') : null;

  const toolDef = hintedDef || slideshowDef;
  const toolName = toolDef?.toolName ?? '';

  if (!toolDef) {
    const generalChatDef = getTool(toolRegistry, 'general_chat');
    const looksMetaQuestion =
      msgLower.includes('what can you do') ||
      msgLower.includes('how do i') ||
      msgLower.includes('how to') ||
      msgLower.endsWith('?');
    if (generalChatDef && looksMetaQuestion) {
      return { kind: 'execute', toolName: 'general_chat', parameters: {} };
    }

    return { kind: 'unsupported', reason: 'no_matching_tool', userMessage };
  }

  const missing = [];

  const parameters = {};
  if (storeId) parameters.storeId = storeId;

  if (toolName === 'connect_social_account') {
    const p = extractPlatformFromMessage(msgLower);
    if (p) parameters.platform = p;
  }

  for (const key of requiredParamKeys(toolDef)) {
    if (key === 'storeId') {
      if (!storeId) missing.push('storeId');
      continue;
    }
    const v = parameters[key];
    if (v === null || v === undefined || v === '') missing.push(key);
  }

  if (missing.length > 0) {
    if (missing.includes('storeId') && hydratedContext?.resolution?.errors?.length) {
      const retryAsk = buildResolutionAskFromErrors(hydratedContext.resolution.errors);
      if (retryAsk) {
        return { kind: 'ask', prompt: retryAsk.prompt, missing: retryAsk.missing, ...(toolName ? { toolName } : {}) };
      }
    }

    const prompt = looksDelete
      ? 'Which 3 items should I delete? Please name them (or share their item IDs).'
      : missing.includes('storeId')
        ? storeId
          ? 'Which store should I use? Please confirm the store for this action.'
          : (() => {
              const stores = hydratedContext?.resolution?.errors?.find((e) => e.entityType === 'store');
              if (stores?.reason === 'AMBIGUOUS' && stores.candidates?.length) {
                return `Which store should I use? Options: ${stores.candidates.map((c) => c.name).join(', ')}.`;
              }
              return 'I need a store for this action. Tell me the store name or create/select one first.';
            })()
        : missing.includes('platform')
          ? 'Which platform should I connect? (e.g. Facebook, Instagram, Zalo)'
          : 'What information is missing to continue?';
    return { kind: 'ask', prompt, missing, ...(toolName ? { toolName } : {}) };
  }

  const riskRaw = asTrimmedString(toolDef?.riskLevel ?? '');
  const riskLevel = riskRaw === 'destructive' ? 'destructive' : 'state_change';
  const needsConfirm = Boolean(toolDef?.approvalRequired) || riskRaw === 'state_change' || riskRaw === 'destructive';

  if (needsConfirm) {
    return {
      kind: 'confirm',
      toolName,
      parameters,
      confirmation: {
        title: `Confirm: ${toolName}`,
        summary: `This action may modify store data. Proceed to run "${toolName}"?`,
        riskLevel,
      },
    };
  }

  return { kind: 'execute', toolName, parameters };
}

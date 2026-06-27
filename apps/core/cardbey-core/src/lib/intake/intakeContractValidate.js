/**
 * Contract validation after classification, before execution.
 */

import {
  getToolEntry,
  isRegisteredTool,
  EXECUTION_PATHS,
  validateToolParameters,
} from './intakeToolRegistry.js';
import { stripCreateStoreIntakeMetadataFromParameters } from './createStoreIntakeMetadata.js';
import { normalizePlannerToolName } from '../planner/plannerToolNormalization.js';

/** Tools that may run without an active store/mission surface (confirm + dispatch). */
export const CONTEXT_FREE_TOOLS = new Set([
  'general_chat',
  'create_store',
  'device.sendInput',
  'service_request',
  'code_fix',
  'ingest_asset_for_intent_detection',
]);

/** Params merged by intake confirm/dispatch; not part of tool JSON schema for context-free tools. */
const RUNTIME_CONTEXT_PARAM_KEYS = new Set([
  'storeId',
  'missionId',
  'tenantId',
  'deviceId',
  'pipelineId',
  'stepId',
]);

/**
 * @param {string} tool
 * @returns {boolean}
 */
export function isContextFreeTool(tool) {
  const name = String(tool ?? '').trim();
  if (!name) return false;
  if (CONTEXT_FREE_TOOLS.has(name)) return true;
  const entry = getToolEntry(name);
  return entry ? !entry.requiresStore : false;
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} parameters
 * @returns {Record<string, unknown>}
 */
export function stripRuntimeContextParams(tool, parameters) {
  if (!isContextFreeTool(tool)) return parameters;
  const input =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? { ...parameters } : {};
  for (const key of RUNTIME_CONTEXT_PARAM_KEYS) {
    if (key in input) delete input[key];
  }
  return input;
}

/**
 * Map classifier / legacy aliases onto create_store registry keys (storeName, location, storeType, intentMode, _autoSubmit).
 * Removes unknown keys that would fail strict direct_action validation (e.g. LLM returns "name").
 *
 * @param {Record<string, unknown>} parameters
 * @returns {Record<string, unknown>}
 */
export function normalizeCreateStoreToolParameters(parameters) {
  const p =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? { ...parameters } : {};
  const storeNameSrc = p.storeName ?? p.name ?? p.businessName;
  if (storeNameSrc != null && String(storeNameSrc).trim()) {
    p.storeName = String(storeNameSrc).trim();
  }
  const storeTypeSrc = p.storeType ?? p.category ?? p.businessType ?? p.type;
  if (storeTypeSrc != null && String(storeTypeSrc).trim()) {
    p.storeType = String(storeTypeSrc).trim();
  }
  const locSrc = p.location ?? p.city ?? p.address ?? p.region;
  if (locSrc != null && String(locSrc).trim()) {
    p.location = String(locSrc).trim();
  }
  return stripCreateStoreIntakeMetadataFromParameters(p);
}

/**
 * Merge UI-structured create-store form (guarded path) over classifier parameters.
 *
 * @param {Record<string, unknown>} parameters
 * @param {Record<string, unknown>|null|undefined} form
 * @returns {Record<string, unknown>}
 */
export function mergeStoreCreateFormIntoParameters(parameters, form) {
  const base =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? { ...parameters } : {};
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return base;
  }
  const sn = form.storeName ?? form.businessName;
  const st = form.storeType ?? form.businessType ?? form.category;
  const loc = form.location;
  const im = form.intentMode;
  const out = { ...base };
  if (sn != null && String(sn).trim()) out.storeName = String(sn).trim();
  if (st != null && String(st).trim()) out.storeType = String(st).trim();
  if (loc != null && String(loc).trim()) out.location = String(loc).trim();
  if (im === 'website' || im === 'store') out.intentMode = im;
  return out;
}

/**
 * @param {object} classification
 * @param {string} classification.executionPath
 * @param {string} classification.tool
 * @param {Record<string, unknown>} classification.parameters
 * @param {Array<{ tool: string, parameters?: object }>} [classification.plan]
 * @param {string | null} storeId
 * @param {{ missionId?: string | null, draftId?: string | null }} [opts]
 *   — missionId: mission-scoped post-build tools without active surface storeId.
 *   — draftId: draft-scoped catalog/asset tools when only a draft store exists.
 * @returns {{ ok: boolean, cleanedParameters?: Record<string, unknown>, errors?: Array<{ field: string, reason: string }>, downgradedTo?: 'chat'|'clarify' }}
 */
export function validateIntakeClassification(classification, storeId, opts = {}) {
  const path = String(classification?.executionPath ?? '');
  const tool = String(classification?.tool ?? '');
  let parameters =
    classification?.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};
  if (tool === 'create_store') {
    parameters = normalizeCreateStoreToolParameters(parameters);
  }
  parameters = stripRuntimeContextParams(tool, parameters);

  if (!EXECUTION_PATHS.has(path)) {
    return {
      ok: false,
      errors: [{ field: 'executionPath', reason: 'unknown_execution_path' }],
      downgradedTo: 'clarify',
    };
  }

  if (path === 'chat' || path === 'clarify' || path === 'service_request') {
    if (path === 'service_request' && tool !== 'service_request') {
      return {
        ok: false,
        errors: [{ field: 'tool', reason: 'service_request_path_requires_service_request_tool' }],
        downgradedTo: 'clarify',
      };
    }
    return { ok: true, cleanedParameters: parameters, errors: [] };
  }

  if (!isRegisteredTool(tool)) {
    return {
      ok: false,
      errors: [{ field: 'tool', reason: 'unknown_tool' }],
      downgradedTo: 'clarify',
    };
  }

  const entry = getToolEntry(tool);
  if (!entry) {
    return {
      ok: false,
      errors: [{ field: 'tool', reason: 'unknown_tool' }],
      downgradedTo: 'clarify',
    };
  }

  if (entry.executionPath !== path) {
    return {
      ok: false,
      errors: [
        {
          field: 'executionPath',
          reason: `tool_requires_${entry.executionPath}`,
        },
      ],
      downgradedTo: 'clarify',
    };
  }

  const missionScopedStoreTools = new Set([
    'upload_store_asset',
    'replace_store_catalog',
    'update_store_hero',
    'publish_store',
  ]);
  const draftScopedStoreTools = new Set(['upload_store_asset', 'replace_store_catalog', 'update_store_hero']);
  const scopeMissionId =
    opts && typeof opts.missionId === 'string' && opts.missionId.trim() ? opts.missionId.trim() : '';
  const scopeDraftId =
    opts && typeof opts.draftId === 'string' && opts.draftId.trim() ? opts.draftId.trim() : '';
  const hasScopedStoreContext =
    (missionScopedStoreTools.has(tool) && scopeMissionId) ||
    (draftScopedStoreTools.has(tool) && scopeDraftId);
  if (entry.requiresStore && !storeId && !hasScopedStoreContext) {
    return {
      ok: false,
      errors: [{ field: 'storeId', reason: 'requires_store' }],
      downgradedTo: 'chat',
    };
  }

  const strict = path === 'direct_action' || path === 'proactive_plan';
  const paramRes = validateToolParameters(tool, parameters, { strictUnknownKeys: strict });
  if (!paramRes.ok) {
    return {
      ok: false,
      errors: paramRes.errors,
      downgradedTo: 'clarify',
    };
  }

  if (path === 'proactive_plan' && Array.isArray(classification.plan) && tool !== 'create_store') {
    for (let i = 0; i < classification.plan.length; i++) {
      const step = classification.plan[i];
      const rawSt =
        step && typeof step === 'object' ? String(step.tool || step.recommendedTool || '').trim() : '';
      const st = normalizePlannerToolName(rawSt) || rawSt;
      if (!st || !isRegisteredTool(st)) {
        return {
          ok: false,
          errors: [{ field: `plan[${i}].tool`, reason: 'unknown_or_invalid_plan_tool' }],
          downgradedTo: 'clarify',
        };
      }
      const stepParams =
        step.parameters && typeof step.parameters === 'object' && !Array.isArray(step.parameters)
          ? step.parameters
          : {};
      const sr = validateToolParameters(st, stepParams, { strictUnknownKeys: true });
      if (!sr.ok) {
        return {
          ok: false,
          errors: sr.errors.map((e) => ({ field: `plan[${i}].${e.field}`, reason: e.reason })),
          downgradedTo: 'clarify',
        };
      }
    }
  }

  return { ok: true, cleanedParameters: paramRes.cleaned, errors: [] };
}

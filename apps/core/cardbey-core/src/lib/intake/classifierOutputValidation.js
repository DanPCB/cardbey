/**
 * Post-classifier validation — allowlist gate, domain correction, clarify fallback.
 */

import {
  PROACTIVE_RUNWAY_TOOL_SET,
  resolveRunwayDispatchToolName,
} from '../missionPlan/proactiveRunwayToolAllowlist.js';
import { getToolEntry } from './intakeToolRegistry.js';
import { DOMAINS, getDomainForIntent, getToolsForDomain, isToolInDomain } from './intentDomains.js';

/** Tools allowed for intake dispatch but not on the proactive runway set. */
const INTAKE_DISPATCH_ALLOWLIST = new Set([
  'general_chat',
  'service_request',
  'ingest_document',
  'ingest_asset_for_intent_detection',
  'scan_document',
  'orders_report',
  'analyze_content',
  'canvas.loadTemplate',
  'canvas.applyBrandAsset',
  'canvas.exportToSuitcase',
]);

const INGEST_TOOLS = new Set([
  'ingest_document',
  'scan_document',
  'ingest_asset_for_intent_detection',
]);

/**
 * @param {string} tool
 * @param {string} [executionPath]
 * @returns {boolean}
 */
export function isClassifierToolDispatchable(tool, executionPath) {
  const t = String(tool ?? '').trim();
  if (!t) return false;
  if (executionPath === 'clarify') return true;
  if (t === 'general_chat') return true;
  if (executionPath === 'service_request' && t === 'service_request') return true;
  if (INTAKE_DISPATCH_ALLOWLIST.has(t)) return true;
  const canonical = resolveRunwayDispatchToolName(t);
  return PROACTIVE_RUNWAY_TOOL_SET.has(canonical) || PROACTIVE_RUNWAY_TOOL_SET.has(t);
}

/**
 * @param {string} text
 * @param {number} [limit]
 * @returns {Array<{ label: string, tool: string, parameters: Record<string, unknown> }>}
 */
export function buildClarifyAlternatives(text, limit = 2) {
  const domain = getDomainForIntent(text);
  const tools = getToolsForDomain(domain).filter((tool) => isClassifierToolDispatchable(tool));
  const domainName = DOMAINS[domain]?.name ?? domain.toLowerCase();

  return tools.slice(0, limit).map((tool) => {
    const entry = getToolEntry(tool);
    return {
      label: entry?.label ?? tool.replace(/_/g, ' '),
      tool,
      parameters: {},
    };
  }).concat(
    tools.length === 0
      ? [{ label: 'Chat with Performer', tool: 'general_chat', parameters: {} }]
      : [],
  ).slice(0, limit);
}

/**
 * Apply domain-aware corrections for known misroutes (graphic vs ingest, loyalty).
 * @param {object} intent
 * @param {string} text
 * @param {string | null | undefined} storeId
 * @returns {object}
 */
export function applyDomainCorrection(intent, text, storeId) {
  const domain = getDomainForIntent(text);
  const tool = String(intent?.tool ?? '').trim();
  const canonical = resolveRunwayDispatchToolName(tool);

  const withMeta = { ...intent, _domain: DOMAINS[domain]?.name ?? domain.toLowerCase() };

  if (!tool || isToolInDomain(tool, domain) || isToolInDomain(canonical, domain)) {
    return withMeta;
  }

  if (domain === 'DESIGN' && INGEST_TOOLS.has(tool)) {
    const replacement = storeId ? 'create_promotion_graphic' : 'smart_visual';
    const entry = getToolEntry(replacement);
    return {
      ...withMeta,
      tool: replacement,
      executionPath: entry?.executionPath ?? intent.executionPath ?? 'proactive_plan',
      confidence: Math.max(typeof intent.confidence === 'number' ? intent.confidence : 0.5, 0.85),
      _domainCorrected: true,
      _downgradedReason: 'domain_correction_graphic',
      _classificationSource: intent._classificationSource ?? intent._fastPath ?? 'domain_correction',
    };
  }

  if (domain === 'LOYALTY' && tool !== 'setup_loyalty_program') {
    const entry = getToolEntry('setup_loyalty_program');
    return {
      ...withMeta,
      tool: 'setup_loyalty_program',
      executionPath: entry?.executionPath ?? 'proactive_plan',
      confidence: Math.max(typeof intent.confidence === 'number' ? intent.confidence : 0.5, 0.9),
      parameters: {
        ...(intent.parameters && typeof intent.parameters === 'object' ? intent.parameters : {}),
        ...(storeId ? { storeId } : {}),
      },
      _domainCorrected: true,
      _downgradedReason: 'domain_correction_loyalty',
      _classificationSource: intent._classificationSource ?? intent._fastPath ?? 'domain_correction',
    };
  }

  return { ...withMeta, _domainMismatch: true };
}

/**
 * Validate classifier output; downgrade to clarify when tool is not dispatchable.
 * @param {object} intent
 * @param {{ userMessage?: string, storeId?: string | null }} [ctx]
 * @returns {object}
 */
export function validateClassifierOutput(intent, ctx = {}) {
  const text = String(ctx.userMessage ?? '').trim();
  const executionPath = String(intent?.executionPath ?? '');
  const tool = String(intent?.tool ?? '').trim();

  if (executionPath === 'clarify') {
    return intent;
  }

  if (!tool) {
    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence: 0,
      parameters: {},
      message: intent?.message || 'I had trouble picking a tool — what would you like to do?',
      clarifyOptions: buildClarifyAlternatives(text),
      _downgraded: true,
      _downgradedReason: 'missing_tool',
    };
  }

  if (!isClassifierToolDispatchable(tool, executionPath)) {
    const alternatives = buildClarifyAlternatives(text);
    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence: typeof intent.confidence === 'number' ? Math.min(intent.confidence, 0.5) : 0.4,
      parameters: {},
      message:
        intent?.message ||
        `I can help with that, but "${tool}" is not available on the runway yet. Pick an option:`,
      clarifyOptions: alternatives.length ? alternatives : undefined,
      _downgraded: true,
      _downgradedReason: `allowlist_reject:${tool}`,
      _rejectedTool: tool,
      _classificationSource: intent._classificationSource ?? intent._fastPath ?? 'validation',
    };
  }

  return intent;
}

/**
 * Bridge classifyIntent output → reactPlanner ask/confirm/execute decisions.
 * P1 consolidation: single post-classify reasoning layer for missing context.
 */

import { INTAKE_TOOL_REGISTRY } from './intakeToolRegistry.js';
import { reactPlanner } from './reactPlanner.js';
import { isReactPlannerPostClassifyEnabled } from './intakeConsolidationFlags.js';

let cachedRegistry = null;

/**
 * @returns {import('./reactPlanner.js').ReactPlannerToolDef[]}
 */
export function buildIntakeReactPlannerRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = INTAKE_TOOL_REGISTRY.map((t) => {
    const required = new Set([
      ...(Array.isArray(t.requiredParams) ? t.requiredParams : []),
      ...(t.requiresStore ? ['storeId'] : []),
    ]);
    return {
      toolName: t.toolName,
      approvalRequired: Boolean(t.approvalRequired),
      riskLevel: t.riskLevel,
      parameterSchema: {
        required: [...required],
        properties: t.parameterSchema?.properties ?? {},
      },
    };
  });
  return cachedRegistry;
}

/**
 * @param {object} input
 * @param {string} input.userMessage
 * @param {object} input.classification
 * @param {object} [input.context]
 * @param {import('../memory/memoryHydrator.js').HydratedContext} [input.hydratedContext]
 * @returns {Promise<import('./reactPlanner.js').ReactPlannerDecision | null>}
 */
export async function runPostClassifyReactPlanner(input) {
  const classification = input?.classification;
  const executionPath = String(classification?.executionPath ?? '');
  if (!classification?.tool || executionPath === 'clarify' || executionPath === 'chat' || executionPath === 'service_request') {
    return null;
  }

  if (!isReactPlannerPostClassifyEnabled()) {
    return null;
  }

  const classifiedTool = String(classification?.tool ?? '').trim();
  if (classifiedTool === 'create_store') {
    return null;
  }

  // Campaign kernel dispatch handles store context + compiler/checkpoint — skip entity-resolution asks.
  if (
    executionPath === 'kernel_dispatch' &&
    (classifiedTool === 'create_campaign' || classifiedTool === 'launch_campaign')
  ) {
    return null;
  }

  return reactPlanner({
    userMessage: input.userMessage,
    classification,
    context: input.context ?? {},
    hydratedContext: input.hydratedContext ?? null,
    toolRegistry: buildIntakeReactPlannerRegistry(),
  });
}

/**
 * @param {import('./reactPlanner.js').ReactPlannerDecision | null | undefined} decision
 * @returns {boolean}
 */
export function isReactPlannerAskDecision(decision) {
  return Boolean(decision && decision.kind === 'ask');
}

/**
 * @param {import('./reactPlanner.js').ReactPlannerDecision | null | undefined} decision
 * @returns {boolean}
 */
export function isReactPlannerConfirmDecision(decision) {
  return Boolean(decision && decision.kind === 'confirm');
}

/**
 * @param {object} classification
 * @param {import('./reactPlanner.js').ReactPlannerDecision} decision
 * @returns {Record<string, unknown>}
 */
export function mergePlannerParameters(classification, decision) {
  const fromClassification =
    classification?.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};
  const fromPlanner =
    decision?.parameters && typeof decision.parameters === 'object' && !Array.isArray(decision.parameters)
      ? decision.parameters
      : {};
  return { ...fromClassification, ...fromPlanner };
}

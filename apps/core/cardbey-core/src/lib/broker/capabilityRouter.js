/**
 * Broker capability router — intent/capability → actionId + routing metadata.
 * Wraps existing capability resolvers; does not auto-execute fallbacks.
 */

import { resolveCapabilityExecutionPlan } from '../capabilities/capabilityResolver.js';
import { getBrokerActionForTool } from './actionRegistry.js';
import { actionIdForTool } from './executionTelemetry.js';

/**
 * @typedef {object} BrokerRoutePlan
 * @property {string} actionId
 * @property {string|null} selectedTool
 * @property {string} routingStrategy
 * @property {string|null} capabilityFamily
 * @property {string} userMessage
 * @property {string|null} unavailableReason
 * @property {object} capabilityPlan
 */

/**
 * @param {{
 *   capability?: string;
 *   requestedTool: string;
 *   userMessage?: string;
 *   locale?: string;
 *   context?: Record<string, unknown>;
 *   activeMission?: Record<string, unknown>|null;
 *   activeStore?: Record<string, unknown>|null;
 * }} input
 * @returns {BrokerRoutePlan}
 */
export function routeCapabilityToAction(input) {
  const requestedTool =
    typeof input?.requestedTool === 'string' ? input.requestedTool.trim() : '';
  const capability =
    typeof input?.capability === 'string' && input.capability.trim()
      ? input.capability.trim()
      : 'unknown';

  const capabilityPlan = resolveCapabilityExecutionPlan({
    capability,
    requestedTool,
    userMessage: input?.userMessage,
    locale: input?.locale,
    context: input?.context,
    activeMission: input?.activeMission ?? null,
    activeStore: input?.activeStore ?? null,
  });

  const selectedTool = capabilityPlan.selectedTool ?? requestedTool;
  const actionId = selectedTool ? actionIdForTool(selectedTool) : actionIdForTool(requestedTool);
  const brokerAction = selectedTool ? getBrokerActionForTool(selectedTool) : getBrokerActionForTool(requestedTool);

  return {
    actionId,
    selectedTool: selectedTool || null,
    routingStrategy: capabilityPlan.selectedStrategy,
    capabilityFamily: brokerAction?.capabilityFamily ?? capability,
    userMessage: capabilityPlan.userMessage,
    unavailableReason: capabilityPlan.unavailableReason,
    capabilityPlan,
  };
}

/**
 * @param {string} toolName
 * @returns {BrokerRoutePlan}
 */
export function routeToolToAction(toolName) {
  return routeCapabilityToAction({
    capability: 'unknown',
    requestedTool: toolName,
  });
}

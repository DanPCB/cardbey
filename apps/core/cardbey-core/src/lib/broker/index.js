/**
 * Agent Execution Broker — Phase 1 public API.
 */

export {
  isBrokerExecutionTelemetryEnabled,
  isBrokerDirectViaFacadeEnabled,
  isBrokerBlockDirectActionEnabled,
  isBrokerBlockOrchestraWithMissionEnabled,
  isBrokerTelemetryRequired,
} from './brokerFlags.js';

export {
  actionIdForTool,
  recordExecutionTelemetry,
  withExecutionTelemetry,
} from './executionTelemetry.js';

export {
  listBrokerActions,
  getBrokerAction,
  getBrokerActionForTool,
  getActionRegistryMap,
  resetActionRegistryCache,
} from './actionRegistry.js';

export {
  listAgentCapabilities,
  getAgentCapability,
  findAgentCapabilitiesForAction,
  resetAgentCapabilityCache,
} from './agentCapabilityAdapter.js';

export { routeCapabilityToAction, routeToolToAction } from './capabilityRouter.js';

export {
  guardBrokerDirectAction,
  guardBrokerOrchestraStart,
  extractMissionIdFromRequestBody,
} from './brokerRunwayGuard.js';

export {
  isPhaseFBypassTelemetryEnabled,
  isPhaseFBlockMcpDirectDispatchEnabled,
  isPhaseFRouteMcpViaFacadeEnabled,
  isPhaseFBlockProactiveStepLegacyEnabled,
  isPhaseFBlockDraftStoreRunwayEnabled,
} from './phaseFBypassFlags.js';

export {
  guardPhaseFOrchestraStart,
  guardPhaseFMcpDispatch,
  guardPhaseFProactiveStepLegacy,
  guardPhaseFDraftStoreRunway,
  extractMissionIdFromDraftRequest,
} from './phaseFBypassGuards.js';

export {
  getPhaseFBypassSnapshot,
  getPhaseFBypassMetrics,
  recordPhaseFBypass,
} from './phaseFBypassStaging.js';

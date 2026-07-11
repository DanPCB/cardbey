/**
 * Multi-agent monitoring — public exports and bootstrap.
 */

export * from './types/metrics.types.js';
export * from './types/alert.types.js';
export { multiAgentMetricsStore } from './dashboard/metricsStore.js';
export {
  buildAgentHealthDetails,
  getMultiAgentConfigHealth,
  MONITORED_AGENTS,
} from './dashboard/agentHealth.js';
export { DEFAULT_ALERT_RULES, buildDefaultAlertRules } from './alerts/alert.rules.js';
export {
  AlertManager,
  initMultiAgentMonitoring,
  getMultiAgentAlertManager,
  getMultiAgentMetricsStore,
  resetMultiAgentMonitoringForTests,
} from './alerts/alert.manager.js';
export { notifyRuntimeDiagnostic, notifyProcessMemory } from './monitoringRuntimeBridge.js';

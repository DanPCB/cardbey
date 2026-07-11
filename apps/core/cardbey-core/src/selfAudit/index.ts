/**
 * Self-audit module exports.
 */

export type {
  AuditCategory,
  AuditSeverity,
  AuditIssue,
  AuditContext,
  FrontendTelemetryEvent,
} from './detectors/index.js';

export {
  BaseDetector,
  selfAuditLog,
  createAllDetectors,
  ALL_DETECTORS,
} from './detectors/index.js';

export {
  SelfAuditOrchestrator,
  getSelfAuditStatus,
  ingestFrontendTelemetryEvent,
  getFrontendEventBuffer,
} from './orchestrator.js';

export { initSelfAuditScheduler, stopSelfAuditScheduler, runScheduledAudit } from './scheduler.js';

export { generateFixPlans, type FixPlan } from './fixGenerators/index.js';

export {
  enrichContextWithTelemetry,
  deriveTelemetryAuditIssues,
  getTelemetryBridgeStatus,
} from './integration/telemetryBridge.js';

export { reportAuditToMonitoring, collectMonitoringMetrics } from './integration/monitoringBridge.js';

export { loadFixRecords, appendFixRecord, getLatestAuditReport } from './fixHistory.js';

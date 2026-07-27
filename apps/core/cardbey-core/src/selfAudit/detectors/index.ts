/**
 * Self-audit detector registry.
 */

export type {
  AuditCategory,
  AuditSeverity,
  AuditIssue,
  AuditContext,
  FrontendTelemetryEvent,
} from './base.detector.js';
export { BaseDetector, selfAuditLog } from './base.detector.js';

export { UIFormStuckDetector } from './uiFormStuck.detector.js';
export { MultiStoreIncompleteDetector } from './multiStoreIncomplete.detector.js';
export { DatabaseConnectionDetector } from './databaseConnection.detector.js';
export { LatencySpikeDetector } from './latencySpike.detector.js';
export { HITLRoutingDetector } from './hitlRouting.detector.js';
export { FrontendLoopDetector } from './frontendLoop.detector.js';
export { MemoryLeakDetector } from './memoryLeak.detector.js';
export { TelemetryDrivenDetector } from './telemetryDriven.detector.js';

import { BaseDetector } from './base.detector.js';
import { UIFormStuckDetector } from './uiFormStuck.detector.js';
import { MultiStoreIncompleteDetector } from './multiStoreIncomplete.detector.js';
import { DatabaseConnectionDetector } from './databaseConnection.detector.js';
import { LatencySpikeDetector } from './latencySpike.detector.js';
import { HITLRoutingDetector } from './hitlRouting.detector.js';
import { FrontendLoopDetector } from './frontendLoop.detector.js';
import { MemoryLeakDetector } from './memoryLeak.detector.js';
import { TelemetryDrivenDetector } from './telemetryDriven.detector.js';

export const ALL_DETECTORS: Array<new () => BaseDetector> = [
  UIFormStuckDetector,
  MultiStoreIncompleteDetector,
  DatabaseConnectionDetector,
  LatencySpikeDetector,
  HITLRoutingDetector,
  FrontendLoopDetector,
  MemoryLeakDetector,
  TelemetryDrivenDetector,
];

export function createAllDetectors(): BaseDetector[] {
  return ALL_DETECTORS.map((D) => new D());
}

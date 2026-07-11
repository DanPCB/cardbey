#!/usr/bin/env tsx
/**
 * Sync Mission Console telemetry buffers into self-audit context and run quick review.
 */

import { enrichContextWithTelemetry, getTelemetryBridgeStatus } from '../src/selfAudit/integration/telemetryBridge.js';
import { deriveTelemetryAuditIssues } from '../src/selfAudit/integration/telemetryBridge.js';
import { SelfAuditOrchestrator } from '../src/selfAudit/orchestrator.js';
import { collectMonitoringMetrics } from '../src/selfAudit/integration/monitoringBridge.js';

async function main(): Promise<void> {
  const enabled =
    String(process.env.TELEMETRY_SYNC_ENABLED ?? 'true').trim().toLowerCase() !== 'false';

  if (!enabled) {
    console.log('Telemetry sync disabled (TELEMETRY_SYNC_ENABLED=false)');
    return;
  }

  const bridge = getTelemetryBridgeStatus();
  console.log('Telemetry bridge status:', JSON.stringify(bridge, null, 2));

  const context = enrichContextWithTelemetry({
    logs: [],
    errors: [],
    metrics: await collectMonitoringMetrics(),
    codebase: {},
    uiState: {},
  });

  const telemetryIssues = deriveTelemetryAuditIssues(context);
  console.log(`\nTelemetry-derived issues: ${telemetryIssues.length}`);
  for (const issue of telemetryIssues) {
    console.log(`  - [${issue.severity}] ${issue.title}`);
  }

  const orchestrator = new SelfAuditOrchestrator();
  const result = await orchestrator.audit(context);
  console.log(`\nFull audit issues: ${result.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Simple text dashboard for multi-agent telemetry (CLI-friendly).
 */

import { getMissionHistory } from './metrics.js';
import { globalMetrics } from './metrics.js';

export function renderTelemetryDashboard(): string {
  const snapshot = globalMetrics.getSnapshot();
  const recent = getMissionHistory().slice(-5);

  const lines = [
    '=== Cardbey Multi-Agent Telemetry ===',
    `Missions: ${snapshot.missions}`,
    `Total tokens: ${snapshot.totalTokens}`,
    `Estimated cost (USD): $${snapshot.totalCostUsd.toFixed(4)}`,
    `Avg duration (ms): ${Math.round(snapshot.averageDurationMs)}`,
    `Plan approval rate: ${(snapshot.planApprovalRate * 100).toFixed(1)}%`,
    '',
    'Recent missions:',
  ];

  for (const mission of recent) {
    lines.push(
      `- ${mission.missionId}: ${mission.duration}ms, agents=[${mission.agentsUsed.join(', ')}], tokens=${mission.tokenUsage.total}`,
    );
  }

  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  console.log(renderTelemetryDashboard());
}

#!/usr/bin/env tsx
/**
 * Cardbey self-audit CLI — detect issues and propose governed fixes.
 */

import fs from 'node:fs';
import { SelfAuditOrchestrator } from '../src/selfAudit/orchestrator.js';
import { collectMonitoringMetrics } from '../src/selfAudit/integration/monitoringBridge.js';
import { enrichContextWithTelemetry } from '../src/selfAudit/integration/telemetryBridge.js';
import type { AuditContext } from '../src/selfAudit/detectors/base.detector.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const watch = args.includes('--watch');
const fixMode = args.includes('--fix');

async function collectLogs(): Promise<string[]> {
  const logFiles = ['logs/app.log', 'logs/agent-telemetry.log', 'logs/error.log'];
  let allLogs: string[] = [];
  for (const file of logFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      allLogs = allLogs.concat(content.split('\n').filter(Boolean));
    }
  }
  return allLogs;
}

async function buildContext(): Promise<AuditContext> {
  const metrics = await collectMonitoringMetrics();
  return enrichContextWithTelemetry({
    logs: await collectLogs(),
    errors: [],
    metrics,
    codebase: {},
    uiState: {
      isStaticForm: false,
      hasDeepSeekResponse: false,
      userMessage: '',
    },
  });
}

async function runSelfAudit(): Promise<void> {
  console.log('Cardbey Self-Audit System\n');
  console.log('='.repeat(60));

  if (dryRun) {
    process.env.SELF_AUDIT_AUTO_FIX = 'false';
  }

  const context = await buildContext();
  const orchestrator = new SelfAuditOrchestrator();
  const result = await orchestrator.autoHeal(context);

  console.log('\nSummary:');
  console.log(`   Issues Found: ${result.issues.length}`);
  console.log(`   Fixes Proposed: ${result.fixes.length}`);
  console.log(`   Applied: ${result.results.applied}`);
  console.log(`   Success: ${result.results.success ? 'yes' : 'no'}`);

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues) {
      console.log(`   - [${issue.severity}] ${issue.title}`);
      console.log(`     ${issue.description}`);
      console.log(`     -> ${issue.suggestedFix}`);
    }
  }

  if (fixMode && result.fixes.length > 0) {
    console.log('\nTo apply fixes, run: npm run self-audit:fix -- --confirm');
  }
}

async function main(): Promise<void> {
  if (watch) {
    const intervalMs = Number(process.env.TELEMETRY_SYNC_INTERVAL ?? 300) * 1000;
    console.log(`Watch mode — running every ${intervalMs / 1000}s`);
    await runSelfAudit();
    setInterval(() => {
      runSelfAudit().catch(console.error);
    }, intervalMs);
    return;
  }

  await runSelfAudit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

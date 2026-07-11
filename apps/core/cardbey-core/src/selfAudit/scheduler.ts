/**
 * Schedule regular self-audit runs.
 */

import cron from 'node-cron';
import { SelfAuditOrchestrator } from './orchestrator.js';
import { collectMonitoringMetrics } from './integration/monitoringBridge.js';
import { selfAuditLog } from './detectors/base.detector.js';
import type { AuditContext } from './detectors/base.detector.js';

let auditJob: cron.ScheduledTask | null = null;
let isRunning = false;

async function buildScheduledContext(): Promise<AuditContext> {
  const metrics = await collectMonitoringMetrics();
  return {
    logs: [],
    errors: [],
    metrics,
    codebase: {},
    uiState: {},
  };
}

async function runScheduledAudit(): Promise<void> {
  if (isRunning) {
    selfAuditLog.warn('Scheduled audit already running — skipping');
    return;
  }

  isRunning = true;
  const started = Date.now();

  try {
    const orchestrator = new SelfAuditOrchestrator();
    const context = await buildScheduledContext();
    const result = await orchestrator.autoHeal(context);
    const durationMs = Date.now() - started;
    selfAuditLog.info('Scheduled audit complete', {
      issues: result.issues.length,
      fixes: result.fixes.length,
      durationMs,
    });
  } catch (err) {
    selfAuditLog.error('Scheduled audit failed', { error: (err as Error).message });
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize self-audit cron scheduler.
 */
export function initSelfAuditScheduler(): void {
  if (String(process.env.SELF_AUDIT_ENABLED ?? 'true').trim().toLowerCase() === 'false') {
    selfAuditLog.info('Self-audit scheduler disabled (SELF_AUDIT_ENABLED=false)');
    return;
  }

  if (auditJob) {
    selfAuditLog.info('Self-audit scheduler already initialized');
    return;
  }

  const schedule = String(process.env.SELF_AUDIT_SCHEDULE ?? '0 */6 * * *').trim();
  if (!cron.validate(schedule)) {
    selfAuditLog.error('Invalid SELF_AUDIT_SCHEDULE cron expression', { schedule });
    return;
  }

  auditJob = cron.schedule(
    schedule,
    () => {
      runScheduledAudit().catch((err) => {
        selfAuditLog.error('Unhandled scheduler error', { error: err?.message });
      });
    },
    { scheduled: true, timezone: 'UTC' },
  );

  selfAuditLog.info(`Self-audit scheduler initialized (${schedule} UTC)`);
}

export function stopSelfAuditScheduler(): void {
  if (auditJob) {
    auditJob.stop();
    auditJob = null;
    selfAuditLog.info('Self-audit scheduler stopped');
  }
}

export { runScheduledAudit };

/**
 * Self-audit orchestrator — parallel detection, governed fix proposals, history tracking.
 */

import {
  createAllDetectors,
  type AuditContext,
  type AuditIssue,
  selfAuditLog,
} from './detectors/index.js';
import { enrichContextWithTelemetry } from './integration/telemetryBridge.js';
import { reportAuditToMonitoring } from './integration/monitoringBridge.js';
import { compareFixOutcome, recordFixOutcome } from './integration/fixPlaybookBridge.js';
import { generateFixPlans, type FixPlan } from './fixGenerators/index.js';
import {
  appendFixRecord,
  createFixRecordId,
  getLatestAuditReport,
  loadFixRecords,
  saveAuditReport,
  type SelfAuditFixRecord,
} from './fixHistory.js';

export interface ApplyFixOptions {
  confirmed: boolean;
  executedBy?: string;
}

export interface AutoHealResult {
  issues: AuditIssue[];
  fixes: FixPlan[];
  results: {
    success: boolean;
    applied: number;
    proposed: number;
    rejected: number;
  };
}

let lastRunAt: string | null = null;
let lastIssues: AuditIssue[] = [];

/** In-memory frontend telemetry events from dashboard. */
const frontendEventBuffer: Array<{
  type: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}> = [];

const MAX_FRONTEND_EVENTS = 500;

export function ingestFrontendTelemetryEvent(event: {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}): void {
  frontendEventBuffer.push({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  });
  while (frontendEventBuffer.length > MAX_FRONTEND_EVENTS) frontendEventBuffer.shift();
}

export function getFrontendEventBuffer() {
  return [...frontendEventBuffer];
}

export class SelfAuditOrchestrator {
  private detectors = createAllDetectors();

  constructor() {
    selfAuditLog.info(`Registered ${this.detectors.length} detectors`);
  }

  /**
   * Run all detectors in parallel and aggregate results.
   */
  async audit(context: AuditContext): Promise<AuditIssue[]> {
    selfAuditLog.info('Starting self-audit');

    const enriched = enrichContextWithTelemetry({
      ...context,
      frontendEvents: [
        ...(context.frontendEvents ?? []),
        ...getFrontendEventBuffer(),
      ] as AuditContext['frontendEvents'],
    });

    const maxIssues = Number(process.env.SELF_AUDIT_MAX_ISSUES ?? 100);
    const results = await Promise.allSettled(
      this.detectors.map((d) => d.detect(enriched)),
    );

    const allIssues: AuditIssue[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const detector = this.detectors[i]!;
      if (result.status === 'fulfilled') {
        allIssues.push(...result.value);
        selfAuditLog.info(`${detector.name}: ${result.value.length} issue(s)`);
      } else {
        selfAuditLog.error(`${detector.name} failed`, { error: result.reason?.message });
      }
    }

    const deduped = this.dedupeIssues(allIssues).slice(0, maxIssues);
    lastRunAt = new Date().toISOString();
    lastIssues = deduped;

    const criticalCount = deduped.filter((i) => i.severity === 'critical').length;
    const highCount = deduped.filter((i) => i.severity === 'high').length;

    await reportAuditToMonitoring({
      issueCount: deduped.length,
      criticalCount,
      highCount,
      issues: deduped,
      timestamp: lastRunAt,
    });

    selfAuditLog.info(`Audit complete: ${deduped.length} issue(s)`);
    return deduped;
  }

  private dedupeIssues(issues: AuditIssue[]): AuditIssue[] {
    const seen = new Map<string, AuditIssue>();
    for (const issue of issues) {
      const key = `${issue.category}:${issue.title}`;
      if (!seen.has(key)) seen.set(key, issue);
    }
    return [...seen.values()];
  }

  /**
   * Generate governed fix proposals for issues.
   */
  async generateFixes(issues: AuditIssue[]): Promise<FixPlan[]> {
    const plans = generateFixPlans(issues);
    for (const plan of plans) {
      const record: SelfAuditFixRecord = {
        id: createFixRecordId(),
        issueId: plan.issueId,
        status: 'proposed',
        description: plan.description,
        proposedAt: new Date().toISOString(),
        guardrails: plan.guardrails,
        playbookId: plan.playbookId,
      };
      appendFixRecord(record);
    }
    return plans;
  }

  /**
   * Apply fix with admin confirmation (governed — no file writes).
   */
  async applyFixes(
    plans: FixPlan[],
    options: ApplyFixOptions = { confirmed: false },
  ): Promise<{ success: boolean; results: SelfAuditFixRecord[] }> {
    const results: SelfAuditFixRecord[] = [];

    if (!options.confirmed) {
      selfAuditLog.warn('Fix apply rejected — confirmation required');
      return { success: false, results };
    }

    const autoFixEnabled =
      String(process.env.SELF_AUDIT_AUTO_FIX ?? 'false').trim().toLowerCase() === 'true';

    for (const plan of plans) {
      const existing = loadFixRecords().find((r) => r.issueId === plan.issueId);
      const record: SelfAuditFixRecord = {
        id: existing?.id ?? createFixRecordId(),
        issueId: plan.issueId,
        status: 'applied',
        description: plan.description,
        proposedAt: existing?.proposedAt ?? new Date().toISOString(),
        appliedAt: new Date().toISOString(),
        appliedBy: options.executedBy ?? 'system',
        guardrails: plan.guardrails,
        playbookId: plan.playbookId,
        outcome: 'waiting_validation',
      };

      if (!autoFixEnabled) {
        record.status = 'proposed';
        selfAuditLog.info(`Fix proposed (no auto-apply): ${plan.issueId}`);
      } else {
        selfAuditLog.info(`Fix marked applied (governed): ${plan.issueId}`);
      }

      appendFixRecord(record);
      results.push(record);
    }

    return { success: true, results };
  }

  /**
   * Full auto-heal cycle: audit → propose fixes → optionally apply.
   */
  async autoHeal(context: AuditContext): Promise<AutoHealResult> {
    selfAuditLog.info('Starting auto-heal cycle');

    const beforeCount = lastIssues.length;
    const issues = await this.audit(context);

    if (issues.length === 0) {
      const report = {
        timestamp: new Date().toISOString(),
        issuesFound: 0,
        fixesProposed: 0,
        success: true,
        issues: [],
        fixes: [],
      };
      saveAuditReport(report);
      return { issues: [], fixes: [], results: { success: true, applied: 0, proposed: 0, rejected: 0 } };
    }

    const fixes = await this.generateFixes(issues);

    const autoFix =
      String(process.env.SELF_AUDIT_AUTO_FIX ?? 'false').trim().toLowerCase() === 'true';
    let applyResult = { success: false, results: [] as SelfAuditFixRecord[] };

    if (autoFix && fixes.length > 0) {
      applyResult = await this.applyFixes(fixes, { confirmed: true, executedBy: 'self-audit-cli' });
    }

    const outcome = compareFixOutcome({ issueCount: beforeCount }, { issueCount: issues.length });
    for (const r of applyResult.results) {
      recordFixOutcome(r, outcome);
    }

    const report = {
      timestamp: new Date().toISOString(),
      issuesFound: issues.length,
      fixesProposed: fixes.length,
      success: true,
      issues,
      fixes,
    };
    saveAuditReport(report);

    return {
      issues,
      fixes,
      results: {
        success: true,
        applied: applyResult.results.filter((r) => r.status === 'applied').length,
        proposed: fixes.length - applyResult.results.filter((r) => r.status === 'applied').length,
        rejected: 0,
      },
    };
  }

  /**
   * Apply a single fix by issue ID (API handler).
   */
  async applyFixByIssueId(
    issueId: string,
    options: ApplyFixOptions,
  ): Promise<SelfAuditFixRecord | null> {
    const issue = lastIssues.find((i) => i.id === issueId);
    if (!issue) return null;

    const plans = await this.generateFixes([issue]);
    if (plans.length === 0) return null;

    const { results } = await this.applyFixes(plans, options);
    return results[0] ?? null;
  }
}

export function getSelfAuditStatus() {
  const latest = getLatestAuditReport();
  const records = loadFixRecords();
  return {
    enabled: String(process.env.SELF_AUDIT_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    lastRunAt,
    issueCount: lastIssues.length,
    criticalCount: lastIssues.filter((i) => i.severity === 'critical').length,
    highCount: lastIssues.filter((i) => i.severity === 'high').length,
    proposedFixes: records.filter((r) => r.status === 'proposed').length,
    latestReport: latest,
    openIssues: lastIssues,
  };
}

/**
 * Base types and abstract detector for Cardbey self-audit.
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../lib/logger.js';

export const selfAuditLog = createLogger('SELF_AUDIT');

export type AuditCategory =
  | 'ui'
  | 'api'
  | 'database'
  | 'agent'
  | 'performance'
  | 'routing';

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AuditIssue {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  location: string;
  evidence: Record<string, unknown>;
  suggestedFix: string;
  autoFixable: boolean;
  timestamp?: string;
  telemetryId?: string;
  relatedIssues?: string[];
}

export interface FrontendTelemetryEvent {
  type: 'user_message' | 'form_render' | 'deepseek_response' | 'intake_action' | 'stream_token';
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export interface AuditContext {
  logs: string[];
  errors: Array<{ message?: string; code?: string; [key: string]: unknown }>;
  metrics: {
    latency_p95?: number;
    success_rate?: number;
    error_rate?: number;
    memory_usage?: number;
    rss?: number;
    allocation_usage?: number;
    [key: string]: unknown;
  };
  codebase: {
    files?: string[];
    patterns?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    [key: string]: unknown;
  };
  uiState: {
    isStaticForm?: boolean;
    hasDeepSeekResponse?: boolean;
    userMessage?: string;
    currentRoute?: string;
    isLoading?: boolean;
    error?: string | null;
    lastIntakeAction?: string;
    formType?: string;
    [key: string]: unknown;
  };
  frontendEvents?: FrontendTelemetryEvent[];
  telemetryBuffers?: {
    pipelineWrites?: unknown[];
    intentPlans?: unknown[];
    executionEvents?: unknown[];
    resultConsistency?: unknown[];
    pipelineOutputDualWrite?: boolean;
  };
  [key: string]: unknown;
}

export abstract class BaseDetector {
  abstract readonly name: string;
  abstract readonly detectorKey: string;

  abstract detect(context: AuditContext): Promise<AuditIssue[]>;

  protected createIssue(
    category: AuditCategory,
    severity: AuditSeverity,
    title: string,
    description: string,
    location: string,
    evidence: Record<string, unknown>,
    suggestedFix: string,
    autoFixable = true,
    telemetryId?: string,
  ): AuditIssue {
    const stableSeed = `${this.detectorKey}:${category}:${title}:${location}`;
    const hash = createHash('sha256').update(stableSeed).digest('hex').slice(0, 8);
    return {
      id: `${category}-${this.detectorKey}-${hash}`,
      category,
      severity,
      title,
      description,
      location,
      evidence,
      suggestedFix,
      autoFixable,
      timestamp: new Date().toISOString(),
      ...(telemetryId ? { telemetryId } : {}),
    };
  }

  protected shouldRun(_context: AuditContext): boolean {
    return true;
  }

  protected logDetect(issueCount: number, detail?: Record<string, unknown> | null): void {
    selfAuditLog.info(`${this.name}: ${issueCount} issue(s)`, detail ?? null);
  }
}

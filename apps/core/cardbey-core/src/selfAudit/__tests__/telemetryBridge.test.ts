/**
 * Telemetry bridge tests.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTelemetryReview,
  deriveTelemetryFixIssues,
} from '../integration/telemetryReview.js';
import { telemetryFixIssueToAuditIssue } from '../integration/telemetryBridge.js';

describe('telemetryReview', () => {
  it('builds risk review when buffers empty', () => {
    const review = buildTelemetryReview({
      pipelineWrites: [],
      intentPlans: [],
      resultConsistency: [],
    });
    expect(review.status).toBe('partial');
    expect(review.risks.length).toBeGreaterThan(0);
  });

  it('derives telemetry_stream_missing issue', () => {
    const input = {
      pipelineWrites: [],
      intentPlans: [],
      resultConsistency: [],
      executionEvents: [],
    };
    const review = buildTelemetryReview(input);
    const issues = deriveTelemetryFixIssues({ ...input, review });
    expect(issues.some((i) => i.category === 'telemetry_stream_missing')).toBe(true);
  });
});

describe('telemetryFixIssueToAuditIssue', () => {
  it('maps telemetry issue to audit issue with telemetryId', () => {
    const audit = telemetryFixIssueToAuditIssue({
      id: 'telemetry_stream_missing:1',
      category: 'telemetry_stream_missing',
      title: 'Stream missing',
      severity: 'high',
      confidence: 0.9,
      suggestedTool: 'code_fix',
      summary: 'Buffers empty',
      evidence: ['all empty'],
      playbookId: 'telemetry_stream_missing',
    });
    expect(audit.telemetryId).toBe('telemetry_stream_missing:1');
    expect(audit.autoFixable).toBe(true);
  });
});

/**
 * Unit tests for self-audit detectors.
 */

import { describe, it, expect } from 'vitest';
import { UIFormStuckDetector } from '../detectors/uiFormStuck.detector.js';
import { MultiStoreIncompleteDetector } from '../detectors/multiStoreIncomplete.detector.js';
import { DatabaseConnectionDetector } from '../detectors/databaseConnection.detector.js';
import { LatencySpikeDetector } from '../detectors/latencySpike.detector.js';
import type { AuditContext } from '../detectors/base.detector.js';

const baseContext: AuditContext = {
  logs: [],
  errors: [],
  metrics: {},
  codebase: {},
  uiState: {},
};

describe('UIFormStuckDetector', () => {
  it('detects stuck form when telemetry shows form without DeepSeek response', async () => {
    const detector = new UIFormStuckDetector();
    const issues = await detector.detect({
      ...baseContext,
      logs: ['DeepSeek multiAgent pipeline started', '/performer/intake/v2'],
      uiState: {
        isStaticForm: true,
        hasDeepSeekResponse: false,
        userMessage: 'Set up 3 stores in different cities',
      },
      frontendEvents: [
        { type: 'user_message', payload: { message: 'Set up 3 stores in different cities' } },
        { type: 'form_render', payload: { formType: 'store_creation_draft' } },
      ],
    });
    expect(issues.length).toBe(1);
    expect(issues[0]?.title).toContain('static form');
    expect(issues[0]?.category).toBe('ui');
  });

  it('returns empty when DeepSeek response received', async () => {
    const detector = new UIFormStuckDetector();
    const issues = await detector.detect({
      ...baseContext,
      logs: ['DeepSeek multiAgent'],
      frontendEvents: [
        { type: 'user_message', payload: { message: 'hello' } },
        { type: 'deepseek_response', payload: { action: 'show_execution_plan' } },
      ],
    });
    expect(issues.length).toBe(0);
  });
});

describe('MultiStoreIncompleteDetector', () => {
  it('detects incomplete multi-store planning', async () => {
    const detector = new MultiStoreIncompleteDetector();
    const issues = await detector.detect({
      ...baseContext,
      logs: [
        'Set up 3 stores in different cities',
        'missing fields: store_names',
        'needs_clarification',
      ],
    });
    expect(issues.length).toBe(1);
    expect(issues[0]?.category).toBe('agent');
  });
});

describe('DatabaseConnectionDetector', () => {
  it('detects connection errors above threshold', async () => {
    const detector = new DatabaseConnectionDetector();
    const issues = await detector.detect({
      ...baseContext,
      logs: Array(10).fill('Connection has not been opened'),
      errors: [{ message: 'Connection has not been opened', code: 'P2024' }],
    });
    expect(issues.length).toBe(1);
    expect(issues[0]?.category).toBe('database');
  });
});

describe('LatencySpikeDetector', () => {
  it('detects P95 above SLO', async () => {
    const detector = new LatencySpikeDetector();
    const issues = await detector.detect({
      ...baseContext,
      metrics: { latency_p95: 95803 },
    });
    expect(issues.length).toBe(1);
    expect(issues[0]?.severity).toBe('critical');
  });
});

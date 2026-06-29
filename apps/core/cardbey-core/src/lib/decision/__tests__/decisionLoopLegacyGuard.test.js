import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  shouldBlockLegacyIntakePaths,
  isLegacyDirectActionDispatchAllowed,
  applyLoopClassificationGuard,
  normalizeTelemetryClassification,
} from '../decisionLoopLegacyGuard.js';

describe('decisionLoopLegacyGuard', () => {
  const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;

  beforeEach(() => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
  });

  it('blocks legacy paths when early gate ran', () => {
    expect(shouldBlockLegacyIntakePaths(true)).toBe(true);
    expect(shouldBlockLegacyIntakePaths(false)).toBe(false);
  });

  it('blocks legacy direct_action unless loop-owned', () => {
    expect(isLegacyDirectActionDispatchAllowed({ executionPath: 'direct_action', tool: 'create_store' })).toBe(
      false,
    );
    expect(
      isLegacyDirectActionDispatchAllowed({
        executionPath: 'direct_action',
        tool: 'create_store',
        _decisionLoop: true,
      }),
    ).toBe(true);
  });

  it('applyLoopClassificationGuard preserves loop-owned classification', () => {
    const current = { tool: 'ingest_asset_for_intent_detection', _decisionLoop: true, executionPath: 'clarify' };
    const next = { tool: 'create_store', executionPath: 'direct_action', confidence: 1 };
    expect(applyLoopClassificationGuard(next, current)).toBe(current);
  });

  it('normalizeTelemetryClassification rewrites blocked direct_action', () => {
    const out = normalizeTelemetryClassification({
      executionPath: 'direct_action',
      tool: 'create_store',
      confidence: 1,
    });
    expect(out.executionPath).toBe('decision_loop');
    expect(out._legacyDirectActionBlocked).toBe(true);
  });
});

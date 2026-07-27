/**
 * DANH: validate_and_fix_next_steps unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateAndFixNextSteps,
  normalizeInputSteps,
  isNextStepsValidationPending,
  deriveNextStepsState,
} from './validateNextSteps.js';

const MISSION_ID = 'mission_test_001';

describe('validateAndFixNextSteps', () => {
  it('infers invalid action keys from title keywords', () => {
    const report = validateAndFixNextSteps(
      [
        {
          order: 1,
          title: 'Add real menu items',
          action: 'bogus_tool',
          mission_id: MISSION_ID,
        },
      ],
      MISSION_ID,
    );
    expect(report.status).toBe('fixed');
    expect(report.steps_final[0].action).toBe('replace_store_catalog');
  });

  it('corrects wrong mission_id', () => {
    const report = validateAndFixNextSteps(
      [
        {
          order: 1,
          title: 'Upload logo',
          action: 'upload_store_asset',
          mission_id: 'wrong-id',
        },
      ],
      MISSION_ID,
    );
    expect(report.steps_final[0].mission_id).toBe(MISSION_ID);
    expect(report.status).toBe('fixed');
  });

  it('re-sequences duplicate order values', () => {
    const report = validateAndFixNextSteps(
      [
        {
          order: 2,
          title: 'View analytics',
          action: 'analyze_store',
          mission_id: MISSION_ID,
        },
        {
          order: 2,
          title: 'Add products',
          action: 'replace_store_catalog',
          mission_id: MISSION_ID,
        },
      ],
      MISSION_ID,
    );
    expect(report.steps_final.map((s) => s.order)).toEqual([1, 2]);
    expect(report.steps_final[0].action).toBe('replace_store_catalog');
  });

  it('returns clean when steps are already valid', () => {
    const report = validateAndFixNextSteps(
      [
        {
          order: 1,
          title: 'Add menu',
          action: 'replace_store_catalog',
          mission_id: MISSION_ID,
        },
        {
          order: 2,
          title: 'Analyze store',
          action: 'analyze_store',
          mission_id: MISSION_ID,
        },
      ],
      MISSION_ID,
    );
    expect(report.status).toBe('clean');
    expect(report.issues_found).toHaveLength(0);
  });

  it('returns needs_manual_review when action cannot be inferred', () => {
    const report = validateAndFixNextSteps(
      [
        {
          order: 1,
          title: 'Do the thing',
          action: 'totally_unknown_xyz',
          mission_id: MISSION_ID,
        },
      ],
      MISSION_ID,
    );
    expect(report.status).toBe('needs_manual_review');
    expect(report.issues_found.some((i) => i.fix_applied === 'flagged for manual review')).toBe(true);
  });

  it('handles empty steps array gracefully', () => {
    const report = validateAndFixNextSteps([], MISSION_ID);
    expect(report.status).toBe('clean');
    expect(report.steps_checked).toBe(0);
    expect(report.steps_final).toEqual([]);
  });
});

describe('normalizeInputSteps', () => {
  it('maps blackboard hint shape to NextStep', () => {
    const steps = normalizeInputSteps([
      { label: 'Add menu →', prompt: 'Add my menu', suggestedTool: 'replace_store_catalog' },
    ]);
    expect(steps[0].title).toBe('Add menu →');
    expect(steps[0].action).toBe('replace_store_catalog');
    expect(steps[0].description).toBe('Add my menu');
  });
});

describe('deriveNextStepsState', () => {
  it('returns WAITING_FOR_HINTS when no hints and mission completed recently', () => {
    const completedAt = new Date(Date.now() - 1000).toISOString();
    const out = deriveNextStepsState([], completedAt);
    expect(out.state).toBe('WAITING_FOR_HINTS');
    expect(out.hints).toEqual([]);
  });

  it('returns READY with empty hints when no hints and completion is older than 5s', () => {
    const completedAt = new Date(Date.now() - 10_000).toISOString();
    const out = deriveNextStepsState([], completedAt);
    expect(out.state).toBe('READY');
    expect(out.hints).toEqual([]);
  });

  it('returns VALIDATION_PENDING when latest pending flag is true', () => {
    const out = deriveNextStepsState(
      [
        {
          eventType: 'next_action_hints',
          payload: { hints: [{ label: 'A', prompt: 'a', suggestedTool: 'analyze_store' }] },
        },
        { eventType: 'next_steps_validation_pending', payload: { pending: true } },
      ],
      new Date().toISOString(),
    );
    expect(out.state).toBe('VALIDATION_PENDING');
  });
});

describe('isNextStepsValidationPending', () => {
  it('returns true when latest pending event is active', () => {
    expect(
      isNextStepsValidationPending([
        { eventType: 'next_steps_validation_pending', payload: { pending: false } },
        { eventType: 'next_steps_validation_pending', payload: { pending: true } },
      ]),
    ).toBe(true);
  });

  it('returns false when latest pending event is cleared', () => {
    expect(
      isNextStepsValidationPending([
        { eventType: 'next_steps_validation_pending', payload: { pending: true } },
        { eventType: 'next_steps_validation_pending', payload: { pending: false } },
      ]),
    ).toBe(false);
  });
});

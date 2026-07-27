import { describe, expect, it, vi } from 'vitest';
import { reactPlanner } from '../reactPlanner.js';
import { executionGateway } from '../executionGateway.js';
import { isI18nMaintenanceIntent, getI18nSyncMode } from '../maintenanceIntent.js';

describe('i18n maintenance intent', () => {
  it('detects translation coverage phrases', () => {
    expect(isI18nMaintenanceIntent('check translation coverage')).toBe(true);
    expect(isI18nMaintenanceIntent('sync i18n please')).toBe(true);
    expect(isI18nMaintenanceIntent('check for errors')).toBe(false);
  });

  it('classifies sync vs check mode', () => {
    expect(getI18nSyncMode('update translations')).toBe('sync');
    expect(getI18nSyncMode('find missing translations')).toBe('check');
  });
});

describe('reactPlanner i18n_sync', () => {
  it('returns i18n_sync for operator translation phrases', async () => {
    const out = await reactPlanner({
      userMessage: 'check translation coverage',
      toolRegistry: [],
      context: { operatorSession: true },
    });
    expect(out).toEqual({ kind: 'i18n_sync', mode: 'check' });
  });

  it('returns sync mode for update translations', async () => {
    const out = await reactPlanner({
      userMessage: 'update translations',
      toolRegistry: [],
      context: { operatorSession: true },
    });
    expect(out).toEqual({ kind: 'i18n_sync', mode: 'sync' });
  });
});

describe('executionGateway i18n_sync', () => {
  const maintenanceCtx = {
    missionType: 'MAINTENANCE',
    operatorSession: true,
  };

  it('returns clean message when no gaps', async () => {
    const dispatchTool = vi.fn(async (tool) => {
      if (tool === 'detect_i18n_gaps') {
        return { count: 0, fileCount: 0, items: [] };
      }
      return {};
    });

    const out = await executionGateway({
      decision: { kind: 'i18n_sync', mode: 'check' },
      context: maintenanceCtx,
      dispatchTool,
    });

    expect(out.action).toBe('chat');
    expect(out.message).toContain('No gaps found');
  });

  it('check mode reports gap count', async () => {
    const dispatchTool = vi.fn(async (tool) => {
      if (tool === 'detect_i18n_gaps') {
        return {
          count: 2,
          fileCount: 1,
          items: [{ file: 'a.tsx', line: 1, string: 'Hello', suggestedKey: 'a.hello' }],
        };
      }
      return {};
    });

    const out = await executionGateway({
      decision: { kind: 'i18n_sync', mode: 'check' },
      context: maintenanceCtx,
      dispatchTool,
    });

    expect(out.action).toBe('chat');
    expect(out.message).toContain('2 untranslated');
  });

  it('sync mode surfaces approval_required', async () => {
    const dispatchTool = vi.fn(async (tool, params) => {
      if (tool === 'detect_i18n_gaps') {
        return {
          count: 1,
          fileCount: 1,
          items: [{ file: 'a.tsx', suggestedKey: 'a.hello', string: 'Hello' }],
        };
      }
      if (tool === 'apply_i18n_translations' && params.dryRun) {
        return { preview: '+ a.hello\n+   vi: "Xin chào"' };
      }
      return {};
    });

    const out = await executionGateway({
      decision: { kind: 'i18n_sync', mode: 'sync' },
      context: maintenanceCtx,
      dispatchTool,
    });

    expect(out.action).toBe('approval_required');
    expect(out.tool).toBe('apply_i18n_translations');
    expect(out.confirmation.riskLevel).toBe('low');
  });
});

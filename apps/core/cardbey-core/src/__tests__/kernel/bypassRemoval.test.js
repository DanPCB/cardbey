/**
 * Bypass removal — kernel mandatory unified execution contract.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertKernelAuthorizedExecution,
  isKernelMandatoryEnabled,
  normalizeClassificationForKernel,
} from '../../lib/runtime/kernelMandatory.js';
import { normalizeRoutingBodyFlags } from '../../lib/routing/compatibilityLayer.js';
import { isCampaignOrchestrationIntent, classifyIntent } from '../../lib/intake/intakeClassifier.js';
import { shouldPreserveCreateStoreShortcutWhenKernelMandatory } from '../../lib/intake/storeCreateIntentFastPath.js';
import { unifiedDispatch } from '../../lib/intake/unifiedDispatch.js';

const executeRuntimeActionMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeActionMock(...args),
}));

const coreSrcRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../');

function walkFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walkFiles(full, acc);
    } else if (/\.(js|ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function grepInCoreSrc(pattern) {
  const re = new RegExp(pattern, 'g');
  const hits = [];
  for (const file of walkFiles(coreSrcRoot)) {
    const text = readFileSync(file, 'utf8');
    const matches = text.match(re);
    if (matches?.length) {
      hits.push({ file, count: matches.length });
    }
  }
  return hits;
}

describe('Bypass Removal', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    executeRuntimeActionMock.mockReset();
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('blocks intake_v2 direct source without unified contract', () => {
    const result = assertKernelAuthorizedExecution({ source: 'intake_v2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('KERNEL_EXECUTION_REQUIRED');
    }
  });

  it('allows intake_v2_unified kernel-authorized source', () => {
    expect(assertKernelAuthorizedExecution({ source: 'intake_v2_unified' }).ok).toBe(true);
    expect(assertKernelAuthorizedExecution({ source: 'intake_v2_confirm' }).ok).toBe(true);
    expect(assertKernelAuthorizedExecution({ source: 'agent_orchestration' }).ok).toBe(true);
  });

  it('routes classifier campaign orchestration through proactive_plan', async () => {
    const msg = 'Run a multi-agent campaign orchestration for my store launch';
    expect(isCampaignOrchestrationIntent(msg)).toBe(true);
    const result = await classifyIntent({ userMessage: msg, storeContext: { storeId: 'store-1' } });
    expect(result.executionPath).toBe('proactive_plan');
    expect(result.tool).toBe('launch_campaign');
  });

  it('normalizes legacy direct_action classifications to proactive_plan', () => {
    const normalized = normalizeClassificationForKernel({
      executionPath: 'direct_action',
      tool: 'analyze_store',
      confidence: 0.9,
      parameters: {},
    });
    expect(normalized.executionPath).toBe('proactive_plan');
  });

  it('does not preserve create_store shortcuts under kernel mandatory', () => {
    expect(
      shouldPreserveCreateStoreShortcutWhenKernelMandatory(
        { type: 'create_store' },
        { storeCreateForm: { storeName: 'Acme' } },
      ),
    ).toBe(false);
  });

  it('strips skipDirectGuard from routing bodies', () => {
    const body = normalizeRoutingBodyFlags({ skipDirectGuard: true, text: 'hello' });
    expect(body.skipDirectGuard).toBeUndefined();
    expect(body.text).toBe('hello');
  });

  it('unifiedDispatch executes confirmed tools via runtime kernel', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: { message: 'done' },
    });

    const result = await unifiedDispatch(
      {
        type: 'orders_report',
        payload: {
          toolName: 'orders_report',
          input: { groupBy: 'day', storeId: 'store-1' },
          userId: 'user-1',
          storeId: 'store-1',
        },
      },
      { confirmed: true, requireConfirmation: false, source: 'intake_v2_confirm' },
    );

    expect(result.ok).toBe(true);
    expect(executeRuntimeActionMock).toHaveBeenCalledTimes(1);
    expect(executeRuntimeActionMock.mock.calls[0][0].source).toBe('intake_v2_unified');
  });

  it('has no skipDirectGuard references outside compatibility stripper', () => {
    const hits = grepInCoreSrc('skipDirectGuard').filter(
      (hit) => !hit.file.replace(/\\/g, '/').endsWith('lib/routing/compatibilityLayer.js'),
    );
    expect(hits).toEqual([]);
  });

  it('kernel mandatory is enabled by default in tests', () => {
    expect(isKernelMandatoryEnabled()).toBe(true);
  });
});

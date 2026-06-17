/**
 * Runtime Kernel flow tests — kernel mandatory enforcement and authorized paths.
 *
 * Run: npm run test:e2e:kernel
 * Optional live API: E2E_KERNEL_LIVE=1 with core running on localhost:3001
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertKernelAuthorizedExecution,
  isKernelMandatoryEnabled,
  normalizeClassificationForKernel,
} from '../../src/lib/runtime/kernelMandatory.js';
import { guardBrokerDirectAction } from '../../src/lib/broker/brokerRunwayGuard.js';
import { executeRuntimeAction } from '../../src/lib/runtime/performerRuntime/executeRuntimeAction.js';
import { resetKernelAuditForTests } from '../../src/lib/runtime/kernelAudit.js';
import { resetRuntimeCapabilitiesForTests } from '../../src/lib/runtime/runtimeCapabilitiesService.js';
import { getToolDefinition } from '../../src/lib/toolRegistry.js';

const API_BASE = process.env.E2E_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const BEARER_TOKEN =
  (process.env.E2E_AUTH_TOKEN || '').replace(/^\s*Bearer\s+/i, '').trim() ||
  (process.env.NODE_ENV === 'test' ? 'dev-admin-token' : '');

async function apiPost(path, body = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, unreachable: true, error };
  }
}

describe('Runtime Kernel E2E Flows', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    resetRuntimeCapabilitiesForTests();
    resetKernelAuditForTests();
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    resetRuntimeCapabilitiesForTests();
    resetKernelAuditForTests();
  });

  it('kernel mandatory is enabled by default', () => {
    expect(isKernelMandatoryEnabled()).toBe(true);
  });

  it('blocks unauthorized runtime execution sources', () => {
    const result = assertKernelAuthorizedExecution({ source: 'intake_v2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('KERNEL_EXECUTION_REQUIRED');
    }
  });

  it('normalizes direct_action classifications to proactive_plan', () => {
    const normalized = normalizeClassificationForKernel({
      executionPath: 'direct_action',
      tool: 'analyze_store',
      confidence: 0.9,
      parameters: {},
    });
    expect(normalized.executionPath).toBe('proactive_plan');
  });

  it('blocks broker direct dispatch from intake_v2', () => {
    const guard = guardBrokerDirectAction({ source: 'intake_v2' });
    expect(guard.blocked).toBe(true);
  });

  it('blocks executeRuntimeAction from intake_v2 source', async () => {
    const result = await executeRuntimeAction({
      actionType: 'dispatch_tool',
      source: 'intake_v2',
      payload: { toolName: 'analyze_store' },
    });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('KERNEL_EXECUTION_REQUIRED');
  });

  it('requires confirmation for state-changing tools in core registry', () => {
    for (const toolName of [
      'analyze_store',
      'launch_campaign',
      'create_offer',
      'create_promotion',
      'publish_store',
    ]) {
      const def = getToolDefinition(toolName);
      expect(def?.requiresConfirmation, toolName).toBe(true);
    }
  });

  it('live API: direct tool path returns kernel required when API is up', async () => {
    if (!process.env.E2E_KERNEL_LIVE) {
      return;
    }
    const res = await apiPost('/api/performer/intake/v2', {
      message: 'analyze my store performance now',
      sessionId: 'e2e-kernel-session',
      forceTool: 'analyze_store',
    });
    if (res.unreachable) return;
    const code = res.data?.code ?? res.data?.result;
    const blocked =
      res.status === 403 ||
      code === 'KERNEL_EXECUTION_REQUIRED' ||
      res.data?.result === 'kernel_required';
    expect(blocked).toBe(true);
  });
});

/**
 * Phase 2 / 4 bridge: optional OpenClaw child runs for mission steps marked agentHint openclaw.
 * Safe failure when OpenClaw is unavailable or disabled.
 */

import { snapshotMissionStep } from '../../services/missionContextService.js';

/**
 * Intake capability gap: (missionId, intent, options) — starts child run, does not await completion.
 *
 * @param {string} missionId
 * @param {string} intent
 * @param {object} [options]
 * @param {string} [options.tenantId]
 * @param {string} [options.userId]
 * @returns {Promise<{ ok: boolean, childMissionId?: string, missionId?: string, error?: string }>}
 */
async function spawnChildAgentForCapabilityGapIntent(missionId, intent, options = {}) {
  const mid = String(missionId ?? '').trim();
  const childIntent = String(intent ?? '').trim();
  const opts = options && typeof options === 'object' ? options : {};
  const tenantId = String(opts.tenantId ?? '').trim();
  const userId = String(opts.userId ?? '').trim();

  if (process.env.OPENCLAW_MISSION_STEPS !== 'true') {
    return { ok: false, missionId: mid || undefined, error: 'OPENCLAW_DISABLED' };
  }
  if (!mid || !childIntent) {
    return { ok: false, error: 'INVALID_ARGS' };
  }
  if (!tenantId || !userId) {
    return { ok: false, missionId: mid, error: 'OPENCLAW_CONTEXT' };
  }

  try {
    let mod;
    try {
      mod = await import('../../../../openclaw/childAgent.js');
    } catch (eJs) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[childAgentBridge] import childAgent.js failed:', eJs?.message, eJs?.code);
      }
      mod = await import('../../../../openclaw/childAgent.ts');
    }
    if (typeof mod.spawnChildAgent !== 'function') {
      return { ok: false, missionId: mid, error: 'OPENCLAW_NO_SPAWN' };
    }
    const { childRunId, statusPromise } = await mod.spawnChildAgent(mid, childIntent, {
      tenantId,
      userId,
      correlationId: mid,
      skills: ['intake_capability_gap'],
    });
    void statusPromise.catch((e) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[childAgentBridge] capability gap child status:', e?.message ?? e);
      }
    });
    return { ok: true, childMissionId: childRunId, missionId: mid };
  } catch (e) {
    return { ok: false, missionId: mid, error: e?.message || String(e) };
  }
}

/**
 * @param {{ toolName: string, input?: object, context?: object }} args
 * @param {string} [intent]
 * @param {object} [capabilityOptions]
 * @returns {Promise<
 *   | { status: 'ok'|'failed', output?: object, error?: { code: string, message: string } }
 *   | { ok: boolean, childMissionId?: string, missionId?: string, error?: string }
 * >}
 */
export async function spawnChildAgentForMissionTask(args, intent, capabilityOptions) {
  if (typeof args === 'string' && typeof intent === 'string') {
    const missionId = args;
    const result = await spawnChildAgentForCapabilityGapIntent(missionId, intent, capabilityOptions);
    snapshotMissionStep(missionId, 'capability_gap_spawn', {
      inputState: {
        intent,
        storeId: capabilityOptions?.storeId ?? null,
        source: 'capability_gap',
      },
      outputState: {
        childMissionId: result?.childMissionId ?? result?.missionId ?? null,
        ok: result?.ok ?? false,
        summary: result?.summary ?? null,
      },
      decision: `spawned child for unknown intent: ${intent}`,
    }).catch(() => {});
    return result;
  }

  const toolName = typeof args.toolName === 'string' ? args.toolName.trim() : '';
  const ctx = args.context && typeof args.context === 'object' ? args.context : {};
  const missionId = typeof ctx.missionId === 'string' ? ctx.missionId.trim() : '';

  if (process.env.OPENCLAW_MISSION_STEPS !== 'true') {
    return {
      status: 'failed',
      error: {
        code: 'OPENCLAW_DISABLED',
        message: `OpenClaw mission steps disabled (set OPENCLAW_MISSION_STEPS=true). Tool: ${toolName}`,
      },
    };
  }

  if (!missionId) {
    return {
      status: 'failed',
      error: { code: 'OPENCLAW_CONTEXT', message: 'missionId required on context for OpenClaw child' },
    };
  }

  try {
    let mod;
    try {
      mod = await import('../../../../openclaw/childAgent.js');
    } catch (eJs) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[childAgentBridge] import childAgent.js failed:', eJs?.message, eJs?.code);
      }
      try {
        mod = await import('../../../../openclaw/childAgent.ts');
      } catch (eTs) {
        // eslint-disable-next-line no-console
        console.error('[childAgentBridge] import childAgent.ts failed:', eTs?.message, eTs?.code);
        return {
          status: 'failed',
          error: {
            code: 'OPENCLAW_IMPORT',
            message: eTs?.message || String(eTs),
          },
        };
      }
    }
    if (typeof mod.spawnChildAgent !== 'function') {
      return {
        status: 'failed',
        error: { code: 'OPENCLAW_NO_SPAWN', message: 'spawnChildAgent not exported from openclaw/childAgent' },
      };
    }
    const tenantId = String(ctx.tenantId || '').trim();
    const userId = String(ctx.userId || '').trim();
    if (!tenantId || !userId) {
      return {
        status: 'failed',
        error: { code: 'OPENCLAW_CONTEXT', message: 'tenantId and userId required for OpenClaw child' },
      };
    }

    const childIntent = `mission_tool:${toolName}`;
    const { statusPromise } = await mod.spawnChildAgent(missionId, childIntent, {
      tenantId,
      userId,
      parentAgentRunId: ctx.parentAgentRunId ?? null,
      correlationId: ctx.correlationId ?? ctx.missionId ?? null,
      skills: [`mission_tool:${toolName}`],
    });

    const outcome = await statusPromise;
    const ok = outcome?.status === 'completed';
    return {
      status: ok ? 'ok' : 'failed',
      ...(ok
        ? { output: { openclaw: true, toolName, data: outcome?.data, summary: outcome?.summary } }
        : {}),
      ...(!ok
        ? { error: { code: 'OPENCLAW_CHILD_FAILED', message: outcome?.error || 'child failed' } }
        : {}),
    };
  } catch (e) {
    return {
      status: 'failed',
      error: {
        code: 'OPENCLAW_IMPORT',
        message: e?.message || String(e),
      },
    };
  }
}

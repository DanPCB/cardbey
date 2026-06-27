/**
 * Shared wrapper for business runtime tool executors.
 */

import { validateBusinessOperationContext } from '../../business/businessGovernance.js';
import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} opts
 * @param {string} opts.toolName
 * @param {object} [opts.input]
 * @param {object} [opts.context]
 * @param {(args: { prisma: object, input: object, context: object, governance: object }) => Promise<object>} opts.handler
 */
export async function executeBusinessTool({ toolName, input = {}, context = {}, handler }) {
  const governance = await validateBusinessOperationContext({ input, context, toolName });
  if (!governance.ok) {
    return {
      status: 'blocked',
      blocker: governance.blocker,
      output: { ok: false, toolName, ...governance.blocker },
    };
  }

  const prisma = getPrismaClient();

  try {
    const result = await handler({
      prisma,
      input,
      context,
      governance,
    });
    return {
      status: 'ok',
      output: {
        ok: true,
        toolName,
        storeId: governance.storeId,
        runtimeExecutionId: governance.runtimeExecutionId,
        missionId: governance.missionId,
        ...result,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: err?.code || 'BUSINESS_OP_FAILED',
        message: err?.message || String(err),
      },
      output: { ok: false, toolName },
    };
  }
}

/**
 * Phase 2 placeholder — honest blocker for not-yet-implemented actions.
 */
export function businessPhase2Blocker(toolName) {
  return async function execute(input = {}, context = {}) {
    const governance = await validateBusinessOperationContext({ input, context, toolName });
    if (!governance.ok) {
      return {
        status: 'blocked',
        blocker: governance.blocker,
        output: { ok: false, toolName },
      };
    }
    return {
      status: 'blocked',
      reason: 'phase_2',
      output: {
        ok: false,
        toolName,
        message: `${toolName} is registered but scheduled for Phase 2`,
        phase: 2,
      },
    };
  };
}

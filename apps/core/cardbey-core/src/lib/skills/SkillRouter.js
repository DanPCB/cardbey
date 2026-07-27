/**
 * Routes classified intents to registered skills or falls through to tool dispatch.
 * Skill execution always enters through Performer Runtime (Sprint 1).
 */

/** @typedef {import('./types.js').SkillRouterResult} SkillRouterResult */

export class SkillRouter {
  /**
   * @param {{ skillRegistry: import('./SkillRegistry.js').SkillRegistry, skillExecutor: import('./SkillExecutor.js').SkillExecutor }} deps
   */
  constructor({ skillRegistry, skillExecutor }) {
    this.skillRegistry = skillRegistry;
    this.skillExecutor = skillExecutor;
  }

  /**
   * @param {string} intentLabel
   * @param {object} ctx
   * @returns {Promise<SkillRouterResult>}
   */
  async route(intentLabel, ctx) {
    const label = String(intentLabel ?? '').trim();
    const skillDef = this.skillRegistry.findByTrigger(label);

    if (!skillDef) {
      return { matched: false, dispatchedVia: 'tool' };
    }

    const missing = (skillDef.requiredContext ?? []).filter((key) => {
      const val = ctx?.[key];
      return val == null || (typeof val === 'string' && !val.trim());
    });

    if (missing.length > 0) {
      return {
        matched: true,
        skillName: skillDef.name,
        dispatchedVia: 'skill',
        result: {
          ok: false,
          reason: 'MISSING_CONTEXT',
          missing,
        },
      };
    }

    try {
      const { executeRuntimeAction } = await import(
        '../runtime/performerRuntime/executeRuntimeAction.js'
      );
      const { recordRuntimeAuthorityPathUsed } = await import(
        '../runtime/performerRuntime/runtimeAuthorityGuard.js'
      );

      recordRuntimeAuthorityPathUsed({
        route: 'skill_router',
        toolName: skillDef.name,
        userId: ctx?.userId ?? null,
        missionId: ctx?.missionId ?? null,
        source: 'skill_router',
        intentLabel: label,
      });

      const runtimeResult = await executeRuntimeAction({
        actionType: 'run_skill',
        missionId: ctx?.missionId ?? null,
        userId: ctx?.userId ?? null,
        storeId: ctx?.storeId ?? null,
        tenantId: ctx?.tenantId ?? null,
        source: 'skill_router',
        payload: {
          skillName: skillDef.name,
          intentLabel: label,
          context: {
            ...ctx,
            runtimeOwned: true,
            performerRuntimeOwned: true,
            source: 'skill_router',
          },
        },
      });

      const execution = runtimeResult.output?.skillExecution;
      if (!execution) {
        throw new Error(runtimeResult.error?.message ?? 'Skill runtime execution returned no result');
      }

      return {
        matched: true,
        skillName: skillDef.name,
        executionId: execution.id,
        result: execution,
        dispatchedVia: 'skill',
      };
    } catch (err) {
      console.error('[SkillRouter] executor error:', err?.message ?? err);
      return {
        matched: true,
        skillName: skillDef.name,
        dispatchedVia: 'skill',
        result: {
          id: null,
          skillName: skillDef.name,
          missionId: String(ctx?.missionId ?? ''),
          status: 'failed',
          currentStep: 0,
          stepResults: {},
          ctx,
          startedAt: new Date().toISOString(),
          canResume: false,
          failedReason: err?.message || String(err),
        },
      };
    }
  }
}

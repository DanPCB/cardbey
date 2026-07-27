// DANH: skill-runtime-phase2
/**
 * Runtime dispatch pre-check.
 *
 * Builds a SkillContext from the intake payload, asks the confidence-scored
 * `runtimeRegistry` to resolve an intent, and (on a match) runs the skill.
 * Returns `null` to signal "no runtime match — fall through to the legacy
 * keyword SkillRouter". Any error is swallowed and also falls through, so this
 * can never break the existing dispatch path.
 *
 * Adapted to the real Phase 1 API: the task sketch used `skill.state.skillId`,
 * but `SkillRuntime` exposes `getCheckpoint()` (whose `skillId` equals the
 * resolved intent) and `getState()`.
 */

import { runtimeRegistry } from './runtimeRegistry.js';
import { buildSkillContext, type IntakePayload, type PrismaLike } from './skillContextBuilder.js';
import type { Checkpoint } from './types.js';
import { isSkillRuntimeDispatchAllowed } from '../intake/intakeConsolidationFlags.js';
import { logSkillRuntimeDispatch } from '../intake/skillRuntimeTelemetry.js';

export interface RuntimeDispatchResult {
  matched: true;
  dispatchedVia: 'skill_runtime';
  skillId: string;
  state: string;
  result: Checkpoint;
}

export async function dispatchWithRuntime(
  intakePayload: IntakePayload,
  prisma: PrismaLike
): Promise<RuntimeDispatchResult | null> {
  const userMessage = String(intakePayload.userMessage ?? '').trim();
  const telemetryBase = {
    userMessage,
    storeId: intakePayload.storeId ?? null,
    userId: intakePayload.userId ?? null,
  };

  if (!isSkillRuntimeDispatchAllowed(userMessage)) {
    logSkillRuntimeDispatch({ ...telemetryBase, result: 'domain_blocked' });
    return null;
  }

  try {
    const ctx = await buildSkillContext(intakePayload, prisma);
    // DANH: fix-runtime-ownership
    ctx.metadata = {
      ...ctx.metadata,
      runtimeOwned: true,
      performerRuntimeOwned: true,
      source: 'skill_runtime',
    };
    const skill = await runtimeRegistry.dispatch(ctx);
    if (skill) {
      await skill.start();
      const checkpoint = skill.getCheckpoint();
      logSkillRuntimeDispatch({
        ...telemetryBase,
        result: 'matched',
        skillId: checkpoint.skillId,
        state: skill.getState(),
      });
      return {
        matched: true,
        dispatchedVia: 'skill_runtime',
        skillId: checkpoint.skillId,
        state: skill.getState(),
        result: checkpoint,
      };
    }
    logSkillRuntimeDispatch({ ...telemetryBase, result: 'no_match' });
  } catch (err) {
    // Non-fatal — fall through to legacy router.
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[SkillRuntime] dispatch error, falling through:', message);
    logSkillRuntimeDispatch({ ...telemetryBase, result: 'error', error: message });
  }
  return null; // signals: use legacy SkillRouter
}

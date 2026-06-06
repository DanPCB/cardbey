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
  try {
    const ctx = await buildSkillContext(intakePayload, prisma);
    const skill = await runtimeRegistry.dispatch(ctx);
    if (skill) {
      await skill.start();
      const checkpoint = skill.getCheckpoint();
      return {
        matched: true,
        dispatchedVia: 'skill_runtime',
        skillId: checkpoint.skillId,
        state: skill.getState(),
        result: checkpoint,
      };
    }
  } catch (err) {
    // Non-fatal — fall through to legacy router.
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[SkillRuntime] dispatch error, falling through:', message);
  }
  return null; // signals: use legacy SkillRouter
}

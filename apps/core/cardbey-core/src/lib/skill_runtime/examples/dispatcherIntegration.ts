/**
 * Example: how the Skill Runtime would slot into Cardbey's skill dispatch.
 *
 * This file is illustrative only — it is NOT wired into the live dispatcher.
 * It shows (1) how to build a registry with intent patterns + skill factories,
 * and (2) how a request handler would dispatch and run a skill, including
 * pause/resume across HTTP requests via a persisted checkpoint.
 *
 * ===========================================================================
 * DANH: skill-runtime-phase2 — STEP 0 AUDIT FINDINGS (call site)
 * ===========================================================================
 *
 * (a) WHERE SkillRouter.route() IS CALLED
 *     The ONLY call site is `src/routes/performerIntakeV2Routes.js` (~L660),
 *     inside the async direct-tool dispatch helper. Singleton is built in
 *     `src/lib/skills/index.js` and imported as `{ skillRouter }`.
 *         const skillRouterResult = await skillRouter.route(intentLabel, {
 *           missionId, storeId, userId, intentLabel, toolInput: payload,
 *           hydratedContext, blackboard: null,
 *         });
 *
 * (b) PAYLOAD SHAPE AT THE CALL SITE
 *     Available locals: intentLabel (the tool name string), dispatchMissionId,
 *     storeId, toolCtx.userId (= req.user?.id), payload (toolInput), req,
 *     hydratedContext. There is NO sessionId/userMessage here — `intentLabel`
 *     is the tool key, and missionId is the closest conversation handle.
 *
 * (c) RETURN VALUE / HOW IT IS USED
 *     route() resolves a SkillRouterResult: { matched, skillName?,
 *     executionId?, result?, dispatchedVia }. On matched===true the caller
 *     returns { toolResult, payload }; otherwise it falls through (after an
 *     existing try/catch) to the legacy tool dispatch.
 *
 * (d) GAPS vs. the dispatcherIntegration sketch / Phase 2 task sketch
 *     - The real `SkillContext` has no top-level storeId/sessionId/
 *       businessCategory; those go in `metadata` (see skillContextBuilder.ts).
 *     - `SkillRuntime` has no `.state` property nor `runtimeRegistry` in
 *       Phase 1; we added the `runtimeRegistry` singleton and use
 *       `getCheckpoint()` / `getState()` (see dispatchWithRuntime.ts).
 *     - `Business` has `type`, not `category`.
 *
 * ===========================================================================
 * PHASE 3 BLOCKER — route file is OFF-LIMITS
 * ===========================================================================
 * The call site is a ROUTE file (`src/routes/performerIntakeV2Routes.js`),
 * which the Phase 2 CONSTRAINTS explicitly forbid touching ("DO NOT touch:
 * ... routes"), and the LOCKED development-safety rule requires confirmation
 * before editing a critical live intake path. So the route is intentionally
 * NOT modified here. The runtime-side glue (`dispatchWithRuntime`) is complete,
 * tested, and ready. Applying the wiring is a 2-line, fully-guarded change:
 *
 *   // top of src/routes/performerIntakeV2Routes.js (imports)
 *   import { dispatchWithRuntime } from '../lib/skill_runtime/index.js';
 *   import { getPrismaClient } from '../lib/prisma.js';
 *
 *   // immediately BEFORE `const skillRouterResult = await skillRouter.route(`
 *   const runtimeResult = await dispatchWithRuntime(
 *     { intentLabel, storeId: storeId ?? toolCtx.storeId ?? null,
 *       userId: toolCtx.userId, missionId: dispatchMissionId },
 *     getPrismaClient()
 *   );
 *   if (runtimeResult) {
 *     return { toolResult: { status: 'ok', output: runtimeResult }, payload };
 *   }
 *   // ...existing legacy `skillRouter.route(...)` call remains untouched below.
 *
 * The legacy SkillRouter path stays 100% intact (runtime returns null on no
 * match or error → existing behavior). Apply only after explicit confirmation.
 *
 * To integrate via the registry directly (no DB), see `handleTurn` below.
 */

import { SkillRegistry } from '../registry.js';
import { SkillRuntime } from '../skill.js';
import {
  InMemoryCheckpointStore,
  type CheckpointStore,
} from '../checkpoint_store.js';
import {
  createPromotionPattern,
  setupLoyaltyProgramPattern,
  LOYALTY_INTENT,
  PROMOTION_INTENT,
} from '../patterns.js';
import type { SkillContext, Step } from '../types.js';

// ── Example skill factories ─────────────────────────────────────────────────
// Real skills would call Cardbey services in their step executors; these are
// minimal, side-effect-light stand-ins that demonstrate the structure.

function loyaltySteps(): Step[] {
  return [
    {
      id: 'define_tiers',
      name: 'Define loyalty tiers',
      execute: async () => ({ tiers: ['bronze', 'silver', 'gold'] }),
    },
    {
      id: 'configure_points',
      name: 'Configure points rules',
      execute: async () => ({ pointsPerDollar: 1 }),
    },
    {
      id: 'enroll_segments',
      name: 'Enroll existing segments',
      execute: async (ctx) => ({ enrolled: ctx.existingSegments ?? [] }),
    },
  ];
}

function promotionSteps(): Step[] {
  return [
    {
      id: 'draft_offer',
      name: 'Draft offer',
      execute: async () => ({ draftId: 'offer_draft_1' }),
    },
    {
      id: 'set_discount',
      name: 'Set discount terms',
      execute: async () => ({ percentOff: 20 }),
    },
  ];
}

/**
 * Build a registry with Cardbey's loyalty + promotion skills. A
 * `CheckpointStore` is threaded into every runtime so pause/resume survives
 * across requests.
 */
export function buildSkillRegistry(store: CheckpointStore): SkillRegistry {
  const registry = new SkillRegistry();

  registry.register({
    intent: LOYALTY_INTENT,
    patterns: [setupLoyaltyProgramPattern],
    factory: (context) =>
      new SkillRuntime(
        `${LOYALTY_INTENT}:${context.conversationId}`,
        LOYALTY_INTENT,
        loyaltySteps(),
        context,
        { store }
      ),
  });

  registry.register({
    intent: PROMOTION_INTENT,
    patterns: [createPromotionPattern],
    factory: (context) =>
      new SkillRuntime(
        `${PROMOTION_INTENT}:${context.conversationId}`,
        PROMOTION_INTENT,
        promotionSteps(),
        context,
        { store }
      ),
  });

  return registry;
}

// ── Example request handlers ────────────────────────────────────────────────

interface Session {
  userId: string;
  id: string;
}

// Placeholders for the real Cardbey data accessors.
declare function userHasProducts(userId: string): Promise<boolean>;
declare function getSegments(userId: string): Promise<string[]>;

/**
 * Replaces the current keyword-based dispatch. Builds the context, resolves the
 * correct intent, and starts the skill.
 */
export async function handleTurn(
  registry: SkillRegistry,
  session: Session,
  query: string
): Promise<{ dispatched: boolean; intent?: string; skillId?: string }> {
  const context: SkillContext = {
    query,
    userId: session.userId,
    conversationId: session.id,
    userHasProducts: await userHasProducts(session.userId),
    existingSegments: await getSegments(session.userId),
    metadata: {},
  };

  const skill = await registry.dispatch(context);
  if (!skill) {
    // Fall through to the legacy tool dispatch here in a real integration.
    return { dispatched: false };
  }

  await skill.start();
  return { dispatched: true, intent: skill.intent, skillId: skill.id };
}

/**
 * Resume a previously-paused skill on a later HTTP request. The runtime is
 * rebuilt from its persisted checkpoint; the registry factory supplies the
 * step definitions (functions can't be serialized).
 */
export async function resumeSkill(
  registry: SkillRegistry,
  store: CheckpointStore,
  skillId: string,
  intent: string,
  context: SkillContext
): Promise<SkillRuntime | null> {
  const checkpoints = await store.list(skillId);
  if (checkpoints.length === 0) return null;

  const skill = registry.get(intent);
  if (!skill) return null;

  // Use the factory only for its step definitions; restore live state from the
  // persisted checkpoint.
  const fresh = skill.factory(context);
  const runtime = SkillRuntime.fromCheckpoint(checkpoints[0], fresh.steps, { store });
  await runtime.resume();
  return runtime;
}

// Convenience for ad-hoc local runs / docs.
export function buildExampleRegistry(): SkillRegistry {
  return buildSkillRegistry(new InMemoryCheckpointStore());
}

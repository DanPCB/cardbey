/**
 * Phase 2.3-B — Critical Pipeline Write Hardening, Step 6: atomic mission creation bundle.
 *
 * When PERFORMER_PIPELINE_WRITE_HARDENING is ON, creation-phase writes commit in a single
 * interactive transaction (all-or-nothing). When OFF, preserves the legacy sequential behavior.
 *
 * IN SCOPE (atomic when flag ON):
 *   - missionPipeline.create
 *   - MissionPipelineStep insert-missing
 *   - initial progressTotalSteps update
 *   - requested → planned → queued|awaiting_confirmation transitions
 *   - missionRun.create (when runParams provided — POST /api/missions path)
 *
 * OUT OF SCOPE (remain best-effort / outside tx):
 *   - shadow Mission.upsert (FK lookups, non-fatal)
 *   - guest shadow user provisioning
 *   - runner FSM writes (Step 5 safePipelineUpdate)
 *   - autonomous retry loops (Step 6 is txn-only)
 *
 * HARD CONSTRAINTS: no Mission FSM semantic changes, no transition table changes, no execution
 * authority changes, no dispatchTool changes.
 */

import { getPrismaClient } from './prisma.js';
import { isPerformerPipelineWriteHardeningEnabled } from './broker/brokerFlags.js';
import {
  buildStepConfigsForMissionPipeline,
  createMissionPipelineCore,
  ensureShadowMissionRowBestEffort,
} from './missionPipelineService.js';
import { createMissionRunCore } from './missionRouter.js';
import { runMissionCreateBurst } from './mission/missionCreateBurst.js';

/** SQLite creation bundle — bounded wait under contention (no retry loop). */
const CREATION_TX_TIMEOUT_MS = 30_000;

/**
 * Create MissionPipeline (+ optional MissionRun) with atomic creation-phase writes when hardened.
 *
 * @param {{
 *   pipelineParams: Parameters<typeof import('./missionPipelineService.js').createMissionPipeline>[0],
 *   runParams?: Parameters<typeof import('./missionRouter.js').createMissionRun>[0] | null,
 * }} bundle
 * @returns {Promise<{ result: { id: string, status: string, stepsCreated: number }, run: object|null }>}
 */
async function createMissionCreationBundleImpl({ pipelineParams, runParams = null }) {
  const prisma = getPrismaClient();
  const { stepConfigs, effectiveRequiresConfirmation, mode } = buildStepConfigsForMissionPipeline(
    pipelineParams,
  );

  const runPipelineCore = (db) =>
    createMissionPipelineCore(db, pipelineParams, {
      stepConfigs,
      effectiveRequiresConfirmation,
      mode,
    });

  if (!isPerformerPipelineWriteHardeningEnabled()) {
    const result = await runPipelineCore(prisma);
    await ensureShadowMissionRowBestEffort(prisma, result, pipelineParams);
    const run = runParams ? await createMissionRunCore(prisma, runParams) : null;
    return { result, run };
  }

  const { result, run } = await prisma.$transaction(
    async (tx) => {
      const pipelineResult = await runPipelineCore(tx);
      const missionRun = runParams ? await createMissionRunCore(tx, runParams) : null;
      return { result: pipelineResult, run: missionRun };
    },
    { timeout: CREATION_TX_TIMEOUT_MS },
  );

  // Shadow Mission row is best-effort and uses pre-tx user lookups — after commit only.
  await ensureShadowMissionRowBestEffort(prisma, result, pipelineParams);
  return { result, run };
}

export async function createMissionCreationBundle(bundle) {
  return runMissionCreateBurst('bundle', () => createMissionCreationBundleImpl(bundle));
}

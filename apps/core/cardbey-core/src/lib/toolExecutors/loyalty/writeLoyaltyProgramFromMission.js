/**
 * Governed mission-write lane for loyalty program apply.
 */

import { getPrismaClient } from '../../prisma.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import { hasRuntimeAuthorityContext } from '../../runtime/performerRuntime/runtimeAuthorityGuard.js';
import { advanceProactivePipelineStep } from '../../orchestrator/advanceProactivePipelineStep.js';
import scheduleLoyaltyCampaign from './schedule_loyalty_campaign.js';
import { assertStoreOwnership, resolveDraftStampThreshold } from './loyaltyProgramDraft.js';
import { emitLoyaltyProgramTelemetry, LOYALTY_TELEMETRY } from './loyaltyProgramTelemetry.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nestedOutput(result) {
  if (!result || typeof result !== 'object') return {};
  const bag = result.output && typeof result.output === 'object' ? result.output : result;
  return bag && typeof bag === 'object' ? bag : {};
}

/**
 * @param {{
 *   missionId?: string | null;
 *   storeId: string;
 *   userId: string;
 *   tenantId?: string | null;
 *   draft: object;
 *   source?: string;
 *   runtimeContext?: object;
 *   artifactId?: string | null;
 * }} params
 */
export async function writeLoyaltyProgramFromMission(params) {
  const storeId = pickString(params.storeId);
  const userId = pickString(params.userId);
  const tenantId = pickString(params.tenantId, userId);
  const missionId = pickString(params.missionId);
  const draft = params.draft && typeof params.draft === 'object' ? params.draft : {};
  const source = pickString(params.source, 'setup_loyalty_program');
  const runtimeContext = params.runtimeContext && typeof params.runtimeContext === 'object' ? params.runtimeContext : {};

  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_REQUESTED, {
    missionId,
    storeId,
    userId,
    source,
    toolKey: 'setup_loyalty_program',
  });

  if (!hasRuntimeAuthorityContext(runtimeContext)) {
    emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_FAILED, {
      missionId,
      storeId,
      reason: 'runtime_authority_missing',
    });
    return {
      ok: false,
      status: 'blocked',
      blocker: {
        code: 'RUNTIME_AUTHORITY_REQUIRED',
        message: 'Loyalty apply must run through Performer runtime authority.',
      },
    };
  }

  const access = await assertStoreOwnership({ storeId, userId });
  if (!access.ok) {
    emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_FAILED, {
      missionId,
      storeId,
      reason: access.blocker?.code ?? 'access_denied',
    });
    return access;
  }

  const prisma = getPrismaClient();
  const programName = pickString(draft.programName, `${access.store.name} Rewards`);
  const requiredStamps = Math.max(1, resolveDraftStampThreshold(draft) ?? 9);
  const reward = pickString(draft.reward, '1 free item');

  let program;
  let writeAction = 'create';
  try {
    const existing = await prisma.loyaltyProgram.findFirst({
      where: { storeId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (existing?.id) {
      writeAction = 'update';
      program = await prisma.loyaltyProgram.update({
        where: { id: existing.id },
        data: { name: programName, stampsRequired: requiredStamps, reward },
      });
    } else {
      program = await prisma.loyaltyProgram.create({
        data: { tenantId, storeId, name: programName, stampsRequired: requiredStamps, reward },
      });
    }
  } catch (err) {
    emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_FAILED, {
      missionId,
      storeId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      status: 'failed',
      blocker: { code: 'LOYALTY_WRITE_FAILED', message: 'Could not save loyalty program.' },
    };
  }

  const offers = Array.isArray(draft.offers) ? draft.offers : [];
  const scheduleResult = await scheduleLoyaltyCampaign({ storeId, offers }, { userId, storeId });
  const promoOut = nestedOutput(scheduleResult);
  const storePromoId = pickString(promoOut.promoId) || null;

  let suitcaseItemId = null;
  try {
    const { saveGeneratedLoyaltyToSuitcase } = await import('./saveGeneratedLoyaltyToSuitcase.js');
    const { buildGeneratedLoyaltyProgramArtifact } = await import('./generatedLoyaltyProgramService.js');
    const artifact = await buildGeneratedLoyaltyProgramArtifact({
      missionId,
      storeId,
      draft: {
        ...draft,
        programName,
        reward,
        requiredStamps,
        stampThreshold: requiredStamps,
        loyaltyProgramId: program.id,
        phase: 'activated',
      },
    });
    const suitcaseResult = await saveGeneratedLoyaltyToSuitcase({
      ownerId: userId,
      missionId,
      storeId,
      artifact,
    });
    suitcaseItemId = suitcaseResult?.item?.id ?? null;
  } catch (err) {
    console.warn('[writeLoyaltyProgramFromMission] suitcase save failed:', err?.message ?? err);
  }

  const writeResult = {
    missionId: missionId || null,
    toolKey: 'setup_loyalty_program',
    writeSource: 'performer_runtime',
    appliedBy: userId,
    loyaltyProgramId: program.id,
    storePromoId,
    artifactId: pickString(params.artifactId, draft.artifactId) || null,
    writeAction,
    suitcaseItemId,
  };

  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.MISSION_WRITE, writeResult);

  if (missionId) {
    try {
      const row = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: { metadataJson: true, executionMode: true },
      });
      const meta =
        row?.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
          ? row.metadataJson
          : {};
      const stepOutputs =
        meta.stepOutputs && typeof meta.stepOutputs === 'object' && !Array.isArray(meta.stepOutputs)
          ? meta.stepOutputs
          : {};
      const prior =
        stepOutputs.setup_loyalty_program &&
        typeof stepOutputs.setup_loyalty_program === 'object' &&
        !Array.isArray(stepOutputs.setup_loyalty_program)
          ? stepOutputs.setup_loyalty_program
          : {};
      const appliedOutput = {
        ...prior,
        phase: 'applied',
        status: 'completed',
        loyaltyProgramDraft: draft,
        writeResult,
      };
      await advanceProactivePipelineStep(prisma, {
        missionId,
        executionMode: row?.executionMode,
        data: {
          status: 'completed',
          runState: 'done',
          metadataJson: {
            ...meta,
            stepOutputs: { ...stepOutputs, setup_loyalty_program: appliedOutput },
            loyaltyWriteResult: writeResult,
          },
        },
        source: 'write_loyalty_program_from_mission',
        correlationId: missionId,
      });
    } catch {
      /* mission metadata patch is best-effort */
    }
  }

  emitLoyaltyProgramTelemetry(LOYALTY_TELEMETRY.APPLY_SUCCESS, writeResult);

  return {
    ok: true,
    status: 'completed',
    programId: program.id,
    promo: promoOut,
    suitcaseItemId,
    writeResult,
    executionState: EXECUTION_STATES.EXECUTED,
  };
}

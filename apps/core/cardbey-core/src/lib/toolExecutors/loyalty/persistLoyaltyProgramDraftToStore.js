/**
 * Persist loyalty program draft to the store's LoyaltyProgram record (draft lane).
 * Activate=false: upsert program only. Activate=true: also schedule launch promo.
 */

import { getPrismaClient } from '../../prisma.js';
import { assertStoreOwnership, applyCanonicalLoyaltyDraftFields, resolveDraftStampThreshold } from './loyaltyProgramDraft.js';
import scheduleLoyaltyCampaign from './schedule_loyalty_campaign.js';
import { emitLoyaltyProgramTelemetry, LOYALTY_TELEMETRY } from './loyaltyProgramTelemetry.js';
import { resolveLoyaltyPersistencePayload } from './loyaltyPersistencePayload.js';
import { recordPublishedTopology } from '../../documentTopology/documentTopologyRevisionService.js';
import { logLoyaltyContractDiagnostic } from '../../loyalty/loyaltyContractDiagnostics.js';

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
 *   storeId: string;
 *   userId: string;
 *   tenantId?: string | null;
 *   missionId?: string | null;
 *   draft: Record<string, unknown>;
 *   activate?: boolean;
 *   source?: string;
 * }} params
 */
export async function persistLoyaltyProgramDraftToStore(params) {
  const storeId = pickString(params.storeId);
  const userId = pickString(params.userId);
  const tenantId = pickString(params.tenantId, userId);
  const missionId = pickString(params.missionId);
  const source = pickString(params.source, 'loyalty_topology_persist');
  const activate = params.activate === true;
  const draft = applyCanonicalLoyaltyDraftFields(
    params.draft && typeof params.draft === 'object' ? params.draft : {},
  );

  if (!storeId || !userId) {
    return {
      ok: false,
      status: 'failed',
      error: { code: 'MISSING_CONTEXT', message: 'Store and user are required to save loyalty draft.' },
    };
  }

  const access = await assertStoreOwnership({ storeId, userId });
  if (!access.ok) {
    return { ok: false, status: 'blocked', blocker: access.blocker };
  }

  const prisma = getPrismaClient();
  const persisted = resolveLoyaltyPersistencePayload(draft);
  logLoyaltyContractDiagnostic('loyalty_persistence_payload', draft, {
    missionId,
    storeId,
  });
  const programName = pickString(draft.programName, `${access.store.name} Rewards`, persisted.name);
  const stampsRequired = persisted.stampsRequired;
  const reward = persisted.reward;

  let program;
  let writeAction = 'create';
  try {
    const existing = await prisma.loyaltyProgram.findFirst({
      where: { storeId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const data = {
      name: programName,
      stampsRequired,
      reward,
      ruleJson: persisted.ruleJson,
      cardTopologyJson: persisted.cardTopologyJson,
      layoutSource: persisted.layoutSource,
      layoutConfidence: persisted.layoutConfidence,
      layoutReviewedAt: persisted.layoutReviewedAt,
      layoutReviewedBy: persisted.layoutReviewedBy,
    };
    if (existing?.id) {
      writeAction = 'update';
      program = await prisma.loyaltyProgram.update({
        where: { id: existing.id },
        data,
      });
    } else {
      program = await prisma.loyaltyProgram.create({
        data: { tenantId, storeId, ...data },
      });
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: {
        code: 'LOYALTY_DRAFT_SAVE_FAILED',
        message: err instanceof Error ? err.message : 'Could not save loyalty program draft.',
      },
    };
  }

  const readBack = await prisma.loyaltyProgram.findUnique({
    where: { id: program.id },
    select: {
      id: true,
      ruleJson: true,
      cardTopologyJson: true,
      layoutSource: true,
      layoutConfidence: true,
      stampsRequired: true,
      reward: true,
    },
  });
  logLoyaltyContractDiagnostic(
    'loyalty_persistence_read_back',
    {
      rule: readBack?.ruleJson ?? null,
      cardTopology: readBack?.cardTopologyJson ?? null,
      layoutSource: readBack?.layoutSource ?? null,
      requiredStamps: readBack?.stampsRequired ?? null,
      reward: readBack?.reward ?? null,
    },
    { missionId, storeId },
  );

  if (persisted.cardTopologyJson && program?.id) {
    void recordPublishedTopology(program.id, persisted.cardTopologyJson, {
      createdBy: persisted.layoutReviewedBy ?? null,
      loyaltyProgramId: program.id,
    }).catch(() => {});
  }

  let promoOut = null;
  let storePromoId = null;
  if (activate) {
    const offers = Array.isArray(draft.offers) ? draft.offers : [];
    const scheduleResult = await scheduleLoyaltyCampaign({ storeId, offers }, { userId, storeId });
    promoOut = nestedOutput(scheduleResult);
    storePromoId = pickString(promoOut.promoId) || null;
  }

  const writeResult = {
    missionId: missionId || null,
    loyaltyProgramId: program.id,
    storeId,
    writeAction,
    stampsRequired,
    reward,
    activated: activate,
    storePromoId,
    source,
  };

  emitLoyaltyProgramTelemetry(
    activate ? LOYALTY_TELEMETRY.APPLY_SUCCESS : LOYALTY_TELEMETRY.DRAFT_READY,
    writeResult,
  );

  return {
    ok: true,
    status: activate ? 'activated' : 'draft_saved',
    programId: program.id,
    loyaltyProgramId: program.id,
    program,
    promo: promoOut,
    writeResult,
    loyaltyProgramDraft: {
      ...draft,
      programName,
      requiredStamps: stampsRequired,
      stampThreshold: stampsRequired,
      reward,
      rule: persisted.ruleJson,
      cardTopology: persisted.cardTopologyJson,
      storeId,
      loyaltyProgramId: program.id,
      phase: activate ? 'activated' : 'awaiting_owner_review',
    },
  };
}

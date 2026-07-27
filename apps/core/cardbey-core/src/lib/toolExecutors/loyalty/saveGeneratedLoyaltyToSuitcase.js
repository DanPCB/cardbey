/**
 * Save generated loyalty program package to owner Suitcase.
 */

import { createSuitcaseItem } from '../../../services/suitcase/suitcaseItemService.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{
 *   ownerId: string;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   artifact: Record<string, unknown>;
 * }} params
 */
export async function saveGeneratedLoyaltyToSuitcase(params) {
  const ownerId = pickString(params.ownerId);
  if (!ownerId) {
    return { ok: false, error: { code: 'MISSING_OWNER', message: 'Owner id is required.' } };
  }

  const artifact =
    params.artifact && typeof params.artifact === 'object' ? params.artifact : null;
  if (!artifact) {
    return { ok: false, error: { code: 'MISSING_ARTIFACT', message: 'Loyalty artifact is required.' } };
  }

  const payload = artifact.payload && typeof artifact.payload === 'object' ? artifact.payload : {};
  const suitcaseMeta =
    payload.suitcase && typeof payload.suitcase === 'object' ? payload.suitcase : {};
  const programName =
    pickString(payload.programName, payload.program?.programName, artifact.title) || 'Loyalty Program';
  const storeId = pickString(params.storeId, artifact.storeId, payload.store?.id);
  const missionId = pickString(params.missionId, artifact.missionId);

  const title =
    pickString(suitcaseMeta.filename, `${programName}.cb-loyalty`) || `${programName}.cb-loyalty`;

  const idempotencyKey =
    ownerId && storeId
      ? `loyalty-gen:${ownerId}:${storeId}`
      : missionId
        ? `loyalty-gen:${ownerId}:${missionId}`
        : undefined;

  const result = await createSuitcaseItem({
    ownerId,
    sourceType: 'artifact',
    contentType: 'json',
    title,
    storeId: storeId || undefined,
    missionId: missionId || undefined,
    tags: ['loyalty', 'card_design', 'generated_loyalty_program'],
    summary: `Loyalty program — ${pickString(payload.reward, 'reward')} after ${payload.stampThreshold ?? '?'} stamps`,
    metadata: {
      artifactType: 'generated_loyalty_program',
      suitcasePath: 'Loyalty Programs',
      programId: payload.program?.id ?? payload.loyaltyProgramId ?? null,
    },
    payload: {
      artifact,
      program: payload.program ?? null,
      branding: payload.branding ?? null,
      qr: payload.qr ?? null,
      theme: payload.theme ?? null,
      generatedAssets: payload.generatedAssets ?? null,
      missionId,
      storeId,
    },
    thumbnailUrl:
      pickString(payload.branding?.logoUrl, payload.generatedAssets?.qrPngUrl) || undefined,
    idempotencyKey,
    refreshOnIdempotency: true,
  });

  return {
    ok: true,
    item: result.item,
    created: result.created,
    skipped: result.skipped,
    updated: result.updated === true,
  };
}

/**
 * Deterministic loyalty contract recovery from frozen mission evidence.
 */

import { buildLoyaltyCreationContract, loyaltyCreationContractToDraft } from './loyaltyCreationContract.js';
import { writeMetadata, readMetadata } from '../persistence/metadataWriter.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function mergeEvidenceSources(meta) {
  const sources = [];
  if (meta.creationContract) sources.push({ creationContract: meta.creationContract });
  if (meta.preseededDraft) sources.push(meta.preseededDraft);
  if (meta.executionDraft) sources.push(meta.executionDraft);
  if (meta.attachmentAnalysis?.preseededDraft) sources.push(meta.attachmentAnalysis.preseededDraft);
  if (meta.ownerInput) sources.push(meta.ownerInput);
  if (meta.topologyDecisionEvent) sources.push(meta.topologyDecisionEvent);

  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    Object.assign(merged, source);
    if (source.rule) merged.rule = source.rule;
    if (source.cardTopology) merged.cardTopology = source.cardTopology;
    if (source.creationContract) merged.priorContract = source.creationContract;
  }
  return merged;
}

/**
 * @param {string} missionId
 * @param {{ userId?: string | null; requestId?: string | null }} [ctx]
 */
export async function recoverLoyaltyCreationContract(missionId, ctx = {}) {
  const mid = pickString(missionId);
  if (!mid) {
    return { ok: false, code: 'VALIDATION', message: 'missionId is required' };
  }

  const meta = asRecord(await readMetadata(mid));
  if (!meta || !Object.keys(meta).length) {
    return {
      ok: false,
      code: 'MISSION_RECORD_NOT_FOUND',
      message: 'No mission metadata available for recovery.',
      missionId: mid,
    };
  }

  const evidence = mergeEvidenceSources(meta);
  if (!evidence.rule && !evidence.cardTopology && !evidence.priorContract) {
    return {
      ok: false,
      code: 'INSUFFICIENT_EVIDENCE',
      message: 'Insufficient frozen evidence to recover loyalty contract. Re-run card analysis.',
      missionId: mid,
    };
  }

  const storeId = pickString(meta.storeId, evidence.storeId, meta.targetId);
  const contract = buildLoyaltyCreationContract({
    storeId,
    preseededDraft: evidence,
    userMessage: pickString(meta.goal, evidence.userMessage),
    hasAttachmentEvidence:
      evidence.extractedFromImage === true ||
      Boolean(evidence.cardTopology) ||
      Boolean(evidence.rule),
    storeContext: meta.storeContext ?? meta.executionContext ?? {},
  });

  const draft = loyaltyCreationContractToDraft(contract);
  const metadata = await writeMetadata(mid, {
    creationContract: contract,
    preseededDraft: draft,
    executionDraft: draft,
    loyaltyContractRecoveredAt: new Date().toISOString(),
    loyaltyContractRecoveredBy: ctx.userId ?? null,
    loyaltyContractRecoveryRequestId: ctx.requestId ?? null,
  });

  return {
    ok: true,
    missionId: mid,
    contract,
    draft,
    metadata,
    audit: {
      recoveredAt: new Date().toISOString(),
      recoveredBy: ctx.userId ?? null,
      evidenceKeys: Object.keys(evidence),
    },
  };
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export default { recoverLoyaltyCreationContract };

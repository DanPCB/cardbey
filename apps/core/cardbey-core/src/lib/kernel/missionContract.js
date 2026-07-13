/**
 * Mission contract freeze helpers.
 * The contract is stored in mission metadata and must remain immutable after freeze.
 */

import { randomUUID } from 'node:crypto';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';
import { computeTopologyHash } from '../mission/topologyHash.js';

export const MISSION_FAMILIES = new Set([
  'campaign',
  'loyalty',
  'offer',
  'store',
  'catalog',
  'menu',
  'signage',
  'video',
  'content',
  'booking',
  'generic',
]);

export const CONTRACT_ALLOWED_CAPABILITIES = Object.freeze([
  'LoadContext',
  'Analyze',
  'Infer',
  'Ask',
  'Generate',
  'Validate',
  'Persist',
  'Publish',
]);

const TOOL_TO_FAMILY = new Map([
  ['create_campaign', 'campaign'],
  ['launch_campaign', 'campaign'],
  ['setup_loyalty_program', 'loyalty'],
  ['create_loyalty_program', 'loyalty'],
  ['create_store', 'store'],
  ['import_catalog', 'catalog'],
  ['ingest_asset_for_intent_detection', 'content'],
]);

const TOOL_TO_EXPECTED_ASSET_TYPES = new Map([
  ['create_campaign', ['campaign_package']],
  ['launch_campaign', ['campaign_package']],
  ['setup_loyalty_program', ['generated_loyalty_program', 'loyalty_program_draft']],
  ['create_loyalty_program', ['generated_loyalty_program', 'loyalty_program_draft']],
  ['create_store', ['store']],
  ['import_catalog', ['catalog']],
]);

export class MissionContractAssertionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MissionContractAssertionError';
    this.code = code;
  }
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function deriveMissionFamily({ tool, missionType } = {}) {
  const fromTool = TOOL_TO_FAMILY.get(String(tool ?? '').trim());
  if (fromTool) return fromTool;
  const mt = String(missionType ?? '').trim().toLowerCase();
  if (MISSION_FAMILIES.has(mt)) return mt;
  if (mt.includes('campaign')) return 'campaign';
  if (mt.includes('loyalty')) return 'loyalty';
  if (mt.includes('store')) return 'store';
  if (mt.includes('catalog')) return 'catalog';
  return 'generic';
}

export function expectedAssetTypesForTool(tool) {
  return TOOL_TO_EXPECTED_ASSET_TYPES.get(String(tool ?? '').trim()) ?? ['unknown'];
}

export function buildMissionContract(input = {}) {
  const missionFamily = deriveMissionFamily(input);
  const userGoalSnapshot = pickString(input.userGoalSnapshot, input.intentText, input.userMessage) ?? '';
  return Object.freeze({
    contractId: pickString(input.contractId) ?? `ctr_${randomUUID()}`,
    missionId: pickString(input.missionId) ?? '',
    frozenAt: pickString(input.frozenAt) ?? new Date().toISOString(),
    missionFamily,
    selectedAlternativeId: pickString(input.selectedAlternativeId, input.tool) ?? missionFamily,
    userGoalSnapshot,
    evidenceId: pickString(input.evidenceId) ?? 'evidence:unknown',
    reasoningFrameId: pickString(input.reasoningFrameId, input.tool) ?? 'reasoning:legacy',
    decisionId: pickString(input.decisionId, input.tool) ?? `decision_${missionFamily}`,
    executionContext: {
      storeId: pickString(input.executionContext?.storeId, input.storeId),
      spaceId: pickString(input.executionContext?.spaceId, input.storeId),
      userId: pickString(input.executionContext?.userId, input.userId),
      storeLocked:
        input.executionContext?.storeLocked === true ||
        input.storeLocked === true ||
        Boolean(pickString(input.executionContext?.storeId, input.storeId)),
      selectionMethod: pickString(input.executionContext?.selectionMethod, input.selectionMethod),
    },
    builderId:
      pickString(input.builderId) ??
      (missionFamily === 'loyalty' ? 'loyaltyTopologyBuilder' : 'multiAgentCompiler'),
    allowedCapabilities: [...CONTRACT_ALLOWED_CAPABILITIES],
    expectedAssetTypes: [...expectedAssetTypesForTool(input.tool)],
    uiCardFamily:
      pickString(input.uiCardFamily) ??
      (missionFamily === 'loyalty' || missionFamily === 'campaign' ? 'topology_review' : 'mission_review'),
    publishPipelineId:
      pickString(input.publishPipelineId) ??
      (missionFamily === 'loyalty'
        ? 'publish_loyalty_program'
        : missionFamily === 'campaign'
          ? 'publish_campaign'
          : `publish_${missionFamily}`),
    kernelVersion: pickString(input.kernelVersion) ?? '0.1.0',
    evidenceGraphId: pickString(input.evidenceGraphId) ?? null,
    evidenceGraphVersion:
      typeof input.evidenceGraphVersion === 'number' && input.evidenceGraphVersion > 0
        ? input.evidenceGraphVersion
        : null,
    topologyHash: pickString(input.topologyHash) ?? null,
  });
}

export function assertMissionContractConsistency(existingContract, candidate = {}) {
  if (!existingContract || typeof existingContract !== 'object') return;
  const expectedFamily = deriveMissionFamily(candidate);
  if (
    expectedFamily &&
    expectedFamily !== 'generic' &&
    String(existingContract.missionFamily ?? '').trim() &&
    String(existingContract.missionFamily).trim() !== expectedFamily
  ) {
    throw new MissionContractAssertionError(
      'MISSION_FAMILY_FROZEN',
      `Mission contract already frozen as ${existingContract.missionFamily}, cannot switch to ${expectedFamily}`,
    );
  }

  const existingStoreId = pickString(existingContract.executionContext?.storeId);
  const candidateStoreId = pickString(candidate.executionContext?.storeId, candidate.storeId);
  if (existingStoreId && candidateStoreId && existingStoreId !== candidateStoreId) {
    throw new MissionContractAssertionError(
      'MISSION_STORE_FROZEN',
      `Mission contract already locked to store ${existingStoreId}, cannot switch to ${candidateStoreId}`,
    );
  }

  const existingEvidenceId = pickString(existingContract.evidenceId);
  const candidateEvidenceId = pickString(candidate.evidenceId);
  if (existingEvidenceId && candidateEvidenceId && existingEvidenceId !== candidateEvidenceId) {
    throw new MissionContractAssertionError(
      'MISSION_EVIDENCE_FROZEN',
      `Mission contract already references evidence ${existingEvidenceId}, cannot switch to ${candidateEvidenceId}`,
    );
  }
}

export async function readMissionContract(missionId) {
  const meta = await readMetadata(missionId);
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta.missionContract ?? null : null;
}

export async function freezeMissionContract(missionId, input = {}) {
  const existing = await readMissionContract(missionId);
  if (existing) {
    assertMissionContractConsistency(existing, input);
    return existing;
  }
  const contract = buildMissionContract({ ...input, missionId });
  await writeMetadata(missionId, {
    missionContract: contract,
    expectedArtifactTypes: contract.expectedAssetTypes,
  });
  return contract;
}

/**
 * Re-baseline frozen topologyHash after owner-approved loyalty topology is authoritative.
 * Plan freeze may occur before vision extraction / HITL approval; persist must not drift-fail.
 *
 * @param {string} missionId
 * @param {Record<string, unknown> | null | undefined} topology
 * @param {{ evidenceGraphId?: string | null; evidenceGraphVersion?: number | null }} [graphMeta]
 */
export async function advanceFrozenMissionContractTopology(missionId, topology, graphMeta = {}) {
  const mid = pickString(missionId);
  if (!mid) return null;
  const existing = await readMissionContract(mid);
  if (!existing || !topology || typeof topology !== 'object') return existing;

  const nextHash = computeTopologyHash(topology);
  const graphId = pickString(graphMeta.evidenceGraphId);
  const graphVersion =
    typeof graphMeta.evidenceGraphVersion === 'number' && graphMeta.evidenceGraphVersion > 0
      ? graphMeta.evidenceGraphVersion
      : null;

  const unchanged =
    existing.topologyHash === nextHash &&
    (!graphId || existing.evidenceGraphId === graphId) &&
    (!graphVersion || existing.evidenceGraphVersion === graphVersion);
  if (unchanged) return existing;

  const patched = Object.freeze({
    ...existing,
    topologyHash: nextHash,
    topologyApprovedAt: new Date().toISOString(),
    ...(graphId ? { evidenceGraphId: graphId } : {}),
    ...(graphVersion ? { evidenceGraphVersion: graphVersion } : {}),
  });
  await writeMetadata(mid, { missionContract: patched });
  return patched;
}

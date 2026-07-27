/**
 * Artifact completion authority for topology missions.
 */

import { normalizeArtifact, isUsableArtifact } from '../artifacts/artifactContract.js';
import { matchesArtifactFamily } from './artifactRegistry.js';
import {
  normalizeCampaignPackageArtifact,
  synthesizeCampaignPackageFromToolOutputs,
} from './campaignPackageArtifact.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function matchesExpectedAssetType(artifact, expectedType) {
  return matchesArtifactFamily(artifact, expectedType);
}

function collectLoyaltyArtifactCandidates({ meta, nodeOutputs, toolOutputs, outputsJson }) {
  /** @type {unknown[]} */
  const candidates = [];
  const presentReview = toolOutputs['loyalty.present_review'];
  if (presentReview && typeof presentReview === 'object') {
    const row = /** @type {Record<string, unknown>} */ (presentReview);
    if (row.artifact && typeof row.artifact === 'object') candidates.push(row.artifact);
    if (row.ownerReviewArtifact && typeof row.ownerReviewArtifact === 'object') {
      candidates.push(row.ownerReviewArtifact);
    }
    if (Array.isArray(row.artifacts)) candidates.push(...row.artifacts);
  }
  for (const key of [
    'loyaltyProgramDraftArtifact',
    'generatedLoyaltyProgram',
    'loyaltyProgramDraft',
  ]) {
    if (nodeOutputs[key]) candidates.push(nodeOutputs[key]);
    if (meta[key]) candidates.push(meta[key]);
    if (outputsJson?.[key]) candidates.push(outputsJson[key]);
  }
  return candidates.filter(Boolean);
}

function collectCampaignPackageCandidates({ meta, nodeOutputs, toolOutputs, outputsJson }) {
  /** @type {unknown[]} */
  const candidates = [];
  const packageOut = toolOutputs.package_campaign_artifact;
  if (packageOut && typeof packageOut === 'object' && packageOut.artifact) {
    candidates.push(packageOut.artifact);
  }
  for (const key of ['campaignArtifact', 'campaignPackage']) {
    if (nodeOutputs[key]) candidates.push(nodeOutputs[key]);
    if (meta[key]) candidates.push(meta[key]);
    if (outputsJson?.[key]) candidates.push(outputsJson[key]);
  }
  const synthesized = synthesizeCampaignPackageFromToolOutputs(toolOutputs);
  if (synthesized) candidates.push(synthesized);
  return candidates.map((row) => normalizeCampaignPackageArtifact(row)).filter(Boolean);
}

export function listMissionArtifacts({ metadata, nodeRun, outputsJson } = {}) {
  const meta = asObject(metadata);
  const nodeOutputs = asObject(nodeRun?.outputs);
  const toolOutputs = asObject(nodeRun?.toolOutputs);
  const outputs = asObject(outputsJson);
  const all = [
    ...asArray(meta.missionDeliveredArtifacts),
    ...asArray(outputs.artifacts),
    ...asArray(nodeOutputs.artifacts),
    ...asArray(toolOutputs.artifacts),
    ...collectCampaignPackageCandidates({ meta, nodeOutputs, toolOutputs, outputsJson: outputs }),
    ...collectLoyaltyArtifactCandidates({ meta, nodeOutputs, toolOutputs, outputsJson: outputs }),
  ];

  return all
    .map((row) =>
      normalizeArtifact(
        row?.artifactType
          ? {
              ...row,
              type:
                row.artifactType === 'campaign_package'
                  ? 'campaign'
                  : row.artifactType === 'generated_loyalty_program' || row.artifactType === 'loyalty_program_draft'
                    ? 'text_asset'
                    : row.type ?? 'unknown',
              subtype: row.artifactType ?? row.subtype,
              metadata: {
                ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
                inlinePayload: row.payload ?? row.data ?? null,
              },
              url: row.url ?? row.previewUrl ?? null,
              status: row.status ?? 'ready',
              title: row.title ?? row.type ?? row.artifactType ?? 'Artifact',
            }
          : row,
      ),
    )
    .filter(Boolean);
}

export function resolveMissionArtifactAuthority({ contract, metadata, nodeRun, outputsJson } = {}) {
  const expectedAssetTypes = Array.isArray(contract?.expectedAssetTypes) ? contract.expectedAssetTypes : [];
  const artifacts = listMissionArtifacts({ metadata, nodeRun, outputsJson });
  const matched = artifacts.filter((artifact) => {
    if (expectedAssetTypes.length === 0) return true;
    return expectedAssetTypes.some((expectedType) => matchesExpectedAssetType(artifact, expectedType));
  });
  const usable = matched.some((artifact) => isUsableArtifact(artifact));
  return {
    expectedAssetTypes,
    artifacts,
    matchedArtifacts: matched,
    satisfied: expectedAssetTypes.length === 0 ? true : usable,
  };
}

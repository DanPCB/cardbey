/**
 * Artifact completion authority for topology missions.
 */

import { normalizeArtifact, isUsableArtifact } from '../artifacts/artifactContract.js';
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

const EXPECTED_ASSET_TYPE_ALIASES = {
  campaign_package: ['campaign_package', 'campaign'],
  campaign: ['campaign_package', 'campaign'],
};

function matchesExpectedAssetType(artifact, expectedType) {
  const subtype = String(artifact?.subtype ?? '').trim();
  const type = String(artifact?.type ?? '').trim();
  const aliases = EXPECTED_ASSET_TYPE_ALIASES[expectedType] ?? [expectedType];
  return aliases.includes(subtype) || aliases.includes(type);
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
  ];

  if (nodeOutputs.loyaltyProgramDraftArtifact) all.push(nodeOutputs.loyaltyProgramDraftArtifact);
  if (meta.loyaltyProgramDraftArtifact) all.push(meta.loyaltyProgramDraftArtifact);

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

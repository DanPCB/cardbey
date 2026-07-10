/**
 * Artifact completion authority for topology missions.
 */

import { normalizeArtifact, isUsableArtifact } from '../artifacts/artifactContract.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function listMissionArtifacts({ metadata, nodeRun, outputsJson } = {}) {
  const meta = asObject(metadata);
  const nodeOutputs = asObject(nodeRun?.outputs);
  const toolOutputs = asObject(nodeRun?.toolOutputs);
  const all = [
    ...asArray(meta.missionDeliveredArtifacts),
    ...asArray(outputsJson?.artifacts),
    ...asArray(nodeOutputs.artifacts),
    ...asArray(toolOutputs.artifacts),
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
    const subtype = String(artifact.subtype ?? '').trim();
    const type = String(artifact.type ?? '').trim();
    return expectedAssetTypes.length === 0 || expectedAssetTypes.includes(subtype) || expectedAssetTypes.includes(type);
  });
  const usable = matched.some((artifact) => isUsableArtifact(artifact));
  return {
    expectedAssetTypes,
    artifacts,
    matchedArtifacts: matched,
    satisfied: expectedAssetTypes.length === 0 ? true : usable,
  };
}

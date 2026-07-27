/**
 * Topology completion criteria — declarative success contract per workflow.
 * Criteria are topology-agnostic; loyalty/campaign/store supply definitions via topology or contract.
 */

import { registryEntryForMissionFamily, resolveCanonicalArtifactType } from './artifactRegistry.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @typedef {{
 *   type: string;
 *   mandatory?: boolean;
 * }} ArtifactCriterion
 *
 * @typedef {{
 *   type: string;
 *   mandatory?: boolean;
 * }} PersistedRecordCriterion
 *
 * @typedef {{
 *   requiredNodes: string[];
 *   requiredArtifacts: ArtifactCriterion[];
 *   requiredPersistedRecords: PersistedRecordCriterion[];
 * }} TopologyCompletionCriteria
 */

const FAMILY_PERSISTED_RECORDS = Object.freeze({
  loyalty: [{ type: 'loyalty_program_draft', mandatory: true }],
  campaign: [],
  store: [{ type: 'store', mandatory: true }],
  catalog: [{ type: 'catalog', mandatory: true }],
});

/**
 * @param {{
 *   topology?: Record<string, unknown> | null;
 *   missionContract?: Record<string, unknown> | null;
 * }} params
 * @returns {TopologyCompletionCriteria}
 */
export function resolveCompletionCriteria({ topology, missionContract } = {}) {
  const topo = asObject(topology);
  const contract = asObject(missionContract);
  const embedded = asObject(topo.completionCriteria);

  const nodes = asArray(topo.nodes);
  const requiredNodes =
    asArray(embedded.requiredNodes).length > 0
      ? asArray(embedded.requiredNodes).map((id) => String(id))
      : nodes
          .filter((node) => node && typeof node === 'object' && node.required !== false)
          .map((node) => String(/** @type {Record<string, unknown>} */ (node).id ?? ''))
          .filter(Boolean);

  const registry = registryEntryForMissionFamily(contract.missionFamily);
  const expectedTypes = asArray(contract.expectedAssetTypes).map((t) => String(t));

  /** @type {ArtifactCriterion[]} */
  const requiredArtifacts =
    asArray(embedded.requiredArtifacts).length > 0
      ? asArray(embedded.requiredArtifacts).map((row) => {
          const rec = asObject(row);
          const type = String(rec.type ?? rec.artifactType ?? '').trim();
          return {
            type: resolveCanonicalArtifactType(type),
            mandatory: rec.mandatory !== false,
          };
        })
      : expectedTypes.map((type) => ({
          type: resolveCanonicalArtifactType(type),
          mandatory: registry?.mandatoryByDefault !== false,
        }));

  /** @type {PersistedRecordCriterion[]} */
  const requiredPersistedRecords =
    asArray(embedded.requiredPersistedRecords).length > 0
      ? asArray(embedded.requiredPersistedRecords).map((row) => {
          const rec = asObject(row);
          return {
            type: String(rec.type ?? '').trim(),
            mandatory: rec.mandatory !== false,
          };
        })
      : [...(FAMILY_PERSISTED_RECORDS[String(contract.missionFamily ?? '')] ?? [])];

  return {
    requiredNodes,
    requiredArtifacts,
    requiredPersistedRecords,
  };
}

/**
 * @param {TopologyCompletionCriteria} criteria
 * @param {{
 *   completedNodes: string[];
 *   artifactTypesPresent: Set<string>;
 *   persistedRecordTypesPresent: Set<string>;
 * }} evidence
 */
export function evaluateCompletionCriteria(criteria, evidence) {
  const missingMandatoryNodes = criteria.requiredNodes.filter(
    (nodeId) => !evidence.completedNodes.includes(nodeId),
  );

  const missingMandatoryArtifacts = [];
  const missingOptionalArtifacts = [];
  for (const artifact of criteria.requiredArtifacts) {
    const canonical = resolveCanonicalArtifactType(artifact.type);
    if (evidence.artifactTypesPresent.has(canonical)) continue;
    if (artifact.mandatory === false) {
      missingOptionalArtifacts.push(artifact.type);
    } else {
      missingMandatoryArtifacts.push(artifact.type);
    }
  }

  const missingMandatoryRecords = [];
  const missingOptionalRecords = [];
  for (const record of criteria.requiredPersistedRecords) {
    if (evidence.persistedRecordTypesPresent.has(record.type)) continue;
    if (record.mandatory === false) {
      missingOptionalRecords.push(record.type);
    } else {
      missingMandatoryRecords.push(record.type);
    }
  }

  return {
    satisfied:
      missingMandatoryNodes.length === 0 &&
      missingMandatoryArtifacts.length === 0 &&
      missingMandatoryRecords.length === 0,
    missingMandatoryNodes,
    missingMandatoryArtifacts,
    missingOptionalArtifacts,
    missingMandatoryRecords,
    missingOptionalRecords,
  };
}

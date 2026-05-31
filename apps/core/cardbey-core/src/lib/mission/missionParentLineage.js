/**
 * Parent mission lineage — schema-safe (metadataJson fallback when column absent).
 */

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {object|null|undefined} mission
 * @returns {string|null}
 */
export function getMissionParentMissionId(mission) {
  if (!mission || typeof mission !== 'object') return null;

  const direct = str(mission.parentMissionId);
  if (direct) return direct;

  const meta = asObj(mission.metadataJson);
  const fromMeta = str(meta.parentMissionId);
  if (fromMeta) return fromMeta;

  const cont = asObj(meta.continuationContract);
  const fromCont = str(cont.parentMissionId);
  if (fromCont) return fromCont;

  const runtime = asObj(meta.runtimeContinuation);
  const fromRuntime = str(runtime.parentMissionId);
  if (fromRuntime) return fromRuntime;

  return null;
}

/**
 * Persist parent lineage in metadataJson when schema column is unavailable.
 * @param {object} [metadata]
 * @param {string|null|undefined} parentMissionId
 * @returns {object}
 */
export function withParentMissionIdInMetadata(metadata, parentMissionId) {
  const parentId = str(parentMissionId);
  const base = asObj(metadata);
  if (!parentId) return { ...base };
  return {
    ...base,
    parentMissionId: parentId,
    runtimeContinuation: {
      ...asObj(base.runtimeContinuation),
      parentMissionId: parentId,
    },
  };
}

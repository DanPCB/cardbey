/**
 * Helpers for persisting LLM task graphs on MissionPipeline.metadataJson (no schema change).
 */

/**
 * @param {object} metadata
 * @returns {object | null}
 */
export function getTaskGraphFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const g = metadata.taskGraph;
  if (!g || typeof g !== 'object' || !Array.isArray(g.tasks)) return null;
  return g;
}

/**
 * @param {object} metadata
 * @returns {boolean}
 */
export function metadataUsesLlmTaskGraph(metadata) {
  return getTaskGraphFromMetadata(metadata) != null;
}

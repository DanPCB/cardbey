/**
 * Standard runtime upload response envelope for multipart ui-action routes.
 */

/**
 * @param {string} action
 * @param {Record<string, unknown>} output
 * @param {{ missionId?: string|null, source?: string|null }} [meta]
 */
export function buildRuntimeUploadEnvelope(action, output, meta = {}) {
  return {
    ok: true,
    status: 'completed',
    action,
    output,
    metadata: {
      executionSource: 'performer_runtime',
      missionId: meta.missionId ?? null,
      source: meta.source ?? 'ui_runtime_upload',
    },
  };
}

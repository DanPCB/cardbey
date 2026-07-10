/**
 * Path telemetry for Performer spine vs legacy bypasses.
 */

/**
 * @param {{
 *   pathId: string;
 *   source?: string;
 *   ok?: boolean;
 *   reason?: string;
 *   tool?: string | null;
 *   missionId?: string | null;
 *   spine?: boolean;
 *   nodeCount?: number;
 *   useLoyaltySpine?: boolean;
 *   [key: string]: unknown;
 * }} event
 */
export function emitSpinePathTelemetry(event) {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };

  console.info(
    '[spine.path]',
    JSON.stringify({
      pathId: payload.pathId,
      source: payload.source ?? null,
      ok: payload.ok !== false,
      reason: payload.reason ?? null,
      tool: payload.tool ?? null,
      originalTool: payload.originalTool ?? null,
      finalTool: payload.finalTool ?? null,
      missionId: payload.missionId ?? null,
      storeId: payload.storeId ?? null,
      missingContext: payload.missingContext ?? null,
      executionPath: payload.executionPath ?? payload.pathId ?? null,
      action: payload.action ?? null,
      spine: payload.spine ?? null,
      nodeCount: payload.nodeCount ?? null,
    }),
  );

  return payload;
}

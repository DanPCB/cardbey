/**
 * MCP invocation envelope — built by server runtime only (Mission Pipeline, MI intent runner,
 * approved agent/dispatch paths). Not for dashboard UI to construct for business execution.
 *
 * @typedef {object} McpInvocationEnvelope
 * @property {string | null} userId
 * @property {string | null} tenantId
 * @property {string | null} tenantKey — same scope as tenantId for audit (often identical)
 * @property {string | null} missionId
 * @property {string | null} intentId
 * @property {string | null} adapterId — MCP adapter id for trace/audit
 * @property {string} source — e.g. 'mission_pipeline', 'mi_intent', 'http_mcp_resource'
 * @property {string} at — ISO timestamp when envelope was built
 */

/**
 * @param {object} [params]
 * @param {string | null} [params.userId]
 * @param {string | null} [params.tenantId]
 * @param {string | null} [params.tenantKey] — defaults to tenantId when omitted
 * @param {string | null} [params.missionId]
 * @param {string | null} [params.intentId]
 * @param {string | null} [params.adapterId]
 * @param {string} [params.source]
 * @returns {McpInvocationEnvelope}
 */
export function buildMcpInvocationEnvelope({
  userId = null,
  tenantId = null,
  tenantKey = null,
  missionId = null,
  intentId = null,
  adapterId = null,
  source = 'unknown',
} = {}) {
  const tid = tenantId != null ? String(tenantId).trim() || null : null;
  const tk = tenantKey != null ? String(tenantKey).trim() || null : null;
  const aid = adapterId != null ? String(adapterId).trim() || null : null;
  return {
    userId: userId != null ? String(userId).trim() || null : null,
    tenantId: tid,
    tenantKey: tk ?? tid,
    missionId: missionId != null ? String(missionId).trim() || null : null,
    intentId: intentId != null ? String(intentId).trim() || null : null,
    adapterId: aid,
    source: String(source || 'unknown'),
    at: new Date().toISOString(),
  };
}

/**
 * MCP-backed **mutations** must be tied to Mission Execution (or an explicit internal batch id
 * documented in the adapter). Prevents anonymous UI-originated writes via MCP-shaped APIs.
 *
 * @param {McpInvocationEnvelope | null | undefined} envelope
 * @param {string} [operationName]
 * @throws {Error}
 */
export function assertMcpMutationEnvelope(envelope, operationName = 'mcp_mutation') {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error(`[MCP] ${operationName}: envelope required`);
  }
  const mid = envelope.missionId != null ? String(envelope.missionId).trim() : '';
  if (!mid) {
    throw new Error(
      `[MCP] ${operationName}: missionId required for mutation — runtime-owned execution only`,
    );
  }
}

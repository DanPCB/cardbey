/**
 * Foundation 2: PromotionAgent — uses product context from agentMemory for offer suggestions.
 */

/** @type {(patch: object) => Promise<void>} */
const noopEmitContextUpdate = () => Promise.resolve();

/**
 * @param {object} params - missionId, intentId, storeId, payload, etc.
 * @param {object} [options]
 * @param {object | null} [options.missionContext] - Mission.context.agentMemory (null-safe)
 * @param {(patch: object) => Promise<void>} [options.emitContextUpdate] - No-op if omitted
 * @returns {Promise<{ ok: boolean, suggestions?: Array<{ productId?: string, name?: string, suggestion?: string }> }>}
 */
export async function runPromotionAgent(
  params,
  { missionContext = null, emitContextUpdate = noopEmitContextUpdate } = {}
) {
  const products = missionContext?.entities?.products ?? [];
  const suggestions = products.length > 0
    ? products.slice(0, 10).map((p) => ({ productId: p.id, name: p.name, suggestion: `Promote: ${p.name || p.id}` }))
    : [];
  return { ok: true, suggestions };
}

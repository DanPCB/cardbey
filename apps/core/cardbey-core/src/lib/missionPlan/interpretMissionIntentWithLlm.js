/**
 * LLM-assisted intent interpretation (stub). Real implementation in Prompt 6.
 */

/**
 * Stub: returns empty hints. No LLM call yet.
 * @param {object} prisma - Prisma client (unused in stub)
 * @param {string} prompt
 * @param {{ tenantKey: string }} options
 * @returns {Promise<{ suggestedIntents: unknown[], confidence: number }>}
 */
export async function interpretMissionIntentWithLlm(prisma, prompt, { tenantKey }) {
  return { suggestedIntents: [], confidence: 0 };
}

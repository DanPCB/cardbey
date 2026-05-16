/**
 * researcherAgent.js
 * Location: src/lib/agents/researcherAgent.js
 *
 * Shared runner for the researcher agent.
 * Called by market_research tool executor via dynamic import.
 *
 * All entry points that need a MarketReport import from here —
 * nothing else calls callAsAgent('researcher', ...) directly.
 */

import { callAsAgent } from './agentRegistry.js';
import { assertMarketReport } from './marketReportValidator.js';

/**
 * Calls the researcher agent and returns a validated MarketReport.
 *
 * Throws if:
 *   - callAsAgent fails (LLM error, empty response, JSON parse failure)
 *   - The returned object does not satisfy the MarketReport Zod schema
 *
 * @param {string} prompt - The user-turn prompt built by researcherPromptBuilder
 * @param {{ tenantKey?: string, bypassCache?: boolean }} [options]
 * @returns {Promise<import('./contracts/index').MarketReport>}
 */
export async function runResearcher(prompt, options = {}) {
  const raw = await callAsAgent('researcher', prompt, {
    tenantId: options.tenantKey ?? options.tenantId ?? 'default',
    ...(options.bypassCache ? { bypassCache: true } : {}),
  });

  // assertMarketReport throws with field-level detail if the LLM output
  // does not match the MarketReport contract — caught by the executor.
  return assertMarketReport(raw);
}

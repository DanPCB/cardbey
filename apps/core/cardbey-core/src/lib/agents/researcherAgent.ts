/**
 * Shared runner for the researcher agent.
 * All entry points (pipeline step, API route, tool executor) call through here —
 * callAsAgent and MarketReport validation live in one place.
 */

import { callAsAgent } from './agentRegistry.js';
import { assertMarketReport } from './marketReportValidator.js';
import type { MarketReportValidated } from './marketReportValidator.js';

export interface RunResearcherOptions {
  /** Tenant key for llmGateway (billing / cache scope). */
  tenantKey: string;
  /** Override cache behaviour — reserved for future use. */
  bypassCache?: boolean;
}

/**
 * Calls the researcher agent and returns a validated MarketReport.
 * Throws if callAsAgent fails (LLM error, empty response, JSON parse failure)
 * or if the returned object does not satisfy the MarketReport schema.
 */
export async function runResearcher(
  prompt: string,
  options: RunResearcherOptions,
): Promise<MarketReportValidated> {
  const raw = await callAsAgent('researcher', prompt, {
    tenantId: options.tenantKey,
  });

  return assertMarketReport(raw);
}

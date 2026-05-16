/**
 * Pipeline step wrapper for the researcher agent.
 * Uses the shared runner (runResearcher) — no direct callAsAgent here.
 * Call when you already have storeContext (e.g. from mission context or API).
 */

import { buildResearcherPrompt } from './researcherPromptBuilder.js';
import { runResearcher } from './researcherAgent.js';
import type { StoreContext } from './researcherPromptBuilder.js';
import type { MarketReportValidated } from './marketReportValidator.js';

export interface ResearcherPipelineStepInput {
  missionId: string;
  goal: string;
  storeContext: StoreContext;
  tenantKey?: string;
}

export interface ResearcherPipelineStepResult {
  missionId: string;
  report: MarketReportValidated;
  durationMs: number;
}

/**
 * Builds the researcher prompt and runs the researcher agent.
 * Returns the validated report and duration; throws on agent or validation failure.
 */
export async function runResearcherPipelineStep(
  input: ResearcherPipelineStepInput,
): Promise<ResearcherPipelineStepResult> {
  const start = Date.now();
  const prompt = await buildResearcherPrompt({
    goal: input.goal,
    storeContext: input.storeContext,
  });
  const report = await runResearcher(prompt, {
    tenantKey: input.tenantKey ?? 'default',
  });
  return {
    missionId: input.missionId,
    report,
    durationMs: Date.now() - start,
  };
}

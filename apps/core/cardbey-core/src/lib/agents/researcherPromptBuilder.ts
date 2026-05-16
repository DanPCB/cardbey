/**
 * Builds the researcher agent prompt from store context and optional external signals.
 * Single place for prompt shape so pipeline step and API route stay in sync.
 */

export interface StoreContext {
  storeId: string;
  storeName?: string | null;
  productCount?: number;
  categoryCount?: number;
  suburb?: string | null;
  state?: string | null;
  country?: string;
  timezone?: string;
  /** Optional pre-fetched summary for the agent. */
  summary?: string | null;
}

export interface ExternalSignals {
  /** Placeholder for competitor / AU market data when pre-fetched. */
  competitorsSummary?: string | null;
  seasonalFactors?: string[] | null;
}

export interface BuildResearcherPromptInput {
  goal: string;
  storeContext: StoreContext;
  externalSignals?: ExternalSignals | null;
}

/**
 * Assembles a structured prompt for the researcher agent.
 * The agent returns JSON matching MarketReport; this gives it the inputs it needs.
 */
export async function buildResearcherPrompt(input: BuildResearcherPromptInput): Promise<string> {
  const { goal, storeContext, externalSignals } = input;

  const locationPart = [
    storeContext.suburb ?? 'unknown suburb',
    storeContext.state ?? 'unknown state',
    storeContext.country ?? 'Australia',
    storeContext.timezone ?? 'Australia/Sydney',
  ].join(', ');

  const storePart = [
    `Store ID: ${storeContext.storeId}`,
    storeContext.storeName ? `Name: ${storeContext.storeName}` : null,
    storeContext.productCount != null ? `Product count: ${storeContext.productCount}` : null,
    storeContext.categoryCount != null ? `Category count: ${storeContext.categoryCount}` : null,
    storeContext.summary ? `Summary: ${storeContext.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const externalPart =
    externalSignals?.competitorsSummary || (externalSignals?.seasonalFactors?.length
      ? `Seasonal factors: ${externalSignals.seasonalFactors!.join(', ')}`
      : null) || 'No external market data provided. Use your knowledge of the Australian small business market.';

  const payload = {
    goal: goal.trim() || 'Improve local marketing and promotions',
    location: locationPart,
    store: storePart,
    externalContext: externalPart,
  };

  return JSON.stringify(payload, null, 2);
}

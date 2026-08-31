import type { TrackedDestination } from './connectionTypes.js';

const DEFAULT_BASE_URL = 'https://cardbey.com';

export type BuildTrackedDestinationInput = {
  signalId: string;
  connectionPlanId: string;
  opportunityRef?: string | null;
  solutionRef?: string | null;
  path?: string;
  baseUrl?: string;
};

/**
 * Deterministic tracked Cardbey destination — aligned with attribution spine UTM conventions.
 */
export function buildTrackedDestination(input: BuildTrackedDestinationInput): TrackedDestination {
  const base = (input.baseUrl ?? process.env.CARDBEY_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const path = input.path ?? '/create';
  const url = new URL(path, base);

  const utmSource = 'market_intent';
  const utmMedium = 'outreach';
  const utmCampaign = input.signalId;
  const utmContent = input.connectionPlanId;

  url.searchParams.set('utm_source', utmSource);
  url.searchParams.set('utm_medium', utmMedium);
  url.searchParams.set('utm_campaign', utmCampaign);
  url.searchParams.set('utm_content', utmContent);
  url.searchParams.set('cb_attr', '1');
  url.searchParams.set('cb_signal', input.signalId);
  url.searchParams.set('cb_plan', input.connectionPlanId);
  if (input.opportunityRef) url.searchParams.set('cb_opportunity', input.opportunityRef);
  if (input.solutionRef) url.searchParams.set('cb_solution', input.solutionRef);

  return {
    url: url.toString(),
    label: 'Cardbey opportunity preview entry',
    attribution: {
      signalId: input.signalId,
      connectionPlanId: input.connectionPlanId,
      opportunityRef: input.opportunityRef ?? null,
      solutionRef: input.solutionRef ?? null,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      cbAttr: '1',
    },
  };
}

export function attributionContextForConnection(destination: TrackedDestination | null) {
  if (!destination) return null;
  return destination.attribution;
}

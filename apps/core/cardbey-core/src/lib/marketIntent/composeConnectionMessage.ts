import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { OpportunityBrief, ProposedCardbeySolution } from './briefTypes.js';
import type { MarketOpportunityAssessment } from './opportunityTypes.js';
import type { ConnectionMessageDraft } from './connectionTypes.js';
import { buildMessageVersionHash } from './connectionGovernance.js';
import type { TrackedDestination } from './connectionTypes.js';

export type ComposeConnectionMessageInput = {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  opportunity: MarketOpportunityAssessment;
  brief: OpportunityBrief;
  solution: ProposedCardbeySolution | null;
  trackedDestination: TrackedDestination | null;
  entityName: string;
};

function firstFact(brief: OpportunityBrief, pattern?: RegExp): string | null {
  for (const f of brief.knownFacts) {
    if (!pattern || pattern.test(f.statement)) return f.statement;
  }
  return null;
}

/**
 * Value-first, truthful message draft grounded in G3/G4 — no fabricated capabilities.
 */
export function composeConnectionMessage(input: ComposeConnectionMessageInput): ConnectionMessageDraft {
  const intent =
    input.analysis.wants[0]?.label ??
    input.analysis.intents.primary?.replace(/_/g, ' ').toLowerCase() ??
    'your business objective';

  const understood =
    firstFact(input.brief, /seeking|wants|distributor|customer|partner/i) ??
    input.brief.summary;

  const prepared: string[] = [];
  if (input.brief.opportunityCard.canPrepare.length) {
    prepared.push(...input.brief.opportunityCard.canPrepare.slice(0, 4));
  }
  if (input.solution?.previews.length) {
    prepared.push('prepared preview materials');
  }

  const limitations = [
    ...input.opportunity.unavailableDesiredCapabilities.map((u) => u.need),
    ...input.brief.limitations.filter((l) => /distributor|investor|customer delivery|partner matching/i.test(l)).slice(0, 3),
  ];

  const preparedLines =
    prepared.length > 0
      ? prepared.map((p) => `• ${p}`).join('\n')
      : '• an opportunity brief based on your stated objective';

  const limitationNote =
    limitations.length > 0
      ? `\n\nNote: Cardbey does not currently offer: ${limitations.slice(0, 2).join('; ')}.`
      : '';

  const linkLine = input.trackedDestination
    ? `\n\nYou can review what we prepared here: ${input.trackedDestination.url}`
    : '';

  const body = `Hello,

We noticed ${input.entityName} may be ${intent}.

What we understood:
${understood}

Based on that, Cardbey prepared:
${preparedLines}${limitationNote}${linkLine}

This message was prepared by Cardbey to share relevant, prepared value — not a generic sales pitch. If helpful, we'd welcome your review of the materials at your convenience.

— Cardbey`;

  const subject = `Prepared for ${input.entityName}: ${intent}`;

  const groundedIn = [
    input.signal.signalId,
    input.brief.assessmentRef,
    ...(input.solution ? [input.solution.solutionId] : []),
  ];

  const draft: ConnectionMessageDraft = {
    subject,
    body,
    bodyFormat: 'plain',
    versionHash: '',
    groundedIn,
    limitations: limitations.slice(0, 5),
  };
  draft.versionHash = buildMessageVersionHash(draft);

  return draft;
}

export function composeConnectionMessageHtml(draft: ConnectionMessageDraft, trackedUrl?: string | null): string {
  const paragraphs = draft.body
    .split('\n\n')
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const link = trackedUrl ? `<p><a href="${trackedUrl}">Review prepared materials</a></p>` : '';
  return `${paragraphs}${link}`;
}

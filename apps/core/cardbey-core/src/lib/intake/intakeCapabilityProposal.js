/**
 * Intake V2 — normalize capability-gap output into a human-readable proposal (proposal-only, no apply).
 */

/**
 * @typedef {object} CapabilityGapResult
 * @property {boolean} isGap
 * @property {string} [reason]
 * @property {string} [requestedCapability]
 * @property {'content_field'|'ui_element'|'schema_extension'|'editor_support'} [suggestedScope]
 * @property {string} [spawnIntent]
 */

/**
 * @typedef {object} CapabilityProposal
 * @property {string} title
 * @property {string} summary
 * @property {string} requestedCapability
 * @property {object} proposedImplementation
 * @property {string} [proposedImplementation.fieldOrElement]
 * @property {'content_field'|'ui_element'|'schema_extension'|'editor_support'} proposedImplementation.patchType
 * @property {string[]} proposedImplementation.affectedAreas
 * @property {string[]} [proposedImplementation.affectedFiles]
 * @property {boolean} [proposedImplementation.additiveOnly]
 * @property {string[]} risks
 * @property {string[]} testsNeeded
 * @property {number} [confidence]
 * @property {'template'|'llm'} [proposalSource]
 * @property {string} [spawnIntent]
 * @property {object} [spawnPayload]
 */

/**
 * @param {CapabilityGapResult} gap
 * @param {string} userMessage
 * @param {object} [context]
 * @returns {CapabilityProposal}
 */
export function buildCapabilityProposalFromGap(gap, userMessage, context = {}) {
  const scope =
    gap.suggestedScope === 'content_field' ||
    gap.suggestedScope === 'ui_element' ||
    gap.suggestedScope === 'schema_extension' ||
    gap.suggestedScope === 'editor_support'
      ? gap.suggestedScope
      : 'schema_extension';

  const titleByScope = {
    content_field: 'Add hero tagline / subtitle support',
    ui_element: 'Add new UI section or block',
    schema_extension: 'Schema or preview extension',
    editor_support: 'Editor / intake support extension',
  };

  const fieldGuess = (() => {
    const m = String(userMessage).match(/\b(tagline|subtitle|section|block|field|widget|panel)\b/i);
    return m ? m[1] : undefined;
  })();

  const proposal = {
    title: titleByScope[scope] ?? 'Capability proposal',
    summary:
      'This request likely needs a small product change (preview, schema, or editor). The plan below is **proposal-only** — nothing has been changed on your store or draft.',
    requestedCapability: gap.requestedCapability ?? String(userMessage).slice(0, 240),
    proposedImplementation: {
      ...(fieldGuess ? { fieldOrElement: fieldGuess } : {}),
      patchType: scope,
      affectedAreas: [
        'Draft `preview` JSON and mini-website renderer',
        'Intake V2 tool registry / validation (if new parameters)',
        'Optional: Performer approval contracts',
      ],
      affectedFiles: [
        'apps/core/cardbey-core/src/services/storeContentPatchService.js',
        'apps/dashboard/cardbey-marketing-dashboard/src/pages/public/WebsitePreviewPage.tsx',
      ],
      additiveOnly: true,
    },
    risks: [
      'Preview must bind any new field so users see changes',
      'Publish/commit payloads must stay backward compatible',
      'Strict `validateToolParameters` may reject new keys until registry is updated',
    ],
    testsNeeded: [
      'Unit: patch application + preview read path',
      'E2E: intake → approval → visible preview',
      'Regression: existing headline / storeName / heroSubtitle flows',
    ],
    confidence: 0.55,
    proposalSource: 'template',
    spawnIntent: gap.spawnIntent,
  };

  proposal.spawnPayload = {
    intent: gap.spawnIntent ?? userMessage,
    storeContext: {
      storeId: context?.storeId ?? null,
      storeType: context?.storeType ?? context?.businessType ?? null,
      storeName: context?.storeName ?? null,
    },
    originalMessage: userMessage,
    proposalTitle: proposal.title,
    confidence: proposal.confidence ?? 0.55,
    source: 'capability_gap',
  };

  return proposal;
}

/**
 * Present-options payloads for decision loop clarify steps.
 */

/**
 * @param {import('./constants.js').BeliefSnapshot} belief
 */
export function buildUploadGoalOptions(belief) {
  const name = belief.lastUpload?.businessName;
  const prefix = name ? `I read ${name} from your upload. ` : 'I see your upload. ';

  return {
    question: `${prefix}What would you like to do next?`,
    options: [
      { id: 'create_store', label: 'Create store', tool: 'create_store', parameters: { source: 'upload_ask_selection' } },
      { id: 'import_catalog', label: 'Import catalog / menu', tool: 'replace_store_catalog', parameters: {} },
      {
        id: 'analyze_document',
        label: 'Analyze document',
        tool: 'ingest_asset_for_intent_detection',
        parameters: {},
      },
    ],
  };
}

/**
 * @param {import('./rankHypotheses.js').RankedHypothesis[]} ranked
 * @param {number} limit
 */
export function buildDisambiguationOptions(ranked, limit = 3) {
  return ranked.slice(0, limit).map((row) => ({
    id: row.intent,
    label: row.intent.replace(/_/g, ' '),
    tool: row.suggestedTool,
    parameters: {},
  }));
}

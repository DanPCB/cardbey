/**
 * Asset upload → intent selection telemetry probes.
 */

const PREFIX = '[ASSET_INTENT]';

export function logAssetIntentProbe(event, detail = {}) {
  try {
    const payload = { event, ...detail, ts: new Date().toISOString() };
    console.log(`${PREFIX} ${event}`, JSON.stringify(payload));
  } catch {
    console.log(`${PREFIX} ${event}`);
  }
}

export const ASSET_INTENT_EVENTS = {
  UPLOAD_RECEIVED: 'ASSET_UPLOAD_RECEIVED',
  INGEST_STARTED: 'ASSET_INGEST_STARTED',
  ENTITY_CONTEXT_BUILT: 'ENTITY_CONTEXT_BUILT',
  SUGGESTIONS_READY: 'INTENT_SUGGESTIONS_READY',
  AWAITING_USER: 'INTENT_SELECTION_AWAITING_USER',
  INTENT_SELECTED: 'INTENT_SELECTED',
  MISSION_CREATED: 'MISSION_CREATED_FROM_ASSET_INTENT',
  FAILED: 'ASSET_INTENT_FAILED',
};

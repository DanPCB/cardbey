import { emitStoreActivity } from './storeActivityEmitter.js';

/** Map IntentSignal.type → store activity type. */
const INTENT_SIGNAL_MAP = {
  offer_view: 'offer_viewed',
  page_view: 'store_viewed',
  qr_scan: 'device_qr_scanned',
  cta_click: 'campaign_clicked',
  publish: 'content_published',
  redeem: 'offer_claimed',
};

/**
 * Emit store activity from a recorded intent signal (no PII).
 * @param {{ storeId: string, type: string, offerId?: string | null, entityId?: string | null }} input
 */
export function emitStoreActivityFromIntentSignal(input) {
  const mapped = INTENT_SIGNAL_MAP[input.type];
  if (!mapped || !input.storeId) return null;
  return emitStoreActivity({
    storeId: input.storeId,
    type: mapped,
    actorType: 'system',
    entityType: input.offerId ? 'offer' : 'store',
    entityId: input.offerId || input.entityId || input.storeId,
    metadata: {
      signalType: input.type,
    },
  });
}

/**
 * @param {{ storeId: string, missionId: string, missionType?: string | null, phase: 'created' | 'completed' }} input
 */
export function emitStoreActivityFromMission(input) {
  if (!input.storeId || !input.missionId) return null;
  const type =
    input.phase === 'created' ? 'performer_recommendation_created' : 'performer_action_completed';
  return emitStoreActivity({
    storeId: input.storeId,
    type,
    actorType: 'performer',
    entityType: 'mission',
    entityId: input.missionId,
    metadata: {
      missionType: input.missionType ?? null,
      phase: input.phase,
    },
  });
}

/**
 * @param {{ storeId: string, entityId?: string | null }} input
 */
export function emitCustomerInquiryActivity(input) {
  if (!input.storeId) return null;
  return emitStoreActivity({
    storeId: input.storeId,
    type: 'customer_inquiry',
    severity: 'warning',
    actorType: 'system',
    entityType: 'inquiry',
    entityId: input.entityId || input.storeId,
  });
}

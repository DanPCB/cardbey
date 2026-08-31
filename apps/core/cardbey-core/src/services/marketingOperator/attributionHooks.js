/**
 * Optional first-party attribution hooks (delegates to Marketing Operations spine).
 * Never throws to callers.
 */

import {
  recordCanonicalEvent,
  tryRecordBusinessCreated,
  tryRecordSignup,
} from '../marketingOperations/attributionSpine.js';

export async function tryRecordMarketingConversion(req, eventType, extra = {}) {
  return recordCanonicalEvent({
    req,
    eventType,
    userId: extra.userId || null,
    storeId: extra.storeId || null,
    touchId: extra.touchId || null,
    destinationUrl: extra.destinationUrl || null,
    metadata: extra.metadata || null,
    ...(extra.attr || {}),
  });
}

export async function tryRecordRegistrationConversion(req, user) {
  return tryRecordSignup(req, user);
}

export async function tryRecordBusinessCreatedConversion(req, { userId, storeId } = {}) {
  return tryRecordBusinessCreated({ req, userId, storeId });
}

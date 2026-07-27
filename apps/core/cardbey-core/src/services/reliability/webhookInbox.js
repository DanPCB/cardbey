/**
 * Dev webhook inbox — captures alert payloads for local RELIABILITY_WEBHOOK_URL testing.
 */

/** @type {Array<object>} */
const inbox = [];
const maxInbox = 200;

/**
 * @param {object} payload
 */
export function pushWebhookInbox(payload) {
  inbox.push({
    ...payload,
    receivedAt: new Date().toISOString(),
  });
  if (inbox.length > maxInbox) {
    inbox.shift();
  }
}

/**
 * @param {number} [limit]
 */
export function getWebhookInbox(limit = 50) {
  return inbox.slice(-limit);
}

export function clearWebhookInbox() {
  inbox.length = 0;
}

export function resetWebhookInboxForTests() {
  clearWebhookInbox();
}

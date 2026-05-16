/**
 * Centralized order status mapping (MANDATORY single source of truth).
 *
 * - Legacy → Cardbey normalization happens here.
 * - Cardbey → Legacy action/status mapping happens here.
 *
 * Do not scatter status logic across services/routes/agents.
 */

export const LEGACY_TO_CARDBEY_STATUS = {
  confirm: 'confirmed',
  confirmed: 'confirmed',
  complete: 'completed',
  completed: 'completed',
  cancel: 'cancelled',
  cancelled: 'cancelled',
  pending: 'pending',
  preparing: 'preparing',
  ready: 'ready',
  delivering: 'delivering',
  'cancel-requested': 'cancel_requested',
  cancel_requested: 'cancel_requested',
  'cancel_requested': 'cancel_requested',
};

export const CARDBEY_TO_LEGACY_ACTION = {
  confirmed: 'confirm',
  completed: 'complete',
  cancelled: 'cancel',
  ready: 'ready',
  preparing: 'preparing',
  accept_cancel: 'accept-cancel',
  deny_cancel: 'deny-cancel',
};

export const CARDBEY_KNOWN_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivering',
  'completed',
  'cancel_requested',
  'cancelled',
];

export function normalizeLegacyStatus(rawStatus) {
  const raw = String(rawStatus || '').trim();
  if (!raw) return { status: null, rawStatus: raw };
  const key = raw.toLowerCase();
  const mapped = LEGACY_TO_CARDBEY_STATUS[key];
  return { status: mapped || null, rawStatus: raw };
}

/**
 * Map a Cardbey desired status/action to legacy action token.
 * Supports:
 * - normalized statuses: confirmed/completed/cancelled
 * - normalized cancel review actions: accept_cancel / deny_cancel
 */
export function toLegacyAction(cardbeyStatusOrAction) {
  const v = String(cardbeyStatusOrAction || '').trim();
  if (!v) return null;
  const key = v.toLowerCase();
  return CARDBEY_TO_LEGACY_ACTION[key] || null;
}


/**
 * Server-side pending NL confirmation — survives client history gaps.
 */

import { makePersistedIntentStorageKey } from './intakePersistedIntentStore.js';
import { getToolEntry } from './intakeToolRegistry.js';

const PENDING_CONFIRM_TTL_MS = 45 * 60 * 1000;

/** @type {Map<string, { expiresAt: number, payload: object }>} */
const store = new Map();

function prune() {
  const now = Date.now();
  for (const [key, row] of store.entries()) {
    if (row.expiresAt <= now) store.delete(key);
  }
}

/**
 * @param {{
 *   actorKey: string;
 *   tenantKey: string;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   draftId?: string | null;
 *   tool: string;
 *   originalGoal?: string | null;
 *   executionPath?: string | null;
 * }} args
 */
export function setPendingIntakeConfirmation(args) {
  prune();
  const actorKey = String(args.actorKey ?? '').trim();
  if (!actorKey) return;
  const tenantKey = String(args.tenantKey ?? '').trim() || 'unknown';
  const tool = String(args.tool ?? '').trim();
  if (!tool) return;
  const toolEntry = getToolEntry(tool);
  const key = makePersistedIntentStorageKey(
    actorKey,
    tenantKey,
    args.missionId ?? null,
    args.storeId ?? null,
    args.draftId ?? null,
  );
  const payload = {
    tool,
    originalGoal: String(args.originalGoal ?? '').trim() || null,
    executionPath: toolEntry?.executionPath ?? args.executionPath ?? null,
    storeId: args.storeId ?? null,
    draftId: args.draftId ?? null,
    missionId: args.missionId ?? null,
    updatedAt: new Date().toISOString(),
  };
  store.set(key, { expiresAt: Date.now() + PENDING_CONFIRM_TTL_MS, payload });
}

/**
 * @param {{
 *   actorKey: string | null;
 *   tenantKey: string;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   draftId?: string | null;
 * }} args
 */
export function getPendingIntakeConfirmation(args) {
  prune();
  const actorKey = String(args?.actorKey ?? '').trim();
  if (!actorKey) return null;
  const tenantKey = String(args?.tenantKey ?? '').trim() || 'unknown';
  const missionId = args?.missionId ?? null;
  const storeId = args?.storeId ?? null;
  const draftId = args?.draftId ?? null;

  const tryKey = (key) => {
    const row = store.get(key);
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
      store.delete(key);
      return null;
    }
    return row.payload && typeof row.payload === 'object' ? row.payload : null;
  };

  if (String(missionId ?? '').trim()) {
    const hit = tryKey(makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId));
    if (hit) return hit;
  }
  return tryKey(makePersistedIntentStorageKey(actorKey, tenantKey, null, storeId, draftId));
}

/**
 * @param {{
 *   actorKey: string | null;
 *   tenantKey: string;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   draftId?: string | null;
 * }} args
 */
export function clearPendingIntakeConfirmation(args) {
  prune();
  const actorKey = String(args?.actorKey ?? '').trim();
  if (!actorKey) return;
  const tenantKey = String(args?.tenantKey ?? '').trim() || 'unknown';
  const missionId = args?.missionId ?? null;
  const storeId = args?.storeId ?? null;
  const draftId = args?.draftId ?? null;
  store.delete(makePersistedIntentStorageKey(actorKey, tenantKey, missionId, storeId, draftId));
  store.delete(makePersistedIntentStorageKey(actorKey, tenantKey, null, storeId, draftId));
}

/** @internal tests */
export function clearPendingIntakeConfirmationStoreForTests() {
  store.clear();
}

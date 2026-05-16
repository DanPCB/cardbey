import { issuePairCode, consumePairCode } from './store.js';

const pendingScreens = new Map();
const pendingCodeIndex = new Map();

function cloneMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const cloned = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    cloned[key] = value;
  }
  return cloned;
}

function attachEntry(fingerprint, code, expiresAt, meta) {
  const entry = {
    id: fingerprint,
    code,
    expiresAt,
    meta: cloneMeta(meta),
  };
  pendingScreens.set(fingerprint, entry);
  pendingCodeIndex.set(code, fingerprint);
  return entry;
}

export function purgePendingScreens() {
  const now = Date.now();
  for (const [fingerprint, entry] of pendingScreens.entries()) {
    if (entry.expiresAt <= now) {
      pendingScreens.delete(fingerprint);
      pendingCodeIndex.delete(entry.code);
      consumePairCode(entry.code);
    }
  }
}

const sweepTimer = setInterval(purgePendingScreens, 60_000);
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

export function upsertPendingScreen({ fingerprint, meta }) {
  if (!fingerprint) throw new Error('fingerprint required');
  purgePendingScreens();
  const existing = pendingScreens.get(fingerprint);
  if (existing && existing.expiresAt > Date.now()) {
    if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
      existing.meta = { ...existing.meta, ...cloneMeta(meta) };
    }
    return existing;
  }

  if (existing) {
    pendingScreens.delete(fingerprint);
    pendingCodeIndex.delete(existing.code);
    consumePairCode(existing.code);
  }

  const { code, expiresAt } = issuePairCode();
  return attachEntry(fingerprint, code, expiresAt, meta);
}

export function listPendingScreens() {
  purgePendingScreens();
  return Array.from(pendingScreens.values()).map((entry) => ({
    id: entry.id,
    code: entry.code,
    expiresAt: entry.expiresAt,
    meta: { ...entry.meta },
  }));
}

export function getPendingByCode(code) {
  if (!code) return null;
  purgePendingScreens();
  const id = pendingCodeIndex.get(code);
  if (!id) return null;
  const entry = pendingScreens.get(id);
  if (!entry) {
    pendingCodeIndex.delete(code);
    return null;
  }
  return {
    id: entry.id,
    code: entry.code,
    expiresAt: entry.expiresAt,
    meta: { ...entry.meta },
  };
}

export function regeneratePendingScreen(id) {
  purgePendingScreens();
  const entry = pendingScreens.get(id);
  if (!entry) return null;
  pendingCodeIndex.delete(entry.code);
  consumePairCode(entry.code);
  const { code, expiresAt } = issuePairCode();
  entry.code = code;
  entry.expiresAt = expiresAt;
  pendingCodeIndex.set(code, id);
  return {
    id: entry.id,
    code: entry.code,
    expiresAt: entry.expiresAt,
    meta: { ...entry.meta },
  };
}

export function resolvePendingByCode(code) {
  const id = pendingCodeIndex.get(code);
  if (!id) return null;
  pendingCodeIndex.delete(code);
  const entry = pendingScreens.get(id) || null;
  if (entry) {
    pendingScreens.delete(id);
  }
  return entry ? { ...entry, meta: { ...entry.meta } } : null;
}

export function expireAllPending(reason = 'expired') {
  purgePendingScreens();
  const expiredEntries = [];
  for (const [fingerprint, entry] of pendingScreens.entries()) {
    pendingScreens.delete(fingerprint);
    pendingCodeIndex.delete(entry.code);
    consumePairCode(entry.code);
    expiredEntries.push({
      id: fingerprint,
      code: entry.code,
      expiresAt: entry.expiresAt,
      reason,
      meta: { ...entry.meta },
    });
  }
  return expiredEntries;
}

export function resetPendingStoreForTest() {
  pendingScreens.clear();
  pendingCodeIndex.clear();
}


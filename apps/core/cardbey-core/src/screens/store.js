// @ts-check

// @ts-ignore -- Node built-ins are available at runtime
import crypto from 'node:crypto';
// @ts-ignore -- Node built-ins are available at runtime
import fs from 'node:fs';
// @ts-ignore -- Node built-ins are available at runtime
import path from 'node:path';
// @ts-ignore -- Node built-ins are available at runtime
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cacheDir = path.resolve(__dirname, '../.cache');
const cacheFile = path.join(cacheDir, 'pairCodes.json');

const screens = new Map();
export const screensStore = screens;
const playlistStore = new Map();
const pairCodes = new Map();

export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;

export function now() {
  return Date.now();
}

function ensureCacheDir() {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  } catch (err) {
    console.warn('[CORE] pair cache mkdir failed', err?.message || err);
  }
}

function cloneItems(items) {
  return Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
}

function savePairCodes() {
  try {
    ensureCacheDir();
    const payload = {
      savedAt: now(),
      entries: Array.from(pairCodes.entries()).map(([code, entry]) => ({
        code,
        createdAt: entry.createdAt,
      })),
    };
    fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('[CORE] pair cache write failed', err?.message || err);
  }
}

function loadPairCodes() {
  try {
    if (!fs.existsSync(cacheFile)) return;
    const raw = fs.readFileSync(cacheFile, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const entries = parsed?.entries || [];
    let hydrated = 0;
    for (const entry of entries) {
      if (!entry || typeof entry.code !== 'string') continue;
      const createdAt = typeof entry.createdAt === 'number' ? entry.createdAt : now();
      if (now() - createdAt > PAIR_CODE_TTL_MS) continue;
      pairCodes.set(entry.code, { createdAt });
      hydrated += 1;
    }
    if (hydrated > 0) {
      console.log('[CORE] pair cache hydrated %d code(s)', hydrated);
    }
  } catch (err) {
    console.warn('[CORE] pair cache read failed', err?.message || err);
  }
}

loadPairCodes();

function generatePairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function ensureScreen(id) {
  if (screens.has(id)) return screens.get(id);
  const createdAt = now();
  const screen = {
    id,
    meta: { name: null },
    lastSeen: null,
    online: false,
    updatedAt: createdAt,
    items: [],
    createdAt,
  };
  screens.set(id, screen);
  return screen;
}

function makeId() {
  return `cmh${Math.random().toString(36).slice(2, 9)}`;
}

export function createScreen(options = {}) {
  let id = options.id ? String(options.id) : null;
  while (!id || screens.has(id)) {
    id = makeId();
  }
  const createdAt = now();
  const screen = {
    id,
    meta: { name: options.name ? String(options.name) : null },
    lastSeen: null,
    online: false,
    updatedAt: createdAt,
    items: [],
    createdAt,
  };
  screens.set(id, screen);
  return screen;
}

export function upsertHeartbeat(id, meta) {
  const screen = ensureScreen(id);
  const timestamp = now();
  screen.lastSeen = timestamp;
  screen.online = true;
  screen.updatedAt = timestamp;
  if (meta && typeof meta === 'object') {
    screen.meta = {
      ...(screen.meta || { name: null }),
      ...meta,
      name: meta.name ?? screen.meta?.name ?? null,
    };
  }
  return { now: timestamp, lastSeen: screen.lastSeen };
}

export function setPlaylist(id, items) {
  const screen = ensureScreen(id);
  const copy = cloneItems(items || []);
  const timestamp = now();
  playlistStore.set(id, { items: copy, updatedAt: timestamp });
  screen.items = copy;
  screen.updatedAt = timestamp;
  return { count: copy.length, updatedAt: timestamp };
}

export function getPlaylist(id) {
  const entry = playlistStore.get(id);
  return entry ? cloneItems(entry.items) : [];
}

export function getPlaylistEntry(id) {
  const entry = playlistStore.get(id);
  if (!entry) return null;
  return { items: cloneItems(entry.items), updatedAt: entry.updatedAt };
}

export function hasPlaylist(id) {
  return playlistStore.has(id);
}

export function listScreens() {
  return Array.from(screens.values())
    .map((screen) => ({
      id: screen.id,
      lastSeen: screen.lastSeen,
      online: !!screen.online,
      updatedAt: screen.updatedAt,
      meta: { ...(screen.meta || {}) },
      pairing: screen.pairing ? { ...screen.pairing } : null,
    }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function deleteScreen(id) {
  playlistStore.delete(id);
  return screens.delete(id);
}

export function getAllScreens(store = screens) {
  if (!store) return [];
  return store instanceof Map ? Array.from(store.values()) : Array.isArray(store) ? store : Object.values(store);
}

export function getScreen(id) {
  return screens.get(id);
}

export function getScreenById(store = screens, id) {
  if (!store || !id) return null;
  if (store instanceof Map) return store.get(id) || null;
  return store[id] || null;
}

export function setScreen(store = screens, id, data) {
  if (!store || !id || !data) return;
  if (store instanceof Map) store.set(id, data);
  else {
    /** @type {Record<string, unknown>} */
    const recordStore = store;
    recordStore[id] = data;
  }
}

export function getWeakETagFor(items) {
  const normalized = JSON.stringify(items || []);
  const digest = crypto.createHash('sha1').update(normalized).digest('hex');
  const count = Array.isArray(items) ? items.length : 0;
  return `W/"${digest}:${count}"`;
}

export function sweepOffline(thresholdMs) {
  if (!thresholdMs || thresholdMs <= 0) return [];
  const timestamp = now();
  const changed = [];
  for (const screen of screens.values()) {
    if (!screen.lastSeen) continue;
    if (screen.online && timestamp - screen.lastSeen > thresholdMs) {
      screen.online = false;
      changed.push(screen);
    }
  }
  return changed;
}

export function issuePairCode() {
  let code = generatePairCode();
  while (pairCodes.has(code)) {
    code = generatePairCode();
  }
  const createdAt = now();
  pairCodes.set(code, { createdAt });
  savePairCodes();
  return { code, expiresAt: createdAt + PAIR_CODE_TTL_MS };
}

export function getPairCodeInfo(code) {
  const entry = pairCodes.get(code);
  if (!entry) return null;
  const expiresAt = entry.createdAt + PAIR_CODE_TTL_MS;
  const remaining = expiresAt - now();
  if (remaining <= 0) {
    pairCodes.delete(code);
    savePairCodes();
    return null;
  }
  return { code, createdAt: entry.createdAt, expiresAt, ttlLeftMs: remaining };
}

export function consumePairCode(code) {
  const info = getPairCodeInfo(code);
  if (!info) return null;
  pairCodes.delete(code);
  savePairCodes();
  return info;
}

export function cleanupPairCodes() {
  const removed = [];
  const current = now();
  for (const [code, entry] of pairCodes.entries()) {
    if (current - entry.createdAt > PAIR_CODE_TTL_MS) {
      pairCodes.delete(code);
      removed.push(code);
    }
  }
  if (removed.length > 0) {
    savePairCodes();
  }
  return removed;
}

export function purgeGhostScreens() {
  const removed = [];
  for (const [id, screen] of screens.entries()) {
    const isGhost =
      !screen.online &&
      !screen.lastSeen &&
      (!screen.items || screen.items.length === 0) &&
      (!screen.updatedAt || screen.updatedAt === screen.createdAt);
    if (isGhost) {
      screens.delete(id);
      playlistStore.delete(id);
      removed.push(id);
    }
  }
  return removed;
}

export function resetStoresForTest() {
  screens.clear();
  playlistStore.clear();
  pairCodes.clear();
  try {
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  } catch (err) {
    console.warn('[CORE] resetStoresForTest unlink failed', err?.message || err);
  }
}


import { Router } from 'express';
import {
  createScreen,
  upsertHeartbeat,
  setPlaylist,
  getPlaylistEntry,
  listScreens,
  getWeakETagFor,
  sweepOffline,
  deleteScreen,
  issuePairCode,
  getPairCodeInfo,
  cleanupPairCodes,
  purgeGhostScreens,
} from './store.js';
import {
  upsertPendingScreen,
  listPendingScreens,
  regeneratePendingScreen,
  purgePendingScreens,
} from './pendingStore.js';
import { broadcast } from '../realtime/sse.js';

export const screensRouter = Router();

const purgedGhosts = purgeGhostScreens();
if (purgedGhosts.length > 0) {
  console.log('[CORE] purged %d ghost screen(s)', purgedGhosts.length);
}

function logCoreLine(req, res) {
  const started = Date.now();
  res.once('finish', () => {
    const ms = Date.now() - started;
    console.log(`[CORE] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
}

function normalizePlaylistItems(input) {
  if (!Array.isArray(input)) return [];
  const normalized = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url) continue;
    const type = item.type === 'video' ? 'video' : 'image';
    const entry = { type, url };
    if (typeof item.duration === 'number' && Number.isFinite(item.duration) && item.duration > 0) {
      entry.duration = item.duration;
    }
    normalized.push(entry);
  }
  return normalized;
}

function sendJson(res, status, payload, cacheControl = 'no-store') {
  const response = res.status(status);
  if (cacheControl) {
    response.set('Cache-Control', cacheControl);
  }
  response.json(payload);
}

const OFFLINE_SWEEP_INTERVAL = 60_000;
const OFFLINE_THRESHOLD = 180_000;

const offlineTimer = setInterval(() => {
  const offline = sweepOffline(OFFLINE_THRESHOLD);
  offline.forEach((screen) => {
    broadcast('screen.updated', {
      id: screen.id,
      online: false,
      lastSeen: screen.lastSeen,
    });
    console.log('[CORE:SWEEP] offline -> %s (lastSeen=%s)', screen.id, screen.lastSeen);
  });
  const expiredCodes = cleanupPairCodes();
  expiredCodes.forEach((code) => {
    console.log('[CORE] Pair code expired -> %s', code);
  });
  purgePendingScreens();
}, OFFLINE_SWEEP_INTERVAL);

if (typeof offlineTimer.unref === 'function') {
  offlineTimer.unref();
}

screensRouter.get('/', (req, res) => {
  logCoreLine(req, res);
  const data = listScreens();
  sendJson(res, 200, data, 'no-store');
});

screensRouter.post('/', (req, res) => {
  logCoreLine(req, res);
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const id = typeof body.id === 'string' ? body.id.trim() : undefined;
  const screen = createScreen({
    id: id && id.length > 0 ? id : undefined,
    name: name && name.length > 0 ? name : undefined,
  });

  broadcast('screen.created', {
    id: screen.id,
    meta: screen.meta,
  });

  sendJson(res, 201, { ok: true, id: screen.id });
});

screensRouter.post('/hello', (req, res) => {
  logCoreLine(req, res);
  const body = req.body || {};
  console.log('[CORE] /api/screens/hello body', body);
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.trim() : '';
  if (!fingerprint) {
    sendJson(res, 400, { ok: false, error: 'MISSING_FINGERPRINT' });
    return;
  }
  const meta = { ...body };
  delete meta.fingerprint;
  try {
    const pending = upsertPendingScreen({ fingerprint, meta });
    broadcast('screen.pending', {
      id: pending.id,
      code: pending.code,
      meta: pending.meta,
      expiresAt: pending.expiresAt,
    });
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      code: pending.code,
      expiresAt: pending.expiresAt,
    });
  } catch (error) {
    console.error('[CORE] /api/screens/hello error', error);
    sendJson(res, 500, { ok: false, error: 'INTERNAL_ERROR' });
  }
});

screensRouter.get('/pending', (req, res) => {
  logCoreLine(req, res);
  const items = listPendingScreens();
  sendJson(res, 200, { ok: true, items });
});

screensRouter.post('/pending/:id/regenerate', (req, res) => {
  logCoreLine(req, res);
  const { id } = req.params;
  const updated = regeneratePendingScreen(id);
  if (!updated) {
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }
  broadcast('screen.pending', {
    id: updated.id,
    code: updated.code,
    meta: updated.meta,
    expiresAt: updated.expiresAt,
    regenerated: true,
  });
  sendJson(res, 200, {
    ok: true,
    code: updated.code,
    expiresAt: updated.expiresAt,
  });
});

screensRouter.post('/:id/heartbeat', (req, res) => {
  logCoreLine(req, res);
  const { id } = req.params;
  const meta = typeof req.body === 'object' && req.body !== null ? req.body : undefined;
  const ok = upsertHeartbeat(id, meta);

  broadcast('screen.updated', {
    id,
    lastSeen: ok.lastSeen,
    online: true,
  });

  sendJson(res, 200, { ok: true, now: ok.now, lastSeen: ok.lastSeen, online: true });
});

screensRouter.get('/:id/playlist', (req, res) => {
  logCoreLine(req, res);
  const { id } = req.params;
  const entry = getPlaylistEntry(id);
  if (!entry) {
    res.status(204).end();
    return;
  }

  const etag = getWeakETagFor(entry.items);
  if (etag) {
    res.setHeader('ETag', etag);
  }

  const inm = req.get('If-None-Match');
  if (inm && etag && inm === etag) {
    res.status(304).end();
    return;
  }

  res.status(200).json({ ok: true, items: entry.items });
});

screensRouter.post('/:id/playlist', (req, res) => {
  logCoreLine(req, res);
  const { id } = req.params;
  const body = req.body || {};
  const items = body.items;

  if (!Array.isArray(items)) {
    sendJson(res, 400, { ok: false, error: 'INVALID_PAYLOAD', message: 'items must be an array' });
    return;
  }

  const normalized = normalizePlaylistItems(items);
  const saved = setPlaylist(id, normalized);

  broadcast('playlist.updated', {
    id,
    count: saved.count,
    updatedAt: saved.updatedAt,
  });

  sendJson(res, 200, { ok: true, count: saved.count, updatedAt: saved.updatedAt });
});

// DEPRECATED: POST /api/screens/pair/start
// This endpoint is DEPRECATED but still functional for backward compatibility with tests.
// The canonical flow is:
//   1. TV/Device calls POST /api/screens/pair/initiate (device-initiated)
//   2. Dashboard calls GET /api/screens/pair/peek/:code to see the code
//   3. Dashboard calls POST /api/screens/pair/complete to complete pairing
screensRouter.post('/pair/start', (req, res) => {
  logCoreLine(req, res);
  console.warn('[CORE] DEPRECATED: /api/screens/pair/start called. Dashboards should use device-initiated pairing flow.');
  console.warn('[CORE] Device should call POST /api/screens/pair/initiate, then dashboard uses GET /api/screens/pair/peek/:code and POST /api/screens/pair/complete');
  
  // Generate a pairing code for backward compatibility (tests still use this)
  const { code, expiresAt } = issuePairCode();
  const ttlLeftMs = Math.max(0, expiresAt - Date.now());
  
  sendJson(res, 201, {
    ok: true,
    code,
    ttlLeftMs,
    expiresAt: new Date(expiresAt).toISOString(),
    deprecated: true,
    message: 'This endpoint is deprecated. Use device-initiated pairing flow instead.',
  });
});

screensRouter.post('/pair', (req, res) => {
  logCoreLine(req, res);
  sendJson(res, 410, {
    ok: false,
    error: 'ENDPOINT_DEPRECATED',
    message: 'Use POST /api/devices/pair to claim pairing codes.',
  });
});

// DEPRECATED: GET /api/screens/pair/peek/:code (old in-memory store version)
// This endpoint is DEPRECATED. Use the new database-backed version at the same path.
// The new version is in src/routes/screens.js and uses the PairingSession database model.
// This old version is kept for backward compatibility but will be removed.
screensRouter.get('/pair/peek/:code', (req, res) => {
  logCoreLine(req, res);
  console.warn('[CORE] DEPRECATED: Old /api/screens/pair/peek/:code (in-memory store) called. This should use the database-backed version.');
  
  const code = (req.params.code || '').trim().toUpperCase();
  if (!code) {
    sendJson(res, 200, { ok: true, exists: false, ttlLeftMs: 0, deprecated: true });
    return;
  }
  
  // Try old in-memory store first (for backward compatibility)
  const info = getPairCodeInfo(code);
  if (!info) {
    // If not found in old store, return not found (new store will handle it via the other route)
    sendJson(res, 200, { ok: true, exists: false, ttlLeftMs: 0, deprecated: true });
    return;
  }
  
  sendJson(res, 200, { 
    ok: true, 
    exists: true, 
    ttlLeftMs: info.ttlLeftMs,
    deprecated: true,
    message: 'This endpoint uses the old in-memory store. Please use the database-backed version at the same path.'
  });
});

screensRouter.delete('/:id', (req, res) => {
  logCoreLine(req, res);
  const { id } = req.params;
  const removed = deleteScreen(id);
  if (removed) {
    broadcast('screen.removed', { id });
  }
  sendJson(res, 200, { ok: true });
});


import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_RECENT_BUFFER } from './platformActivityTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSONL_DIR = path.resolve(__dirname, '../../../data/platformActivity');

/** @type {import('./platformActivityTypes.js').PlatformActivityEvent[]} */
const recentBuffer = [];

/** @type {Set<import('express').Response>} */
const streamClients = new Set();

let jsonlPath = null;

export function isPlatformActivityEnabled() {
  const raw = String(process.env.PLATFORM_ACTIVITY_ENABLED ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function resolveJsonlPath() {
  if (jsonlPath) return jsonlPath;
  const dir = process.env.PLATFORM_ACTIVITY_JSONL_DIR?.trim() || DEFAULT_JSONL_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* non-fatal */
  }
  jsonlPath = path.join(dir, 'events.jsonl');
  return jsonlPath;
}

/**
 * @param {import('./platformActivityTypes.js').PlatformActivityEvent} record
 */
function appendJsonl(record) {
  if (!isPlatformActivityEnabled()) return;
  try {
    const line = `${JSON.stringify(record)}\n`;
    fs.appendFileSync(resolveJsonlPath(), line, { encoding: 'utf8' });
  } catch (err) {
    console.warn('[PlatformActivity] jsonl append failed', err?.message || err);
  }
}

/**
 * @param {import('./platformActivityTypes.js').PlatformActivityEvent} event
 */
export function storePlatformActivityEvent(event) {
  recentBuffer.unshift(event);
  if (recentBuffer.length > MAX_RECENT_BUFFER) {
    recentBuffer.length = MAX_RECENT_BUFFER;
  }
  appendJsonl(event);
  return event;
}

/**
 * @param {{ limit?: number, category?: string, severity?: string, since?: string }} filters
 */
export function listPlatformActivityEvents(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const sinceMs = filters.since ? Date.parse(filters.since) : NaN;
  let rows = recentBuffer;
  if (filters.category) {
    rows = rows.filter((e) => e.category === filters.category);
  }
  if (filters.severity) {
    rows = rows.filter((e) => e.severity === filters.severity);
  }
  if (Number.isFinite(sinceMs)) {
    rows = rows.filter((e) => Date.parse(e.createdAt) >= sinceMs);
  }
  return rows.slice(0, limit);
}

/** @param {import('express').Response} res */
export function addPlatformActivityStreamClient(res) {
  streamClients.add(res);
  res.on('close', () => streamClients.delete(res));
}

/** @param {import('express').Response} res */
export function removePlatformActivityStreamClient(res) {
  streamClients.delete(res);
}

/**
 * @param {import('./platformActivityTypes.js').PlatformActivityEvent} event
 */
export function broadcastPlatformActivityEvent(event) {
  const payload = JSON.stringify(event);
  const line = `event: platform-activity\ndata: ${payload}\n\n`;
  const dead = [];
  for (const res of streamClients) {
    if (res.writableEnded || res.destroyed) {
      dead.push(res);
      continue;
    }
    try {
      res.write(line);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) streamClients.delete(res);
}

/** Test helper */
export function clearPlatformActivityStoreForTests() {
  recentBuffer.length = 0;
  streamClients.clear();
  jsonlPath = null;
}

/** Test helper */
export function getPlatformActivityStreamClientCount() {
  return streamClients.size;
}

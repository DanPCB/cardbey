/**
 * Phase 1 outcome-activation events — JSON sidecar.
 * Independent of marketingOperator flags / Meta. No PII.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ACTIVATION_EVENT_TYPES = Object.freeze([
  'QUICK_START_VIEWED',
  'CAPABILITY_SELECTED',
  'CAPABILITY_STARTED',
  'FIRST_RESULT_CREATED',
  'PREVIEW_VIEWED',
  'AUTH_STARTED',
  'CLAIM_COMPLETED',
  'RESULT_PUBLISHED',
  'RESULT_SHARED',
  'NEXT_CAPABILITY_SELECTED',
  'RETURN_VISIT',
]);

export const ACTIVATION_CAPABILITIES = Object.freeze([
  'miniweb',
  'digital_card',
  'loyalty',
  'display',
  'unknown',
]);

const MAX_EVENTS = 20_000;
const DEDUPE_MS = 30 * 60 * 1000;

function defaultFilePath() {
  return join(__dirname, '../../../data/activation/events.json');
}

function trim(v, max = 120) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function normalizeActivationEvent(raw = {}) {
  const eventType = ACTIVATION_EVENT_TYPES.includes(raw.eventType) ? raw.eventType : null;
  const capability = ACTIVATION_CAPABILITIES.includes(raw.capability)
    ? raw.capability
    : 'unknown';
  return {
    eventType,
    capability,
    source: trim(raw.source),
    channel: trim(raw.channel),
    campaign: trim(raw.campaign || raw.utmCampaign),
    content: trim(raw.content || raw.utmContent),
    language: raw.language === 'vi' ? 'vi' : raw.language === 'en' ? 'en' : trim(raw.language, 8),
    country: trim(raw.country, 8),
    variant: trim(raw.variant, 32),
    entryCapability: ACTIVATION_CAPABILITIES.includes(raw.entryCapability)
      ? raw.entryCapability
      : capability,
    anonymousId: trim(raw.anonymousId, 80),
    userId: trim(raw.userId, 80),
    businessId: trim(raw.businessId, 80),
    path: trim(raw.path, 200),
  };
}

function dedupeKey(evt, atMs) {
  const bucket = Math.floor(atMs / DEDUPE_MS);
  return [
    evt.eventType,
    evt.capability,
    evt.anonymousId || 'anon',
    evt.variant || '-',
    evt.path || '-',
    bucket,
  ].join(':');
}

async function readStore(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

async function writeStore(filePath, events) {
  await mkdir(dirname(filePath), { recursive: true });
  const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
  await writeFile(filePath, `${JSON.stringify({ events: trimmed }, null, 2)}\n`, 'utf8');
}

/**
 * @returns {{ ok: true, recorded: boolean, deduped?: boolean, skipped?: boolean, reason?: string }}
 */
export async function recordActivationEvent(raw, options = {}) {
  const evt = normalizeActivationEvent(raw);
  if (!evt.eventType) {
    return { ok: true, recorded: false, skipped: true, reason: 'invalid_event_type' };
  }
  const now = options.now ?? Date.now();
  const filePath = options.filePath || defaultFilePath();
  const events = await readStore(filePath);
  const key = dedupeKey(evt, now);
  const exists = events.some((e) => e.dedupeKey === key);
  if (exists) {
    return { ok: true, recorded: false, deduped: true };
  }
  events.push({
    ...evt,
    dedupeKey: key,
    at: new Date(now).toISOString(),
  });
  await writeStore(filePath, events);
  return { ok: true, recorded: true };
}

function emptyCounts() {
  const o = {};
  for (const t of ACTIVATION_EVENT_TYPES) o[t] = 0;
  return o;
}

export function summarizeActivationEvents(events) {
  const totals = emptyCounts();
  const byCapability = {};
  const byVariant = {};
  for (const cap of ACTIVATION_CAPABILITIES) {
    byCapability[cap] = emptyCounts();
  }
  for (const e of events) {
    if (!e?.eventType || totals[e.eventType] == null) continue;
    totals[e.eventType] += 1;
    const cap = byCapability[e.capability] ? e.capability : 'unknown';
    byCapability[cap][e.eventType] += 1;
    if (e.variant) {
      if (!byVariant[e.variant]) byVariant[e.variant] = emptyCounts();
      if (byVariant[e.variant][e.eventType] != null) byVariant[e.variant][e.eventType] += 1;
    }
  }
  return {
    totalEvents: events.length,
    totals,
    byCapability,
    byVariant,
  };
}

export async function loadActivationFunnel(options = {}) {
  const filePath = options.filePath || defaultFilePath();
  const events = await readStore(filePath);
  return {
    ok: true,
    source: 'outcome_activation_json',
    liveMeta: false,
    discoveredBusinessFunnel: false,
    ...summarizeActivationEvents(events),
  };
}

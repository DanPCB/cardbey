/**
 * LLM cache v1.1: get/set by prompt hash (SHA-256), tenant-scoped, purpose, TTL, access tracking.
 * Cost controls: response/prompt caps, per-tenant LRU eviction, reduced hit writes.
 */

import crypto from 'crypto';

const DEFAULT_PROVIDER = 'kimi';
const DEFAULT_MODEL = 'kimi-k2.5';
const DEFAULT_TENANT = 'global';
const DEFAULT_PURPOSE = 'llm';
const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

// v1.1 policy constants (tune via env optional: process.env.LLM_CACHE_MAX_RESPONSE_BYTES etc.)
const MAX_CACHE_RESPONSE_BYTES = Number(process.env.LLM_CACHE_MAX_RESPONSE_BYTES) || 32 * 1024; // 32KB
const MAX_CACHE_PROMPT_CHARS = Number(process.env.LLM_CACHE_MAX_PROMPT_CHARS) || 8 * 1024; // 8k chars
const MAX_ROWS_PER_TENANT = Number(process.env.LLM_CACHE_MAX_ROWS_PER_TENANT) || 2000;
const EVICT_BATCH_SIZE = Number(process.env.LLM_CACHE_EVICT_BATCH_SIZE) || 200;
const ACCESS_UPDATE_MIN_INTERVAL_MS = Number(process.env.LLM_CACHE_ACCESS_UPDATE_MIN_MS) || 5 * 60 * 1000; // 5 min

const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

/**
 * Skip caching for empty, oversized, or high-entropy (UUID-like) prompts.
 * @param {string} prompt
 * @returns {boolean} true = skip cache read/write
 */
export function shouldSkipCacheForPrompt(prompt) {
  const p = (prompt || '').trim();
  if (!p) return true;
  if (p.length > MAX_CACHE_PROMPT_CHARS) return true;
  if (UUID_REGEX.test(p)) return true;
  return false;
}

/**
 * @param {string} prompt
 * @returns {string} SHA-256 hex hash of normalized prompt
 */
export function hashPrompt(prompt) {
  const normalized = (prompt || '').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} promptHash
 * @param {string} [provider]
 * @param {string} [model]
 * @param {string} [tenantKey]
 * @param {string} [purpose]
 * @returns {Promise<{ text: string; model?: string } | null>}
 */
export async function getCached(prisma, promptHash, provider = DEFAULT_PROVIDER, model = DEFAULT_MODEL, tenantKey = DEFAULT_TENANT, purpose = DEFAULT_PURPOSE) {
  if (!promptHash) return null;
  const modelVal = model || '';
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const purp = purpose ?? DEFAULT_PURPOSE;
  const row = await prisma.llmCache.findUnique({
    where: {
      LlmCache_key: {
        tenantKey: tenant,
        purpose: purp,
        promptHash,
        provider,
        model: modelVal,
      },
    },
    select: { response: true, model: true, expiresAt: true, id: true, lastAccessedAt: true },
  });
  if (!row) return null;
  const now = new Date();
  if (row.expiresAt <= now) return null;

  const lastAt = row.lastAccessedAt ? new Date(row.lastAccessedAt).getTime() : 0;
  if (now.getTime() - lastAt <= ACCESS_UPDATE_MIN_INTERVAL_MS) {
    return { text: row.response, model: row.model ?? undefined };
  }

  try {
    await prisma.llmCache.update({
      where: {
        LlmCache_key: {
          tenantKey: tenant,
          purpose: purp,
          promptHash,
          provider,
          model: modelVal,
        },
      },
      data: { lastAccessedAt: now, hitCount: { increment: 1 } },
    });
  } catch (_) {
    // best-effort; return cached result anyway
  }
  return { text: row.response, model: row.model ?? undefined };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} promptHash
 * @param {string} response
 * @param {string} [provider]
 * @param {string} [model]
 * @param {string} [tenantKey]
 * @param {string} [purpose]
 * @param {number} [ttlSeconds]
 */
export async function setCached(prisma, promptHash, response, provider = DEFAULT_PROVIDER, model = DEFAULT_MODEL, tenantKey = DEFAULT_TENANT, purpose = DEFAULT_PURPOSE, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!promptHash) return;
  if (!response || typeof response !== 'string') return;
  const responseBytes = Buffer.byteLength(response, 'utf8');
  if (responseBytes > MAX_CACHE_RESPONSE_BYTES) return;

  const modelVal = model || '';
  const tenant = tenantKey ?? DEFAULT_TENANT;
  const purp = purpose ?? DEFAULT_PURPOSE;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  await prisma.llmCache.upsert({
    where: {
      LlmCache_key: {
        tenantKey: tenant,
        purpose: purp,
        promptHash,
        provider,
        model: modelVal,
      },
    },
    create: {
      tenantKey: tenant,
      purpose: purp,
      promptHash,
      provider,
      model: modelVal,
      response,
      createdAt: now,
      expiresAt,
      lastAccessedAt: now,
      hitCount: 0,
    },
    update: { response, expiresAt, lastAccessedAt: now },
  });

  try {
    await enforceTenantCap(prisma, tenant, purp);
  } catch (_) {
    // best-effort; never fail the job
  }
}

/**
 * Per-tenant LRU eviction: if count > MAX_ROWS_PER_TENANT, delete oldest-by-lastAccessedAt (batch).
 * Call only after a successful cache write; non-fatal.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} [tenantKey]
 * @param {string} [purpose]
 */
export async function enforceTenantCap(prisma, tenantKey, purpose) {
  if (!tenantKey) return;
  const purp = purpose ?? DEFAULT_PURPOSE;
  const count = await prisma.llmCache.count({
    where: { tenantKey, purpose: purp },
  });
  if (count <= MAX_ROWS_PER_TENANT) return;

  const toDelete = Math.min(count - MAX_ROWS_PER_TENANT, EVICT_BATCH_SIZE);
  const victims = await prisma.llmCache.findMany({
    where: { tenantKey, purpose: purp },
    orderBy: { lastAccessedAt: 'asc' },
    take: toDelete,
    select: { id: true },
  });
  if (!victims.length) return;

  await prisma.llmCache.deleteMany({
    where: { id: { in: victims.map((v) => v.id) } },
  });
}

/**
 * Delete all cache rows with expiresAt < now.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ count: number }>}
 */
export async function purgeExpired(prisma) {
  const now = new Date();
  const result = await prisma.llmCache.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return { count: result.count };
}

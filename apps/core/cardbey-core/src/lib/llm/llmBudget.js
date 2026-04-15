/**
 * LLM Budget Guard v1.1: per-tenant daily caps (max calls, max estimated tokens).
 * Reserve = tokensIn + tokensOutCeiling; true-up after provider; Postgres strict CAS, SQLite best-effort.
 * Best-effort: never crashes the process; FAIL_OPEN/FAIL_CLOSED via env.
 */

import { Prisma } from '@prisma/client';

const DEFAULT_PURPOSE = 'llm';
const DEFAULT_PROVIDER = 'kimi';
const BUDGET_MODEL = ''; // aggregate all models per tenant/provider/day

const LLM_BUDGET_ENABLED = Number(process.env.LLM_BUDGET_ENABLED) !== 0;
const LLM_BUDGET_MAX_CALLS_PER_TENANT_PER_DAY = Number(process.env.LLM_BUDGET_MAX_CALLS_PER_TENANT_PER_DAY) || 200;
const LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY = Number(process.env.LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY) || 200000;
const LLM_BUDGET_FAIL_OPEN = Number(process.env.LLM_BUDGET_FAIL_OPEN) === 1;
/** v1.1: constant per-call output reserve ceiling (reserved before provider call). */
const LLM_BUDGET_RESERVE_OUT_TOKENS_CEILING = Number(process.env.LLM_BUDGET_RESERVE_OUT_TOKENS_CEILING) || 1200;
/** v1.1: if 1, allow subtracting unused reserved out tokens on true-up; if 0, only add deltas upward. */
const LLM_BUDGET_TRUE_UP_ALLOW_DECREMENT = Number(process.env.LLM_BUDGET_TRUE_UP_ALLOW_DECREMENT) === 1;

/** Detect Postgres from DATABASE_URL for strict CAS path; otherwise SQLite/fallback. */
function isPostgres(prisma) {
  try {
    const url = process.env.DATABASE_URL || '';
    return url.startsWith('postgres');
  } catch {
    return false;
  }
}

/**
 * UTC day bucket string YYYY-MM-DD.
 * @param {Date} [date]
 * @returns {string}
 */
export function getUtcDayString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Rough token estimate: tokens ≈ ceil(chars / 4). Stable heuristic for budget only.
 * @param {string} prompt
 * @param {string} [responseText]
 * @returns {{ tokensIn: number, tokensOut: number }}
 */
export function estimateTokens(prompt, responseText) {
  const charsIn = (prompt || '').length;
  const charsOut = (responseText || '').length;
  return {
    tokensIn: Math.ceil(charsIn / 4),
    tokensOut: Math.ceil(charsOut / 4),
  };
}

/**
 * v1.1: Output token ceiling for reserve. Constant from env (simple).
 * @param {string} [_prompt] - unused when using constant ceiling
 * @returns {number}
 */
export function estimateTokensOutCeiling(_prompt) {
  return LLM_BUDGET_RESERVE_OUT_TOKENS_CEILING;
}

/**
 * Check daily budget and, if allowed, reserve one call + tokensIn + tokensOutCeiling.
 * Postgres: single atomic UPDATE ... WHERE ... AND guards ... RETURNING (strict).
 * SQLite: transaction upsert → read → conditional update (best-effort).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantKey: string, purpose?: string, provider: string, model?: string, prompt: string }} opts
 * @returns {Promise<{ allowed: true, day: string, reservedTokensIn: number, reservedTokensOut: number } | { allowed: false, reason: string }>}
 */
export async function checkAndReserveBudget(prisma, opts) {
  const tenantKey = opts.tenantKey ?? 'global';
  const purpose = opts.purpose || DEFAULT_PURPOSE;
  const provider = opts.provider || DEFAULT_PROVIDER;
  const model = opts.model ?? BUDGET_MODEL;
  const prompt = opts.prompt ?? '';
  const day = getUtcDayString();
  const reservedTokensIn = Math.max(0, estimateTokens(prompt).tokensIn);
  const reservedTokensOut = Math.max(0, estimateTokensOutCeiling(prompt));
  const reservedTotal = reservedTokensIn + reservedTokensOut;
  const maxCalls = LLM_BUDGET_MAX_CALLS_PER_TENANT_PER_DAY;
  const maxTokens = LLM_BUDGET_MAX_TOKENS_PER_TENANT_PER_DAY;

  if (isPostgres(prisma)) {
    return checkAndReserveBudgetPostgres(prisma, {
      tenantKey,
      purpose,
      provider,
      model,
      day,
      reservedTokensIn,
      reservedTokensOut,
      maxCalls,
      maxTokens,
    });
  }

  return checkAndReserveBudgetSQLite(prisma, {
    tenantKey,
    purpose,
    provider,
    model,
    day,
    reservedTokensIn,
    reservedTokensOut,
    reservedTotal,
    maxCalls,
    maxTokens,
  });
}

/**
 * Postgres: upsert then single atomic UPDATE with guards; RETURNING id => allowed.
 * @private
 */
async function checkAndReserveBudgetPostgres(prisma, params) {
  const {
    tenantKey,
    purpose,
    provider,
    model,
    day,
    reservedTokensIn,
    reservedTokensOut,
    maxCalls,
    maxTokens,
  } = params;

  const result = await prisma.$transaction(async (tx) => {
    await tx.llmUsageDaily.upsert({
      where: {
        LlmUsageDaily_key: { tenantKey, purpose, provider, model, day },
      },
      create: {
        tenantKey,
        purpose,
        provider,
        model,
        day,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
      },
      update: {},
    });

    const rows = await tx.$queryRaw(
      Prisma.sql`
      UPDATE "LlmUsageDaily"
      SET "calls" = "calls" + 1,
          "tokensIn" = "tokensIn" + ${reservedTokensIn},
          "tokensOut" = "tokensOut" + ${reservedTokensOut}
      WHERE "tenantKey" = ${tenantKey}
        AND "purpose" = ${purpose}
        AND "provider" = ${provider}
        AND "model" = ${model}
        AND "day" = ${day}
        AND ("calls" + 1) <= ${maxCalls}
        AND ("tokensIn" + "tokensOut" + ${reservedTokensIn} + ${reservedTokensOut}) <= ${maxTokens}
      RETURNING "id"
      `,
    );

    if (rows && rows.length > 0) {
      return { allowed: true, day, reservedTokensIn, reservedTokensOut };
    }
    return { allowed: false, reason: 'LLM_BUDGET_EXCEEDED: daily limit reached' };
  });

  return result;
}

/**
 * SQLite (and fallback): transaction read-then-update; limits may be slightly exceeded under concurrency.
 * @private
 */
async function checkAndReserveBudgetSQLite(prisma, params) {
  const {
    tenantKey,
    purpose,
    provider,
    model,
    day,
    reservedTokensIn,
    reservedTokensOut,
    reservedTotal,
    maxCalls,
    maxTokens,
  } = params;

  const result = await prisma.$transaction(async (tx) => {
    await tx.llmUsageDaily.upsert({
      where: {
        LlmUsageDaily_key: { tenantKey, purpose, provider, model, day },
      },
      create: {
        tenantKey,
        purpose,
        provider,
        model,
        day,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
      },
      update: {},
    });

    const row = await tx.llmUsageDaily.findUnique({
      where: { LlmUsageDaily_key: { tenantKey, purpose, provider, model, day } },
      select: { calls: true, tokensIn: true, tokensOut: true },
    });
    if (!row) return { allowed: false, reason: 'LLM_BUDGET_EXCEEDED: daily limit reached' };

    const totalTokens = row.tokensIn + row.tokensOut;
    if (row.calls >= maxCalls) return { allowed: false, reason: 'LLM_BUDGET_EXCEEDED: daily limit reached' };
    if (totalTokens + reservedTotal > maxTokens) return { allowed: false, reason: 'LLM_BUDGET_EXCEEDED: daily limit reached' };

    await tx.llmUsageDaily.update({
      where: { LlmUsageDaily_key: { tenantKey, purpose, provider, model, day } },
      data: {
        calls: { increment: 1 },
        tokensIn: { increment: reservedTokensIn },
        tokensOut: { increment: reservedTokensOut },
      },
    });

    return { allowed: true, day, reservedTokensIn, reservedTokensOut };
  });

  return result;
}

/**
 * True-up output tokens after provider returns.
 * delta = actualTokensOut - reservedTokensOut.
 * If delta > 0: increment tokensOut by delta.
 * If delta < 0 and TRUE_UP_ALLOW_DECREMENT: decrement by |delta|; never allow tokensOut to go negative.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantKey?: string, purpose?: string, provider: string, model?: string, day: string, actualTokensOut: number, reservedTokensOut: number }} opts
 */
export async function commitBudget(prisma, opts) {
  const tenantKey = opts.tenantKey ?? 'global';
  const purpose = opts.purpose || DEFAULT_PURPOSE;
  const provider = opts.provider || DEFAULT_PROVIDER;
  const model = opts.model ?? BUDGET_MODEL;
  const { day, actualTokensOut, reservedTokensOut } = opts;
  if (day == null || actualTokensOut == null || reservedTokensOut == null) return;

  const actual = Math.max(0, Number.isFinite(Number(actualTokensOut)) ? Math.floor(Number(actualTokensOut)) : 0);
  const reserved = Math.max(0, Number.isFinite(Number(reservedTokensOut)) ? Math.floor(Number(reservedTokensOut)) : 0);
  const delta = actual - reserved;
  if (delta === 0) return;

  if (delta > 0) {
    await prisma.llmUsageDaily.updateMany({
      where: { tenantKey, purpose, provider, model, day },
      data: { tokensOut: { increment: delta } },
    });
    return;
  }

  if (LLM_BUDGET_TRUE_UP_ALLOW_DECREMENT && delta < 0) {
    const whereKey = { LlmUsageDaily_key: { tenantKey, purpose, provider, model, day } };
    const row = await prisma.llmUsageDaily.findUnique({
      where: whereKey,
      select: { tokensOut: true },
    });
    if (!row) return;
    const newTokensOut = Math.max(0, row.tokensOut + delta);
    await prisma.llmUsageDaily.update({
      where: whereKey,
      data: { tokensOut: newTokensOut },
    });
  }
}

export function isBudgetEnabled() {
  return LLM_BUDGET_ENABLED;
}

export function isFailOpen() {
  return LLM_BUDGET_FAIL_OPEN;
}

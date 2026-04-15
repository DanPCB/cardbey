/**
 * Run LLM_GENERATE_COPY OrchestratorTask.
 * All status changes go through transitionOrchestratorTaskStatus (AuditEvent on every change).
 * Does not block store readiness; this task is best-effort.
 */

import { transitionOrchestratorTaskStatus } from '../../kernel/transitions/transitionService.js';
import { hashPrompt, getCached, setCached, purgeExpired, shouldSkipCacheForPrompt } from '../../lib/llm/llmCache.js';
import { checkAndReserveBudget, commitBudget, estimateTokens, isBudgetEnabled, isFailOpen } from '../../lib/llm/llmBudget.js';
import { LLM_ENTRY_POINT } from '../../lib/llm/types.js';

const ACTOR = 'worker';
const REASON = 'LLM_GENERATE_COPY';
const PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastPurgeAt = 0;

/**
 * Run a single llm_generate_copy task: queued -> running -> completed | failed.
 * Uses kernel transitions only. Checks cache by prompt hash (tenant-scoped) before calling provider.
 * Call with task in "queued"; this function performs queued->running then work.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} taskId
 * @param {{ prompt: string; provider?: string }} request - task.request
 * @param {{ generateText: (prompt: string, opts?: { timeoutMs?: number; maxRetries?: number }) => Promise<{ text: string; model?: string }> }} providerClient
 */
export async function runLlmGenerateCopyJob(prisma, taskId, request, providerClient) {
  const correlationId = taskId;

  if (Date.now() - lastPurgeAt > PURGE_INTERVAL_MS) {
    try {
      await purgeExpired(prisma);
      lastPurgeAt = Date.now();
    } catch (e) {
      // non-fatal
    }
  }

  const task = await prisma.orchestratorTask.findUnique({ where: { id: taskId }, select: { tenantId: true, userId: true } }).catch(() => null);
  const tenantKey = task?.tenantId ?? task?.userId ?? 'global';
  const purpose = LLM_ENTRY_POINT;

  const toRunning = await transitionOrchestratorTaskStatus({
    prisma,
    taskId,
    toStatus: 'running',
    fromStatus: 'queued',
    actorType: ACTOR,
    reason: REASON,
    correlationId,
  });
  if (!toRunning.ok) return;

  const prompt = typeof request?.prompt === 'string' ? request.prompt : '';
  if (!prompt.trim()) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: ACTOR,
      reason: REASON,
      correlationId,
      result: { error: 'missing_prompt' },
    });
    return;
  }

  const providerName = request?.provider || 'kimi';

  const skipCache = shouldSkipCacheForPrompt(prompt);
  let cached = null;
  if (!skipCache) {
    const promptHash = hashPrompt(prompt);
    cached = await getCached(prisma, promptHash, providerName, undefined, tenantKey, purpose);
  }

  if (cached) {
    const tr = await transitionOrchestratorTaskStatus({
      prisma,
      taskId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: ACTOR,
      reason: REASON,
      correlationId,
      result: { text: cached.text, model: cached.model, fromCache: true },
    });
    if (!tr.ok) throw new Error(tr.message || 'transition failed');
    return;
  }

  let budgetReservation = null;
  if (isBudgetEnabled()) {
    try {
      const budgetResult = await checkAndReserveBudget(prisma, {
        tenantKey,
        purpose,
        provider: providerName,
        prompt,
      });
      if (!budgetResult.allowed) {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: ACTOR,
          reason: REASON,
          correlationId,
          result: { error: budgetResult.reason },
        });
        return;
      }
      budgetReservation = budgetResult;
    } catch (budgetErr) {
      if (!isFailOpen()) {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: ACTOR,
          reason: REASON,
          correlationId,
          result: { error: 'LLM_BUDGET_CHECK_FAILED' },
        });
        return;
      }
      // FAIL_OPEN: allow provider call
    }
  }

  try {
    const result = await providerClient.generateText(prompt, { timeoutMs: 60000, maxRetries: 3 });
    if (budgetReservation) {
      try {
        const actualTokensOut = result?.usage?.outputTokens ?? estimateTokens(prompt, result?.text).tokensOut;
        await commitBudget(prisma, {
          tenantKey,
          purpose,
          provider: providerName,
          model: '',
          day: budgetReservation.day,
          actualTokensOut,
          reservedTokensOut: budgetReservation.reservedTokensOut,
        });
      } catch (_) {
        // best-effort; don't fail the task
      }
    }
    if (!skipCache) {
      const promptHash = hashPrompt(prompt);
      await setCached(prisma, promptHash, result.text, providerName, result.model, tenantKey, purpose);
    }

    const tr = await transitionOrchestratorTaskStatus({
      prisma,
      taskId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: ACTOR,
      reason: REASON,
      correlationId,
      result: { text: result.text, model: result.model, fromCache: false },
    });
    if (!tr.ok) throw new Error(tr.message || 'transition failed');
  } catch (err) {
    const tr = await transitionOrchestratorTaskStatus({
      prisma,
      taskId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: ACTOR,
      reason: REASON,
      correlationId,
      metadata: { error: err?.message || String(err) },
      result: { error: err?.message || String(err) },
    });
    if (!tr.ok) throw new Error(tr.message || 'transition failed');
  }
}

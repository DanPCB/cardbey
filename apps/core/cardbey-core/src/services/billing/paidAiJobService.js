/**
 * Idempotency for paid AI: at most one running job per (userId, refId, actionName).
 * Call startJob before work; if already running return { inProgress: true }. Only consume credits when completeJob(success).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATUS = { running: 'running', succeeded: 'succeeded', failed: 'failed' };

/**
 * Try to start a paid AI job. If one is already running for this key, return inProgress.
 * @param {{ userId: string, refId: string, actionName: string }}
 * @returns {{ jobId: string, inProgress: boolean }}
 */
export async function startPaidAiJob({ userId, refId, actionName }) {
  const existing = await prisma.paidAiJob.findUnique({
    where: {
      userId_refId_actionName: { userId, refId, actionName },
    },
  });
  if (existing && existing.status === STATUS.running) {
    return { jobId: existing.id, inProgress: true };
  }
  const job = await prisma.paidAiJob.upsert({
    where: {
      userId_refId_actionName: { userId, refId, actionName },
    },
    create: {
      userId,
      refId,
      actionName,
      status: STATUS.running,
    },
    update: { status: STATUS.running, updatedAt: new Date() },
  });
  return { jobId: job.id, inProgress: false };
}

/**
 * Mark job succeeded or failed. Call after the AI work completes. Caller consumes credits only when success.
 * @param {{ jobId: string, success: boolean }}
 */
export async function completePaidAiJob({ jobId, success }) {
  await prisma.paidAiJob.updateMany({
    where: { id: jobId, status: STATUS.running },
    data: {
      status: success ? STATUS.succeeded : STATUS.failed,
      updatedAt: new Date(),
    },
  });
}

/**
 * Credits and welcome bundle: balance, grant, spend, consume bundle.
 * Transaction-safe; only paid_ai consumes credits or bundle.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WELCOME_BUNDLE_FULL_STORE_COUNT = parseInt(process.env.WELCOME_BUNDLE_FULL_STORE_COUNT || '1', 10);
const TRIAL_AI_CREDITS = parseInt(process.env.TRIAL_AI_CREDITS || '0', 10);

/**
 * @param {string} userId
 * @returns {Promise<{ aiCreditsBalance: number, welcomeFullStoreRemaining: number }>}
 */
export async function getBalance(userId) {
  if (!userId) {
    return { aiCreditsBalance: 0, welcomeFullStoreRemaining: 0 };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCreditsBalance: true, welcomeFullStoreRemaining: true },
  });
  if (!user) {
    return { aiCreditsBalance: 0, welcomeFullStoreRemaining: 0 };
  }
  return {
    aiCreditsBalance: user.aiCreditsBalance ?? 0,
    welcomeFullStoreRemaining: Math.max(0, user.welcomeFullStoreRemaining ?? 0),
  };
}

/**
 * Grant welcome bundle on register. Idempotent: only sets if user still has default (1) or unset; does not re-grant after use.
 */
export async function grantWelcomeBundleOnRegister(userId) {
  if (!userId) return;
  const count = Math.max(1, WELCOME_BUNDLE_FULL_STORE_COUNT);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { welcomeFullStoreRemaining: true, aiCreditsBalance: true },
  });
  if (!user) return;
  const current = user.welcomeFullStoreRemaining ?? 1;
  if (current < 1) return;
  const data = { welcomeFullStoreRemaining: count };
  if (TRIAL_AI_CREDITS > 0 && (user.aiCreditsBalance ?? 0) === 0) {
    data.aiCreditsBalance = TRIAL_AI_CREDITS;
  }
  await prisma.user.update({
    where: { id: userId },
    data,
  });
}

/**
 * @param {string} userId
 * @param {{ images?: number, textUnits?: number }} estimate - textUnits 1 = 5 credits (menu), each image = 1 credit
 * @returns {Promise<boolean>}
 */
export function estimateCost(estimate) {
  const images = Math.max(0, estimate?.images ?? 0);
  const textUnits = Math.max(0, estimate?.textUnits ?? 0);
  return textUnits * 5 + images * 1;
}

/**
 * @param {string} userId
 * @param {number} cost
 * @param {number} welcomeRemaining - if > 0, one "full store" can use bundle instead
 * @returns {Promise<boolean>}
 */
export async function canSpend(userId, cost, welcomeRemaining = 0) {
  if (!userId || cost <= 0) return false;
  if (welcomeRemaining > 0) return true; // can use bundle
  const { aiCreditsBalance } = await getBalance(userId);
  return aiCreditsBalance >= cost;
}

/**
 * Deduct credits. Call only after successful paid AI work. Transaction-safe.
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @param {string} [refId]
 */
export async function spendCredits(userId, amount, reason, refId = null) {
  if (!userId || amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { aiCreditsBalance: true } });
    if (!u) throw new Error('User not found');
    const current = u.aiCreditsBalance ?? 0;
    if (current < amount) {
      const err = new Error('Insufficient credits');
      err.code = 'INSUFFICIENT_CREDITS';
      err.status = 402;
      throw err;
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        aiCreditsBalance: { decrement: amount },
        aiCreditsUpdatedAt: new Date(),
      },
    });
  });
}

/**
 * Consume one welcome full-store use. Call only after successful paid AI full store. Transaction-safe.
 * welcomeFullStoreRemaining never goes below 0 (explicit clamp in update).
 * @param {string} userId
 * @param {string} reason
 * @param {string} [refId]
 */
export async function consumeWelcomeBundle(userId, reason, refId = null) {
  if (!userId) return;
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { welcomeFullStoreRemaining: true } });
    if (!u) throw new Error('User not found');
    const current = Math.max(0, u.welcomeFullStoreRemaining ?? 0);
    if (current < 1) {
      const err = new Error('No welcome bundle remaining');
      err.code = 'INSUFFICIENT_CREDITS';
      err.status = 402;
      throw err;
    }
    const next = Math.max(0, current - 1);
    await tx.user.update({
      where: { id: userId },
      data: { welcomeFullStoreRemaining: next, aiCreditsUpdatedAt: new Date() },
    });
  });
}

/**
 * Dev-only: Add credits to a user (for testing top-up flow). Do not use in production.
 * @param {string} userId
 * @param {number} amount - Credits to add (positive integer).
 * @returns {Promise<{ aiCreditsBalance: number }>} New balance after add.
 */
export async function addCreditsForDev(userId, amount) {
  if (!userId || amount == null || amount < 0) {
    throw new Error('userId and a non-negative amount are required');
  }
  const add = Math.floor(Number(amount)) || 0;
  if (add === 0) {
    return getBalance(userId);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      aiCreditsBalance: { increment: add },
      aiCreditsUpdatedAt: new Date(),
    },
    select: { aiCreditsBalance: true },
  });
  return { aiCreditsBalance: user.aiCreditsBalance ?? 0 };
}

/**
 * Mission table helpers (Phase A: additive only).
 * getOrCreateMission: lazy-create a Mission row by id; does not mutate existing rows.
 * mergeMissionContext: merge a patch into Mission.context (e.g. chainPlan). Creates mission row if missing only when user provided.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { getTenantId } from './tenant.js';

/** Guest JWT users have no User row yet; Mission.createdByUserId FK requires one. */
function isGuestSessionUserId(id) {
  return typeof id === 'string' && id.trim().toLowerCase().startsWith('guest_');
}

/**
 * Upsert a minimal User so Mission (and other FKs) can reference guest session ids.
 * Idempotent; safe to call before Mission.create for guest tokens.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
export async function ensureShadowUserRowForGuest(prisma, userId) {
  if (!isGuestSessionUserId(userId)) return;
  const id = String(userId).trim();
  const email = `${id.replace(/@/g, '_at_')}@guest.cardbey.internal`;
  try {
    await prisma.user.upsert({
      where: { id },
      create: {
        id,
        email,
        passwordHash: '__guest_no_password__',
        displayName: 'Guest',
        role: 'viewer',
        roles: '["viewer"]',
      },
      update: {},
    });
  } catch (e) {
    console.warn('[Mission] ensureShadowUserRowForGuest failed:', e?.message || e);
  }
}

/**
 * Get or create a Mission by id.
 * - Looks up Mission by id (missionId). missionId is trimmed internally; callers may pass untrimmed.
 * - If missing, creates it with tenantId and createdByUserId from user (via shared getTenantId); optional title.
 * - Does NOT mutate an existing Mission (no title/context updates).
 *
 * @param {string} missionId - Mission id (e.g. existing OrchestratorTask.id or new id). Trimmed before use.
 * @param {object} user - User object with id and optionally business.id for tenantId.
 * @param {{ title?: string, prisma?: object }} [options] - Optional title when creating; optional prisma client (same as route for consistent DB).
 * @returns {Promise<{ id: string, tenantId: string, createdByUserId: string, title?: string, status: string, context?: object, createdAt: Date, updatedAt: Date }>}
 */
export async function getOrCreateMission(missionId, user, options = {}) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
    throw new Error('missionId is required');
  }
  if (!user?.id) {
    throw new Error('user with id is required');
  }
  const prisma = options.prisma ?? getPrismaClient();
  const id = missionId.trim();

  const existing = await prisma.mission.findUnique({
    where: { id },
  });
  if (existing) return existing;

  await ensureShadowUserRowForGuest(prisma, user.id);

  const tenantId = getTenantId(user);
  const title = options?.title != null ? String(options.title).trim() || null : null;

  const mission = await prisma.mission.create({
    data: {
      id,
      tenantId,
      createdByUserId: user.id,
      title,
      status: 'active', // v0: string; when adding logic, use MissionStatus enum to avoid typo-states
    },
  });
  return mission;
}

/**
 * Merge a patch into Mission.context. Mission must already exist.
 * Deep-merges patch into existing context (so e.g. context.chainPlan is merged, not replaced entirely if patch is { chainPlan: { mode: 'auto_safe' } }).
 *
 * @param {string} missionId - Mission id (trimmed).
 * @param {object} patch - Object to merge into context (e.g. { chainPlan: { mode: 'auto_safe' } }).
 * @param {{ prisma?: object }} [options] - Optional prisma instance (e.g. from route so same client as other writes).
 * @returns {Promise<object|null>} Updated mission context or null if mission not found
 */
export async function mergeMissionContext(missionId, patch, options = {}) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) return null;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const prisma = options.prisma ?? getPrismaClient();
  const id = missionId.trim();
  const mission = await prisma.mission.findUnique({
    where: { id },
    select: { context: true },
  });
  if (!mission) return null;
  const existing = (mission.context && typeof mission.context === 'object') ? mission.context : {};
  const merged = deepMerge(existing, patch);
  try {
    await prisma.mission.update({
      where: { id },
      data: { context: merged, updatedAt: new Date() },
    });
  } catch (e) {
    if (e?.code === 'P2025') {
      console.warn('[mergeMissionContext] mission row missing at update (race or deleted):', id);
      return null;
    }
    throw e;
  }
  return merged;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] != null && typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
      out[key] = deepMerge(out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? out[key] : {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Update a single step's status inside Mission.context.missionPlan[jobId].steps.
 * Finds the step by stepId and merges patch (e.g. { status: 'running' }) into it.
 * No-op if mission, plan, or step not found. Never throws.
 *
 * @param {string} missionId
 * @param {string} jobId - key in missionPlan map
 * @param {string} stepId - step to update
 * @param {object} patch - e.g. { status: 'running' | 'completed' | 'failed' | 'skipped' }
 * @param {{ prisma?: object }} [options]
 * @returns {Promise<boolean>} true if step was found and updated
 */
export async function mergeMissionPlanStep(missionId, jobId, stepId, patch, options = {}) {
  if (!missionId || !jobId || !stepId || !patch) return false;
  const prisma = options.prisma ?? getPrismaClient();
  try {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      select: { context: true },
    });
    if (!mission) return false;

    const ctx = mission.context && typeof mission.context === 'object' ? mission.context : {};
    const plan = ctx.missionPlan?.[jobId];
    if (!plan || !Array.isArray(plan.steps)) return false;

    const stepIndex = plan.steps.findIndex((s) => s.stepId === stepId);
    if (stepIndex === -1) return false;

    const updatedSteps = plan.steps.map((s) =>
      s.stepId === stepId ? { ...s, ...patch } : s
    );
    const updatedPlan = { ...plan, steps: updatedSteps };
    const updatedContext = {
      ...ctx,
      missionPlan: { ...ctx.missionPlan, [jobId]: updatedPlan },
    };

    await prisma.mission.update({
      where: { id: missionId },
      data: { context: updatedContext, updatedAt: new Date() },
    });
    return true;
  } catch (e) {
    console.warn('[mergeMissionPlanStep] failed (non-fatal):', e?.message);
    return false;
  }
}

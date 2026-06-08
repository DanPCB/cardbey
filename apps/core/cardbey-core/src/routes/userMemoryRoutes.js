/**
 * Universal PIL Assistant — user memory and onboarding progress API.
 * GET  /api/users/:userId/memory
 * POST /api/users/:userId/memory/record
 * POST /api/users/:userId/memory/abandoned
 * POST /api/users/:userId/memory/complete
 * GET  /api/users/:userId/onboarding
 */
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { hasRole } from '../lib/authorization.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = express.Router();

let missingTableWarned = false;

function isMissingTableError(err) {
  return (
    err?.code === 'P2021' ||
    /table .* does not exist/i.test(String(err?.message ?? '')) ||
    /OnboardingProgress/i.test(String(err?.message ?? '')) ||
    /UserMemory/i.test(String(err?.message ?? ''))
  );
}

function warnMissingTableOnce(label) {
  if (missingTableWarned) return;
  missingTableWarned = true;
  console.warn(
    `[userMemory] ${label} table missing — run prisma migrate. Returning safe defaults until migrated.`,
  );
}

function canAccessUser(req, userId) {
  const actorId = req.user?.id ? String(req.user.id) : '';
  if (actorId === userId) return true;
  return hasRole(req.user, 'super_admin') || hasRole(req.user, 'admin');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatMemory(row) {
  if (!row) {
    return {
      previousVisits: 0,
      visitCount: 0,
      abandonedTasks: [],
      completedTasks: [],
    };
  }
  return {
    previousVisits: row.visitCount ?? 0,
    visitCount: row.visitCount ?? 0,
    lastAction: row.lastAction ?? undefined,
    lastActionAt: row.lastActionAt ?? undefined,
    abandonedTasks: asArray(row.abandonedTasks),
    completedTasks: asArray(row.completedTasks),
  };
}

function formatOnboarding(row) {
  if (!row) {
    return { step: 0, total: 5, completedSteps: [], lastStepAt: null };
  }
  return {
    step: row.step ?? 0,
    total: row.total ?? 5,
    completedSteps: asArray(row.completedSteps),
    lastStepAt: row.lastStepAt ?? null,
  };
}

router.get('/users/:userId/memory', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const prisma = getPrismaClient();
    const memory = await prisma.userMemory.findUnique({ where: { userId } });
    return res.json(formatMemory(memory));
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingTableOnce('UserMemory');
      return res.json(formatMemory(null));
    }
    return next(err);
  }
});

const recordBodySchema = z.object({
  action: z.string().min(1).max(500),
  metadata: z.record(z.unknown()).optional(),
});

router.post('/users/:userId/memory/record', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const parsed = recordBodySchema.parse(req.body);
    const prisma = getPrismaClient();
    const now = new Date();
    const entry = { action: parsed.action, metadata: parsed.metadata ?? null, timestamp: now.toISOString() };

    const existing = await prisma.userMemory.findUnique({ where: { userId } });
    const history = asArray(existing?.actionHistory);
    history.push(entry);

    const memory = await prisma.userMemory.upsert({
      where: { userId },
      update: {
        lastAction: parsed.action,
        lastActionAt: now,
        visitCount: { increment: 1 },
        actionHistory: history.slice(-100),
      },
      create: {
        userId,
        lastAction: parsed.action,
        lastActionAt: now,
        visitCount: 1,
        actionHistory: [entry],
        abandonedTasks: [],
        completedTasks: [],
      },
    });

    return res.json(formatMemory(memory));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: err.errors });
    }
    if (isMissingTableError(err)) {
      warnMissingTableOnce('UserMemory');
      return res.json(formatMemory(null));
    }
    return next(err);
  }
});

const abandonedBodySchema = z.object({
  task: z.string().min(1).max(500),
  context: z.string().max(200).optional().default('general'),
});

router.post('/users/:userId/memory/abandoned', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const parsed = abandonedBodySchema.parse(req.body);
    const prisma = getPrismaClient();
    const existing = await prisma.userMemory.findUnique({ where: { userId } });
    const abandoned = asArray(existing?.abandonedTasks);
    abandoned.unshift({
      task: parsed.task,
      startedAt: new Date().toISOString(),
      context: parsed.context,
    });

    const memory = await prisma.userMemory.upsert({
      where: { userId },
      update: { abandonedTasks: abandoned.slice(0, 20) },
      create: {
        userId,
        visitCount: 0,
        actionHistory: [],
        abandonedTasks: abandoned.slice(0, 20),
        completedTasks: [],
      },
    });

    return res.json(formatMemory(memory));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: err.errors });
    }
    if (isMissingTableError(err)) {
      warnMissingTableOnce('UserMemory');
      return res.json(formatMemory(null));
    }
    return next(err);
  }
});

const completeBodySchema = z.object({
  task: z.string().min(1).max(500),
});

router.post('/users/:userId/memory/complete', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const parsed = completeBodySchema.parse(req.body);
    const prisma = getPrismaClient();
    const existing = await prisma.userMemory.findUnique({ where: { userId } });

    const completed = asArray(existing?.completedTasks);
    if (!completed.includes(parsed.task)) completed.push(parsed.task);

    const abandoned = asArray(existing?.abandonedTasks).filter((t) => t?.task !== parsed.task);

    const memory = await prisma.userMemory.upsert({
      where: { userId },
      update: {
        completedTasks: completed,
        abandonedTasks: abandoned,
      },
      create: {
        userId,
        visitCount: 0,
        actionHistory: [],
        abandonedTasks: [],
        completedTasks: [parsed.task],
      },
    });

    return res.json(formatMemory(memory));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation error', details: err.errors });
    }
    if (isMissingTableError(err)) {
      warnMissingTableOnce('UserMemory');
      return res.json(formatMemory(null));
    }
    return next(err);
  }
});

router.get('/users/:userId/onboarding', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId ?? '').trim();
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    if (!canAccessUser(req, userId)) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const prisma = getPrismaClient();
    const progress = await prisma.onboardingProgress.findUnique({ where: { userId } });
    return res.json(formatOnboarding(progress));
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingTableOnce('OnboardingProgress');
      return res.json(formatOnboarding(null));
    }
    return next(err);
  }
});

export default router;

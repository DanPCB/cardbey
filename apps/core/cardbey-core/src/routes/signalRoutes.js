/**
 * Signal Status API — get/update signal configuration
 * GET  /api/signals/status
 * POST /api/signals/preferences
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  getSignalDefinitions,
  normalizePreferencesRow,
} from '../lib/signals/signalDefinitions.js';

const router = Router();

let missingTableWarned = false;

function isMissingTableError(err) {
  return (
    err?.code === 'P2021' ||
    /user_signal_preferences/i.test(String(err?.message ?? '')) ||
    /table .* does not exist/i.test(String(err?.message ?? ''))
  );
}

function warnMissingTableOnce() {
  if (missingTableWarned) return;
  missingTableWarned = true;
  console.warn(
    '[signalRoutes] user_signal_preferences table missing — run prisma migrate. Returning safe defaults.',
  );
}

const preferencesSchema = z.object({
  enabledSignals: z.array(z.string()).optional(),
  disabledSignals: z.array(z.string()).optional(),
  customThresholds: z.record(z.number()).optional(),
});

async function loadPreferences(userId) {
  try {
    const prisma = getPrismaClient();
    const row = await prisma.userSignalPreferences.findUnique({
      where: { userId },
    });
    return normalizePreferencesRow(row);
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingTableOnce();
      return normalizePreferencesRow(null);
    }
    throw err;
  }
}

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user?.id ?? '').trim();
    if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const preferences = await loadPreferences(userId);
    const activeSignals = Array.isArray(req.query.activeSignals)
      ? req.query.activeSignals.map(String)
      : typeof req.query.activeSignals === 'string' && req.query.activeSignals.trim()
        ? req.query.activeSignals.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    res.json({
      ok: true,
      activeSignals,
      preferences: {
        enabled: preferences.enabledSignals,
        disabled: preferences.disabledSignals,
        thresholds: preferences.customThresholds,
      },
      definitions: getSignalDefinitions(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/preferences', requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.user?.id ?? '').trim();
    if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const parsed = preferencesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Invalid preferences payload' });
    }

    const existing = await loadPreferences(userId);
    const enabledSignals = parsed.data.enabledSignals ?? existing.enabledSignals;
    const disabledSignals = parsed.data.disabledSignals ?? existing.disabledSignals;
    const customThresholds = {
      ...existing.customThresholds,
      ...(parsed.data.customThresholds ?? {}),
    };

    try {
      const prisma = getPrismaClient();
      await prisma.userSignalPreferences.upsert({
        where: { userId },
        update: {
          enabledSignals,
          disabledSignals,
          customThresholds,
          updatedAt: new Date(),
        },
        create: {
          userId,
          enabledSignals,
          disabledSignals,
          customThresholds,
        },
      });
    } catch (err) {
      if (isMissingTableError(err)) {
        warnMissingTableOnce();
        return res.status(503).json({
          ok: false,
          error: 'Signal preferences storage is not available yet. Run database migrations.',
        });
      }
      throw err;
    }

    res.json({
      ok: true,
      preferences: {
        enabled: enabledSignals,
        disabled: disabledSignals,
        thresholds: customThresholds,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

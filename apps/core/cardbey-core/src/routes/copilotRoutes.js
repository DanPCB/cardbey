/**
 * Copilot Routes — proactive suggestion API (governed handoff; client executes).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import suggestionEngine from '../services/copilot/suggestionEngine.js';

const router = Router();

router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const userId = req.userId ?? req.user?.id ?? null;
    const suggestions = await suggestionEngine.getPendingSuggestions(userId, 10);
    res.json({ ok: true, suggestions });
  } catch (error) {
    console.error('[copilot/suggestions]', error);
    res.status(500).json({ ok: false, error: 'suggestions_fetch_failed' });
  }
});

router.post('/suggestions/:id/dismiss', requireAuth, async (req, res) => {
  try {
    const prisma = getPrismaClient();
    if (!prisma?.copilotSuggestion?.update) {
      return res.status(503).json({ ok: false, error: 'copilot_unavailable' });
    }
    await prisma.copilotSuggestion.update({
      where: { id: req.params.id },
      data: { status: 'dismissed' },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('[copilot/dismiss]', error);
    res.status(500).json({ ok: false, error: 'dismiss_failed' });
  }
});

router.post('/suggestions/:id/accept', requireAuth, async (req, res) => {
  try {
    const prisma = getPrismaClient();
    if (!prisma?.copilotSuggestion?.findUnique) {
      return res.status(503).json({ ok: false, error: 'copilot_unavailable' });
    }

    const suggestion = await prisma.copilotSuggestion.findUnique({
      where: { id: req.params.id },
    });
    if (!suggestion || suggestion.status !== 'pending') {
      return res.status(404).json({ ok: false, error: 'suggestion_not_found' });
    }

    res.json({
      ok: true,
      handoff: {
        type: suggestion.action,
        payload: {
          ...(suggestion.metadata && typeof suggestion.metadata === 'object' ? suggestion.metadata : {}),
          suggestionId: suggestion.id,
          confirmed: false,
        },
        requireConfirmation: true,
        message: 'Execute this suggestion from the dashboard with user confirmation.',
      },
    });
  } catch (error) {
    console.error('[copilot/accept]', error);
    res.status(500).json({ ok: false, error: 'accept_failed' });
  }
});

router.post('/suggestions/:id/executed', requireAuth, async (req, res) => {
  try {
    const prisma = getPrismaClient();
    if (!prisma?.copilotSuggestion?.update) {
      return res.status(503).json({ ok: false, error: 'copilot_unavailable' });
    }

    await prisma.copilotSuggestion.update({
      where: { id: req.params.id },
      data: { status: 'executed', executedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('[copilot/executed]', error);
    res.status(500).json({ ok: false, error: 'executed_failed' });
  }
});

export default router;

/**
 * Language agent admin API — Phase 1 read-only scan + preview.
 * POST /scan and POST /preview never mutate source files.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import languageAgent from '../services/language/languageAgent.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/status', (_req, res) => {
  res.json({ ok: true, status: languageAgent.getStatus() });
});

router.post('/scan', async (_req, res) => {
  try {
    const result = await languageAgent.scan();
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[language/scan]', err);
    res.status(500).json({ ok: false, error: err?.message ?? 'scan_failed' });
  }
});

router.post('/preview', async (req, res) => {
  try {
    const issue = req.body?.issue ?? req.body ?? {};
    const result = await languageAgent.preview(issue);
    res.json({ ok: true, result, previews: languageAgent.getPreviews() });
  } catch (err) {
    console.error('[language/preview]', err);
    res.status(500).json({ ok: false, error: err?.message ?? 'preview_failed' });
  }
});

router.get('/previews', (_req, res) => {
  res.json({ ok: true, previews: languageAgent.getPreviews() });
});

router.delete('/previews', (_req, res) => {
  res.json({ ok: true, ...languageAgent.clearPreviews() });
});

export default router;

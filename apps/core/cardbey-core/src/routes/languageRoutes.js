/**
 * Language agent admin API — scan, preview, governed approve/apply/rollback.
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import languageAgent from '../services/language/languageAgent.js';
import languageApply from '../services/language/languageApply.js';

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

router.post('/fixes/:id/approve', (req, res) => {
  try {
    const fix = languageAgent.approveFix(req.params.id, req.user?.id ?? 'unknown');
    res.json({ ok: true, fix, previews: languageAgent.getPreviews() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message ?? 'approve_failed' });
  }
});

router.post('/fixes/:id/reject', (req, res) => {
  try {
    const reason = req.body?.reason ?? '';
    const fix = languageAgent.rejectFix(req.params.id, req.user?.id ?? 'unknown', reason);
    res.json({ ok: true, fix, previews: languageAgent.getPreviews() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message ?? 'reject_failed' });
  }
});

router.post('/fixes/:id/apply', async (req, res) => {
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        ok: false,
        error: 'confirmation_required',
        message: 'Apply requires explicit confirmation (confirmed: true).',
        proposedAction: 'apply_language_fix',
        confirmationState: 'pending',
      });
    }

    const result = await languageAgent.applyFix(req.params.id, req.user?.id ?? 'unknown');
    res.json({
      ok: result.success,
      result,
      previews: languageAgent.getPreviews(),
    });
  } catch (err) {
    console.error('[language/apply]', err);
    res.status(400).json({ ok: false, error: err?.message ?? 'apply_failed' });
  }
});

router.get('/history', (_req, res) => {
  res.json({ ok: true, history: languageApply.getHistory() });
});

router.post('/rollback', async (req, res) => {
  try {
    if (req.body?.confirmed !== true) {
      return res.status(400).json({
        ok: false,
        error: 'confirmation_required',
        message: 'Rollback requires explicit confirmation (confirmed: true).',
      });
    }

    const backupPath = req.body?.backupPath;
    if (!backupPath) {
      return res.status(400).json({ ok: false, error: 'backupPath_required' });
    }

    const result = await languageAgent.rollbackToBackup(
      backupPath,
      req.user?.id ?? 'unknown',
    );
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message ?? 'rollback_failed' });
  }
});

export default router;

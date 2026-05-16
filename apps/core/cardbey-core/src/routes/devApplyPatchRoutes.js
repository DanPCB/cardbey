/**
 * Dev-only patch helper: super_admin, non-production, src/-scoped paths.
 */
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../lib/authorization.js';
import { applySrcPatchWrite, previewSrcPatch } from '../lib/dev/applyPatchToSrc.js';

const router = express.Router();

router.patch('/apply-patch', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'Not available in production' });
    }

    const body = req.body ?? {};
    const filePath = String(body.filePath ?? '').trim();
    const oldStr = typeof body.oldStr === 'string' ? body.oldStr : '';
    const newStr = typeof body.newStr === 'string' ? body.newStr : '';
    const confirm = body.confirm === true || body.confirm === 'true';

    if (!filePath) {
      return res.status(400).json({ ok: false, error: 'filePath required' });
    }

    if (!confirm) {
      try {
        const prep = previewSrcPatch({ filePath, oldStr, newStr });
        return res.json({
          ok: true,
          dryRun: true,
          filePath: prep.displayPath,
          linesChanged: prep.linesChanged,
          preview: true,
        });
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: e?.message || 'preview_failed',
          code: e?.code,
        });
      }
    }

    try {
      const result = applySrcPatchWrite({ filePath, oldStr, newStr });
      return res.json(result);
    } catch (e) {
      const code = e?.code;
      const status = code === 'PRODUCTION' ? 403 : 400;
      return res.status(status).json({
        ok: false,
        error: e?.message || 'apply_failed',
        code,
      });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'server_error' });
  }
});

export default router;

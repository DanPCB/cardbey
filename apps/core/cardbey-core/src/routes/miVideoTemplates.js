/**
 * MI Video Templates Routes
 * Endpoints for MI video template management
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
// Import service functions (TypeScript file - tsx will handle the import)
import { listMiVideoTemplates, getMiVideoTemplateByKey } from '../services/miVideoTemplatesService.js';

const router = express.Router();

/**
 * GET /api/mi/video-templates
 * List MI video templates with optional filters
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { occasionType, orientation } = req.query;

    // Check if MiVideoTemplate model exists
    const { PrismaClient } = await import('@prisma/client');
    const testPrisma = new PrismaClient();
    if (!testPrisma.miVideoTemplate) {
      await testPrisma.$disconnect();
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'MiVideoTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }
    await testPrisma.$disconnect();

    const templates = await listMiVideoTemplates({
      occasionType: typeof occasionType === 'string' ? occasionType : undefined,
      orientation: typeof orientation === 'string' ? orientation : undefined,
      onlyActive: true,
    });

    res.json({
      ok: true,
      templates,
    });
  } catch (err) {
    console.error('[MI Video Templates] List error:', err);
    next(err);
  }
});

/**
 * GET /api/mi/video-templates/:key
 * Get a specific MI video template by key
 */
router.get('/:key', requireAuth, async (req, res, next) => {
  try {
    const { key } = req.params;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'missing_key',
        message: 'Template key is required',
      });
    }

    // Check if MiVideoTemplate model exists
    const { PrismaClient } = await import('@prisma/client');
    const testPrisma = new PrismaClient();
    if (!testPrisma.miVideoTemplate) {
      await testPrisma.$disconnect();
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'MiVideoTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }
    await testPrisma.$disconnect();

    const template = await getMiVideoTemplateByKey(key);

    if (!template) {
      return res.status(404).json({
        ok: false,
        error: 'mi_video_template_not_found',
        message: 'MI video template not found',
      });
    }

    if (!template.isActive) {
      return res.status(404).json({
        ok: false,
        error: 'mi_video_template_not_found',
        message: 'MI video template not found',
      });
    }

    res.json({
      ok: true,
      template,
    });
  } catch (err) {
    console.error('[MI Video Templates] Get error:', err);
    next(err);
  }
});

export default router;


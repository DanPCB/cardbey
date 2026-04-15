// src/routes/adminMedia.js
// Admin endpoints for media cleanup operations

import { Router } from 'express';
import { cleanupOrphanAssets, cleanupOriginalsAfterOptimization } from '../services/mediaCleanup.js';
import { info, error } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/admin/media/cleanup/orphans
 * Cleanup orphan assets (not referenced in any playlist)
 * 
 * Body (optional):
 * {
 *   olderThanDays?: number (default: 30)
 *   maxAssets?: number (default: 500)
 *   dryRun?: boolean (default: false)
 * }
 */
router.post('/cleanup/orphans', async (req, res) => {
  try {
    // TODO: Add proper admin auth middleware
    // For now, this is a protected endpoint that should be secured via middleware
    
    const options = {
      olderThanDays: req.body.olderThanDays || parseInt(req.query.olderThanDays, 10) || 30,
      maxAssets: req.body.maxAssets || parseInt(req.query.maxAssets, 10) || 500,
      dryRun: req.body.dryRun === true || req.query.dryRun === 'true',
    };
    
    info('CLEANUP', 'Orphan cleanup requested', {
      options,
      ip: req.ip,
      requestId: req.requestId,
    });
    
    const result = await cleanupOrphanAssets(options);
    
    return res.json({
      ok: true,
      message: options.dryRun ? 'Orphan cleanup simulation completed' : 'Orphan cleanup completed',
      result: {
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        processed: result.processed,
        remaining: result.remaining,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    error('CLEANUP', 'Orphan cleanup failed', {
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 300),
      requestId: req.requestId,
    });
    return res.status(500).json({
      ok: false,
      error: 'Cleanup failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/admin/media/cleanup/originals
 * Cleanup original files after optimization
 * 
 * Body (optional):
 * {
 *   gracePeriodDays?: number (default: 7)
 *   maxAssets?: number (default: 500)
 *   dryRun?: boolean (default: false)
 * }
 */
router.post('/cleanup/originals', async (req, res) => {
  try {
    // TODO: Add proper admin auth middleware
    
    const options = {
      gracePeriodDays: req.body.gracePeriodDays || parseInt(req.query.gracePeriodDays, 10) || 7,
      maxAssets: req.body.maxAssets || parseInt(req.query.maxAssets, 10) || 500,
      dryRun: req.body.dryRun === true || req.query.dryRun === 'true',
    };
    
    info('CLEANUP', 'Original cleanup requested', {
      options,
      ip: req.ip,
      requestId: req.requestId,
    });
    
    const result = await cleanupOriginalsAfterOptimization(options);
    
    return res.json({
      ok: true,
      message: options.dryRun ? 'Original cleanup simulation completed' : 'Original cleanup completed',
      result: {
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        processed: result.processed,
        remaining: result.remaining,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    error('CLEANUP', 'Original cleanup failed', {
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 300),
      requestId: req.requestId,
    });
    return res.status(500).json({
      ok: false,
      error: 'Cleanup failed',
      message: err.message,
    });
  }
});

export default router;



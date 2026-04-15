// src/routes/internal.js
// Internal API endpoints (called by AWS Lambda, workers, etc.)

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { info, warn, error } from '../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();

// Internal API secret for authentication
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * Middleware to validate internal API secret
 */
function validateInternalSecret(req, res, next) {
  const providedSecret = req.get('x-internal-secret');
  
  if (!INTERNAL_API_SECRET) {
    warn('INTERNAL', 'INTERNAL_API_SECRET not configured', {
      endpoint: req.path,
      ip: req.ip,
    });
    return res.status(500).json({
      ok: false,
      error: 'Internal API not configured',
    });
  }
  
  if (!providedSecret || providedSecret !== INTERNAL_API_SECRET) {
    warn('INTERNAL', 'Invalid internal API secret', {
      endpoint: req.path,
      ip: req.ip,
      hasSecret: !!providedSecret,
    });
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
      message: 'Invalid or missing x-internal-secret header',
    });
  }
  
  next();
}

/**
 * POST /api/internal/media/optimized
 * Callback endpoint for AWS Lambda to update asset after optimization
 * 
 * Body:
 * {
 *   assetId: string,
 *   optimizedKey: string,
 *   optimizedUrl?: string (optional, will be constructed from optimizedKey if not provided)
 * }
 */
router.post('/media/optimized', validateInternalSecret, async (req, res) => {
  try {
    const { assetId, optimizedKey, optimizedUrl } = req.body;
    
    // Validate required fields
    if (!assetId || !optimizedKey) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'assetId and optimizedKey are required',
      });
    }
    
    // Check if asset exists
    const asset = await prisma.media.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        kind: true,
        mime: true,
      },
    });
    
    if (!asset) {
      return res.status(404).json({
        ok: false,
        error: 'Asset not found',
        message: `Asset ${assetId} does not exist`,
      });
    }
    
    // Validate it's a video
    if (asset.kind !== 'VIDEO' || !asset.mime.startsWith('video/')) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid asset type',
        message: 'Only video assets can be optimized',
      });
    }
    
    // Construct optimizedUrl if not provided
    let finalOptimizedUrl = optimizedUrl;
    if (!finalOptimizedUrl) {
      const cdnBaseUrl = process.env.CDN_BASE_URL;
      if (!cdnBaseUrl) {
        throw new Error('CDN_BASE_URL environment variable is not set');
      }
      const cleanCdnBase = cdnBaseUrl.trim().endsWith('/') 
        ? cdnBaseUrl.trim().slice(0, -1) 
        : cdnBaseUrl.trim();
      finalOptimizedUrl = `${cleanCdnBase}/${optimizedKey}`;
    }
    
    // Update asset record
    const updated = await prisma.media.update({
      where: { id: assetId },
      data: {
        optimizedKey,
        optimizedUrl: finalOptimizedUrl,
        isOptimized: true,
        optimizedAt: new Date(),
      },
    });
    
    info('OPTIMIZER', 'Asset marked as optimized', {
      assetId,
      optimizedKey,
      optimizedUrl: finalOptimizedUrl,
      requestId: req.requestId,
    });
    
    return res.json({
      ok: true,
      assetId: updated.id,
      optimizedKey: updated.optimizedKey,
      optimizedUrl: updated.optimizedUrl,
    });
  } catch (err) {
    error('INTERNAL', 'Failed to update optimized asset', {
      assetId: req.body.assetId,
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 300),
      requestId: req.requestId,
    });
    return res.status(500).json({
      ok: false,
      error: 'Failed to update asset',
      message: err.message,
    });
  }
});

/**
 * GET /api/internal/health
 * Internal health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'internal',
    timestamp: new Date().toISOString(),
  });
});

export default router;



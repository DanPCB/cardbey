/**
 * Content Studio API Routes
 * CRUD operations for Content model (designs saved from Content Studio)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { registerOrUpdateEntity } from '../services/miService.js';
import { buildCreativeAssetMIBrain } from '../mi/miCreativeHelpers.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Get tenant/store context from request
 * Similar pattern to reports.js
 */
async function getTenantIdFromUser(req) {
  if (!req.userId) {
    return null;
  }
  // Primary pattern: userId = tenantId (user owns the tenant)
  return req.userId;
}

/**
 * Allow access to content if:
 * - req.userId matches content.userId (authenticated owner), or
 * - req.guestSessionId exists and content.userId === `guest_${req.guestSessionId}` (guest owner)
 */
function canAccessContent(req, content) {
  if (!content) return false;
  if (req.userId && content.userId === req.userId) return true;
  if (req.guestSessionId && typeof req.guestSessionId === 'string' && content.userId === `guest_${req.guestSessionId.trim()}`) return true;
  return false;
}

// Validation schemas
// More lenient validation to handle various frontend data shapes
const ContentCreateSchema = z.object({
  name: z.preprocess(
    (val) => {
      // Handle missing/undefined/null/empty name - provide default
      if (val === undefined || val === null || val === '' || (typeof val === 'string' && val.trim() === '')) {
        return `Untitled Design ${new Date().toLocaleDateString()}`;
      }
      const str = typeof val === 'string' ? val.trim() : String(val);
      return str.substring(0, 255); // Ensure max length
    },
    z.string().min(1).max(255)
  ).optional(),
  elements: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return [];
      return Array.isArray(val) ? val : [];
    },
    z.array(z.unknown()).default([])
  ),
  settings: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return {};
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      return {};
    },
    z.record(z.unknown()).default({})
  ),
  renderSlide: z.unknown().optional().nullable(),
  thumbnailUrl: z.preprocess(
    (val) => {
      if (!val || val === '' || val === null || val === undefined) return null;
      if (typeof val === 'string') return val; // Allow any string, don't validate URL format
      return null;
    },
    z.string().nullable().optional()
  ),
});

const ContentUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  elements: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      return Array.isArray(val) ? val : [];
    },
    z.array(z.unknown()).optional()
  ),
  settings: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'object' && !Array.isArray(val)) return val;
      return {};
    },
    z.record(z.unknown()).optional()
  ),
  renderSlide: z.unknown().optional().nullable(),
  thumbnailUrl: z.preprocess(
    (val) => {
      if (!val || val === '' || val === null || val === undefined) return null;
      if (typeof val === 'string') return val; // Allow any string, don't validate URL format
      return null;
    },
    z.string().nullable().optional()
  ),
  version: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      const num = typeof val === 'number' ? val : Number(val);
      return isNaN(num) ? undefined : Math.floor(Math.abs(num));
    },
    z.number().int().positive().optional()
  ),
});

/**
 * GET /api/contents
 * List all contents for the authenticated user
 * Now includes MIEntity metadata for each content
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const contents = await prisma.content.findMany({
      where: {
        userId: req.userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        thumbnailUrl: true, // Include thumbnail for preview images
        // Don't send full elements/settings in list view for performance
      },
    });

    // Fetch MIEntity for all contents in parallel
    let miEntitiesMap = new Map();
    try {
      const { getEntityByProductId } = await import('../services/miService.js');
      
      const miEntityPromises = contents.map(async (content) => {
        try {
          const miEntity = await getEntityByProductId(content.id);
          return { contentId: content.id, miEntity };
        } catch (err) {
          return { contentId: content.id, miEntity: null };
        }
      });
      
      const miEntityResults = await Promise.all(miEntityPromises);
      miEntitiesMap = new Map(miEntityResults.map(r => [r.contentId, r.miEntity]));
    } catch (miError) {
      // Non-critical: continue without MIEntity
      console.warn('[Contents] Failed to fetch MIEntity records:', miError.message);
    }

    // Attach MIEntity to each content
    const contentsWithMI = contents.map(content => ({
      ...content,
      miEntity: miEntitiesMap.get(content.id) || null,
    }));

    res.json({
      ok: true,
      data: contentsWithMI,
    });
  } catch (error) {
    console.error('[Contents] List error:', error);
    next(error);
  }
});

/**
 * GET /api/contents/:id
 * Get a single content by ID
 * Guest-safe: allows access when content.userId === guest_${guestSessionId} (from cookie)
 * Now includes MIEntity metadata
 */
router.get('/:id', optionalAuth, guestSessionId, async (req, res, next) => {
  try {
    const { id } = req.params;

    const content = await prisma.content.findFirst({
      where: { id },
    });

    if (!content) {
      return res.status(404).json({
        ok: false,
        error: 'content_not_found',
        message: 'Content not found',
      });
    }

    if (!canAccessContent(req, content)) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this content',
      });
    }

    // Fetch MIEntity for this content
    let miEntity = null;
    try {
      const { getEntityByProductId } = await import('../services/miService.js');
      miEntity = await getEntityByProductId(content.id);
    } catch (miError) {
      // Non-critical: continue without MIEntity
      console.warn(`[Contents] Failed to fetch MIEntity for content ${id}:`, miError.message);
    }

    // Ensure all required fields are present with defaults if missing
    const responseData = {
      id: content.id,
      name: content.name || `Untitled Design`,
      userId: content.userId,
      elements: content.elements || [],
      settings: content.settings || {},
      renderSlide: content.renderSlide || null,
      thumbnailUrl: content.thumbnailUrl || null,
      version: content.version || 1,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      miEntity: miEntity || null, // Attach MIEntity
    };

    res.json({
      ok: true,
      data: responseData,
    });
  } catch (error) {
    console.error('[Contents] Get error:', error);
    next(error);
  }
});

/**
 * POST /api/contents
 * Create a new content
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    // Ensure name field exists with default if missing (before validation)
    if (!req.body || req.body.name === undefined || req.body.name === null || req.body.name === '') {
      req.body = req.body || {};
      req.body.name = `Untitled Design ${new Date().toLocaleDateString()}`;
    }
    
    const parseResult = ContentCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.error('[Contents] Validation failed:', {
        errors: parseResult.error.errors,
        bodyKeys: req.body ? Object.keys(req.body) : 'none',
        bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 500) : 'none',
      });
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        message: 'Invalid content data',
        details: parseResult.error.flatten(),
        issues: parseResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    const { name, elements, settings, renderSlide, thumbnailUrl } = parseResult.data;

    // Ensure name is provided (fallback to default if missing)
    const contentName = name || `Untitled Design ${new Date().toLocaleDateString()}`;

    const content = await prisma.content.create({
      data: {
        name: contentName,
        userId: req.userId,
        elements: elements || [],
        settings: settings || {},
        renderSlide: renderSlide ?? null,
        thumbnailUrl: thumbnailUrl || null,
        version: 1,
      },
    });

    console.log(`[Contents] Created content ${content.id} by user ${req.userId}`);

    // Register MIEntity for the creative asset (non-blocking)
    try {
      const tenantId = await getTenantIdFromUser(req);
      const miBrain = buildCreativeAssetMIBrain(content, {
        tenantId,
        storeId: null, // Content doesn't have storeId yet
        userId: req.userId,
        purpose: req.body.purpose,
        intent: req.body.intent,
      });

      // Use thumbnailUrl or a placeholder for fileUrl
      const fileUrl = content.thumbnailUrl || '';
      const previewUrl = content.thumbnailUrl || '';

      // Infer media type from content
      const hasVideo = Array.isArray(elements) && elements.some((el) => 
        el?.type === 'video' || el?.kind === 'video'
      );
      const mediaType = hasVideo ? 'video' : 'image';

      await registerOrUpdateEntity({
        productId: content.id,
        productType: 'creative_asset',
        mediaType,
        fileUrl,
        previewUrl,
        dimensions: undefined, // Content doesn't have dimensions in schema
        orientation: undefined,
        durationSec: undefined,
        createdByUserId: req.userId,
        createdByEngine: 'creative_engine_v3',
        sourceProjectId: null,
        tenantId,
        storeId: null,
        campaignId: null,
        miBrain,
        status: 'active',
        links: {
          // Note: Content doesn't have a dedicated link field in MIEntity
          // We use productId to link to Content.id
        },
      });
      console.log(`[Contents] Registered MIEntity for content ${content.id}`);
    } catch (miError) {
      // Non-critical: log but don't block content creation
      console.warn(`[Contents] Failed to register MIEntity for content ${content.id}:`, miError.message);
    }

    res.status(201).json({
      ok: true,
      data: content,
    });
  } catch (error) {
    console.error('[Contents] Create error:', error);
    
    // Handle payload too large errors (413)
    if (error.message?.includes('too large') || 
        error.message?.includes('LIMIT_FILE_SIZE') ||
        error.code === 'LIMIT_FILE_SIZE' ||
        error.status === 413 ||
        error.statusCode === 413) {
      return res.status(413).json({
        ok: false,
        error: 'payload_too_large',
        message: 'Request body exceeds maximum size limit. Please reduce image sizes or element count.',
      });
    }
    
    next(error);
  }
});

/**
 * PUT /api/contents/:id
 * Update an existing content
 * Guest-safe: allows access when content.userId === guest_${guestSessionId} (from cookie)
 */
router.put('/:id', optionalAuth, guestSessionId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const parseResult = ContentUpdateSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      console.error('[Contents] Update validation failed:', {
        contentId: id,
        errors: parseResult.error.errors,
        bodyKeys: req.body ? Object.keys(req.body) : 'none',
        bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 500) : 'none',
      });
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        message: 'Invalid update data',
        details: parseResult.error.flatten(),
        issues: parseResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    // Fetch content and verify access (owner or guest session)
    const existing = await prisma.content.findFirst({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: 'content_not_found',
        message: 'Content not found',
      });
    }

    if (!canAccessContent(req, existing)) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this content',
      });
    }

    // Optional optimistic locking: check version if provided
    if (parseResult.data.version !== undefined) {
      if (parseResult.data.version !== existing.version) {
        return res.status(409).json({
          ok: false,
          error: 'version_conflict',
          message: 'Content was modified by another request. Please reload and try again.',
          currentVersion: existing.version,
        });
      }
    }

    const updateData = {
      ...parseResult.data,
      version: existing.version + 1, // Increment version
    };

    // Convert empty strings to null for thumbnailUrl
    if (updateData.thumbnailUrl === '') {
      updateData.thumbnailUrl = null;
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const content = await prisma.content.update({
      where: { id },
      data: updateData,
    });

    console.log(`[Contents] Updated content ${id} to version ${content.version}`);

    // Update MIEntity for the creative asset (non-blocking)
    try {
      const tenantId = await getTenantIdFromUser(req);
      const miBrain = buildCreativeAssetMIBrain(content, {
        tenantId,
        storeId: null,
        userId: req.userId,
        purpose: req.body.purpose,
        intent: req.body.intent,
      });

      const fileUrl = content.thumbnailUrl || '';
      const previewUrl = content.thumbnailUrl || '';

      const hasVideo = Array.isArray(content.elements) && content.elements.some((el) => 
        el?.type === 'video' || el?.kind === 'video'
      );
      const mediaType = hasVideo ? 'video' : 'image';

      await registerOrUpdateEntity({
        productId: content.id,
        productType: 'creative_asset',
        mediaType,
        fileUrl,
        previewUrl,
        dimensions: undefined,
        orientation: undefined,
        durationSec: undefined,
        createdByUserId: req.userId,
        createdByEngine: 'creative_engine_v3',
        sourceProjectId: null,
        tenantId,
        storeId: null,
        campaignId: null,
        miBrain,
        status: 'active',
        links: {},
      });
      console.log(`[Contents] Updated MIEntity for content ${id}`);
    } catch (miError) {
      // Non-critical: log but don't block content update
      console.warn(`[Contents] Failed to update MIEntity for content ${id}:`, miError.message);
    }

    res.json({
      ok: true,
      data: content,
    });
  } catch (error) {
    console.error('[Contents] Update error:', error);
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2025') {
      return res.status(404).json({
        ok: false,
        error: 'content_not_found',
        message: 'Content not found',
      });
    }
    
    // Handle payload too large errors (413)
    if (error.message?.includes('too large') || 
        error.message?.includes('LIMIT_FILE_SIZE') ||
        error.code === 'LIMIT_FILE_SIZE' ||
        error.status === 413 ||
        error.statusCode === 413) {
      return res.status(413).json({
        ok: false,
        error: 'payload_too_large',
        message: 'Request body exceeds maximum size limit. Please reduce image sizes or element count.',
      });
    }
    
    next(error);
  }
});

/**
 * DELETE /api/contents/:id
 * Delete a content
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if content exists and belongs to user
    const existing = await prisma.content.findFirst({
      where: {
        id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: 'content_not_found',
        message: 'Content not found',
      });
    }

    await prisma.content.delete({
      where: { id },
    });

    console.log(`[Contents] Deleted content ${id} by user ${req.userId}`);

    res.json({
      ok: true,
      message: 'Content deleted successfully',
    });
  } catch (error) {
    console.error('[Contents] Delete error:', error);
    next(error);
  }
});

export default router;


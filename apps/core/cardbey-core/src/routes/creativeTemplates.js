/**
 * Creative Templates REST API Routes
 * CRUD operations for CreativeTemplate with MIEntity integration
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { registerTemplateMIEntity } from '../mi/miTemplateHelpers.js';
import * as miService from '../services/miService.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Extracts tenantId/storeId from query params, body, or auth context
 * Uses the same pattern as signageRoutes.js for consistency
 */
function requireTenantStoreContext(req) {
  // Try to extract from query params first (highest priority)
  let tenantId = req.query.tenantId;
  let storeId = req.query.storeId;
  
  // Fall back to body params
  if (!tenantId) tenantId = req.body?.tenantId;
  if (!storeId) storeId = req.body?.storeId;
  
  // Fall back to auth context
  if (!tenantId && req.userId) {
    tenantId = req.userId; // Use userId as tenantId
  }
  if (!storeId && req.user?.business?.id) {
    storeId = req.user.business.id; // Use business.id as storeId
  }
  
  // Legacy fallback
  if (!tenantId) tenantId = req.user?.business?.tenantId || req.workspace?.tenantId;
  if (!storeId) storeId = req.user?.business?.storeId || req.workspace?.storeId;
  
  // For dev mode, allow default tenant/store when none is passed
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
    storeId = storeId || process.env.DEV_STORE_ID || req.user?.business?.id || 'temp';
  }
  
  // Convert to strings and trim
  tenantId = tenantId ? String(tenantId).trim() : null;
  storeId = storeId ? String(storeId).trim() : null;
  
  return { tenantId, storeId };
}

/**
 * POST /api/creative-templates
 * Create a new creative template
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    
    const {
      name,
      description,
      thumbnailUrl,
      baseContentId,
      channels: channelsInput,
      role: roleInput,
      primaryIntent: primaryIntentInput,
      orientation: orientationInput,
      minDurationS,
      maxDurationS,
      tags: tagsInput,
      businessCategories: businessCategoriesInput, // Phase 2: Business type metadata
      useCases: useCasesInput,                   // Phase 2: Use case metadata
      styleTags: styleTagsInput,                  // Phase 2: Style metadata
      isSystem = false,
      isActive = true,
      fields,      // TemplateSlot[] array (optional)
      aiContext,   // TemplateAIContext object (optional)
    } = req.body;

    // Apply default metadata if not provided
    const DEFAULT_CHANNELS = ['cnet_screen', 'storefront', 'social'];
    const DEFAULT_ROLE = 'generic';
    const DEFAULT_PRIMARY_INTENT = 'general_design';
    const DEFAULT_ORIENTATION = 'any';
    const DEFAULT_TAGS = ['universal', 'default'];

    const channels = channelsInput !== undefined 
      ? (Array.isArray(channelsInput) ? channelsInput : [])
      : DEFAULT_CHANNELS;
    const role = roleInput !== undefined ? roleInput : DEFAULT_ROLE;
    const primaryIntent = primaryIntentInput !== undefined ? primaryIntentInput : DEFAULT_PRIMARY_INTENT;
    const orientation = orientationInput !== undefined ? orientationInput : DEFAULT_ORIENTATION;
    const tags = tagsInput !== undefined 
      ? (Array.isArray(tagsInput) ? tagsInput : [])
      : DEFAULT_TAGS;
    const businessCategories = businessCategoriesInput !== undefined && Array.isArray(businessCategoriesInput) 
      ? businessCategoriesInput 
      : null;
    const useCases = useCasesInput !== undefined && Array.isArray(useCasesInput) 
      ? useCasesInput 
      : null;
    const styleTags = styleTagsInput !== undefined && Array.isArray(styleTagsInput) 
      ? styleTagsInput 
      : null;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'name_required',
        message: 'Template name is required',
      });
    }

    // Check if CreativeTemplate model exists
    if (!prisma.creativeTemplate) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'CreativeTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev',
      });
    }

    // Validate fields if provided (should be array of TemplateSlot objects)
    if (fields !== undefined && !Array.isArray(fields)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_fields',
        message: 'fields must be an array of TemplateSlot objects',
      });
    }

    // Validate aiContext if provided (should be an object)
    if (aiContext !== undefined && (typeof aiContext !== 'object' || Array.isArray(aiContext) || aiContext === null)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_ai_context',
        message: 'aiContext must be an object',
      });
    }

    // Create template
    const template = await prisma.creativeTemplate.create({
      data: {
        tenantId: tenantId || null,
        storeId: storeId || null,
        name: name.trim(),
        description: description?.trim() || null,
        thumbnailUrl: thumbnailUrl || null,
        baseContentId: baseContentId || null,
        channels: JSON.stringify(channels),
        role: role,
        primaryIntent: primaryIntent,
        orientation: orientation,
        minDurationS: minDurationS || null,
        maxDurationS: maxDurationS || null,
        tags: JSON.stringify(tags),
        businessCategories: businessCategories ? JSON.stringify(businessCategories) : null,
        useCases: useCases ? JSON.stringify(useCases) : null,
        styleTags: styleTags ? JSON.stringify(styleTags) : null,
        isSystem: isSystem || false,
        isActive: isActive !== false,
        fields: fields ? JSON.stringify(fields) : null,
        aiContext: aiContext ? JSON.stringify(aiContext) : null,
      },
    });

    // Register MIEntity (non-blocking)
    try {
      await registerTemplateMIEntity(template);
    } catch (miError) {
      console.error('[CreativeTemplates] Failed to register MIEntity for template', {
        templateId: template.id,
        error: miError,
      });
      // Don't fail the request if MI registration fails
    }

    res.status(201).json({
      ok: true,
      template,
    });
  } catch (error) {
    console.error('[CreativeTemplates] Create error:', error);
    next(error);
  }
});

/**
 * PUT /api/creative-templates/:id
 * Update an existing creative template
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId, storeId } = requireTenantStoreContext(req);

    // Check if CreativeTemplate model exists
    if (!prisma.creativeTemplate) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'CreativeTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev --name add_creative_template',
      });
    }

    // Find existing template
    const existing = await prisma.creativeTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: 'template_not_found',
        message: 'Template not found',
      });
    }

    // Verify tenant/store access (if template is tenant/store-specific)
    if (existing.tenantId && existing.tenantId !== tenantId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to update this template',
      });
    }
    if (existing.storeId && existing.storeId !== storeId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to update this template',
      });
    }

    const {
      name,
      description,
      thumbnailUrl,
      baseContentId,
      channels: channelsInput,
      role: roleInput,
      primaryIntent: primaryIntentInput,
      orientation: orientationInput,
      minDurationS,
      maxDurationS,
      tags: tagsInput,
      businessCategories: businessCategoriesInput, // Phase 2: Business type metadata
      useCases: useCasesInput,                   // Phase 2: Use case metadata
      styleTags: styleTagsInput,                  // Phase 2: Style metadata
      isActive,
      fields,
      aiContext,
    } = req.body;

    // Default metadata values
    const DEFAULT_CHANNELS = ['cnet_screen', 'storefront', 'social'];
    const DEFAULT_ROLE = 'generic';
    const DEFAULT_PRIMARY_INTENT = 'general_design';
    const DEFAULT_ORIENTATION = 'any';
    const DEFAULT_TAGS = ['universal', 'default'];

    // Validate fields if provided
    if (fields !== undefined && !Array.isArray(fields)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_fields',
        message: 'fields must be an array of TemplateSlot objects',
      });
    }

    // Validate aiContext if provided
    if (aiContext !== undefined && (typeof aiContext !== 'object' || Array.isArray(aiContext) || aiContext === null)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_ai_context',
        message: 'aiContext must be an object',
      });
    }

    // Build update data (only include provided fields)
    // Apply defaults for metadata fields if they're missing or null
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl || null;
    if (baseContentId !== undefined) updateData.baseContentId = baseContentId || null;
    
    // Apply defaults for metadata fields if not provided or if explicitly set to null
    if (channelsInput !== undefined) {
      updateData.channels = JSON.stringify(Array.isArray(channelsInput) && channelsInput.length > 0 
        ? channelsInput 
        : DEFAULT_CHANNELS);
    } else if (existing.channels === '[]' || !existing.channels) {
      updateData.channels = JSON.stringify(DEFAULT_CHANNELS);
    }
    
    if (roleInput !== undefined) {
      updateData.role = roleInput || DEFAULT_ROLE;
    } else if (!existing.role) {
      updateData.role = DEFAULT_ROLE;
    }
    
    if (primaryIntentInput !== undefined) {
      updateData.primaryIntent = primaryIntentInput || DEFAULT_PRIMARY_INTENT;
    } else if (!existing.primaryIntent) {
      updateData.primaryIntent = DEFAULT_PRIMARY_INTENT;
    }
    
    if (orientationInput !== undefined) {
      updateData.orientation = orientationInput || DEFAULT_ORIENTATION;
    } else if (!existing.orientation) {
      updateData.orientation = DEFAULT_ORIENTATION;
    }
    
    if (tagsInput !== undefined) {
      updateData.tags = JSON.stringify(Array.isArray(tagsInput) && tagsInput.length > 0
        ? tagsInput
        : DEFAULT_TAGS);
    } else if (existing.tags === '[]' || !existing.tags) {
      updateData.tags = JSON.stringify(DEFAULT_TAGS);
    }
    
    // Phase 2: Handle new metadata fields
    if (businessCategoriesInput !== undefined) {
      updateData.businessCategories = Array.isArray(businessCategoriesInput) && businessCategoriesInput.length > 0
        ? JSON.stringify(businessCategoriesInput)
        : null;
    }
    
    if (useCasesInput !== undefined) {
      updateData.useCases = Array.isArray(useCasesInput) && useCasesInput.length > 0
        ? JSON.stringify(useCasesInput)
        : null;
    }
    
    if (styleTagsInput !== undefined) {
      updateData.styleTags = Array.isArray(styleTagsInput) && styleTagsInput.length > 0
        ? JSON.stringify(styleTagsInput)
        : null;
    }
    
    if (minDurationS !== undefined) updateData.minDurationS = minDurationS || null;
    if (maxDurationS !== undefined) updateData.maxDurationS = maxDurationS || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (fields !== undefined) updateData.fields = fields ? JSON.stringify(fields) : null;
    if (aiContext !== undefined) updateData.aiContext = aiContext ? JSON.stringify(aiContext) : null;

    // Check if CreativeTemplate model exists
    if (!prisma.creativeTemplate) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'CreativeTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev --name add_creative_template',
      });
    }

    // Update template
    const template = await prisma.creativeTemplate.update({
      where: { id },
      data: updateData,
    });

    // Update MIEntity (non-blocking)
    try {
      await registerTemplateMIEntity(template);
    } catch (miError) {
      console.error('[CreativeTemplates] Failed to update MIEntity for template', {
        templateId: template.id,
        error: miError,
      });
      // Don't fail the request if MI registration fails
    }

    res.json({
      ok: true,
      template,
    });
  } catch (error) {
    console.error('[CreativeTemplates] Update error:', error);
    next(error);
  }
});

/**
 * GET /api/creative-templates
 * List creative templates with optional filters
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);

    const {
      role,
      primaryIntent,
      orientation,
      channel,
      isSystem,
      isActive,
    } = req.query;

    // Build where clause
    const where = {
      // Include global templates (tenantId IS NULL) OR tenant/store-specific templates
      OR: [
        { tenantId: null }, // Global templates
        { tenantId: tenantId || undefined }, // Tenant-specific
        ...(storeId ? [{ tenantId: tenantId || undefined, storeId }] : []), // Store-specific
      ],
    };

    if (role) where.role = role;
    if (primaryIntent) where.primaryIntent = primaryIntent;
    if (orientation) where.orientation = orientation;
    if (isSystem !== undefined) where.isSystem = isSystem === 'true';
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Channel filter (check if channel is in channels JSON array)
    // Note: This is a simplified filter - for production, consider using Prisma's JSON filtering
    if (channel) {
      // We'll filter in memory for now (can be optimized with raw SQL if needed)
    }

    // Check if CreativeTemplate model exists
    if (!prisma.creativeTemplate) {
      return res.status(503).json({
        ok: false,
        error: 'model_not_available',
        message: 'CreativeTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev --name add_creative_template',
      });
    }

    const templates = await prisma.creativeTemplate.findMany({
      where,
      orderBy: [
        { isSystem: 'desc' }, // System templates first
        { createdAt: 'desc' },
      ],
    });

    // Attach MIEntity for each template
    const templatesWithMI = await Promise.all(
      templates.map(async (template) => {
        let miEntity = null;
        try {
          miEntity = await miService.getEntityByLink({ templateId: template.id });
        } catch (err) {
          // Ignore errors
          console.warn(`[CreativeTemplates] Failed to get MIEntity for template ${template.id}:`, err);
        }

        // Parse JSON fields
        const channels = typeof template.channels === 'string'
          ? JSON.parse(template.channels)
          : (Array.isArray(template.channels) ? template.channels : []);
        const tags = typeof template.tags === 'string'
          ? JSON.parse(template.tags)
          : (Array.isArray(template.tags) ? template.tags : []);
        const businessCategories = template.businessCategories 
          ? (typeof template.businessCategories === 'string'
              ? JSON.parse(template.businessCategories)
              : (Array.isArray(template.businessCategories) ? template.businessCategories : []))
          : null;
        const useCases = template.useCases
          ? (typeof template.useCases === 'string'
              ? JSON.parse(template.useCases)
              : (Array.isArray(template.useCases) ? template.useCases : []))
          : null;
        const styleTags = template.styleTags
          ? (typeof template.styleTags === 'string'
              ? JSON.parse(template.styleTags)
              : (Array.isArray(template.styleTags) ? template.styleTags : []))
          : null;
        
        // Parse fields and aiContext
        let fields = null;
        if (template.fields) {
          try {
            fields = typeof template.fields === 'string' ? JSON.parse(template.fields) : template.fields;
          } catch (e) {
            console.warn(`[CreativeTemplates] Failed to parse fields for template ${template.id}:`, e);
          }
        }
        
        let aiContext = null;
        if (template.aiContext) {
          try {
            aiContext = typeof template.aiContext === 'string' ? JSON.parse(template.aiContext) : template.aiContext;
          } catch (e) {
            console.warn(`[CreativeTemplates] Failed to parse aiContext for template ${template.id}:`, e);
          }
        }

        // Filter by channel if specified
        if (channel && !channels.includes(channel)) {
          return null; // Filter out templates that don't match channel
        }

        return {
          ...template,
          channels,
          tags,
          businessCategories,
          useCases,
          styleTags,
          fields,
          aiContext,
          miEntity,
        };
      })
    );

    // Filter out nulls (from channel filtering)
    const filteredTemplates = templatesWithMI.filter(t => t !== null);

    res.json({
      ok: true,
      templates: filteredTemplates,
    });
  } catch (error) {
    console.error('[CreativeTemplates] List error:', error);
    next(error);
  }
});

export default router;


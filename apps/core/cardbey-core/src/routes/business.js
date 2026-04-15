/**
 * Business Routes
 * POST /api/business/create - Create a new business (orchestra-style job or legacy name/description)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { generateUniqueStoreSlug } from '../utils/slug.js';
import { createBuildStoreJob, runBuildStoreJob, newTraceId } from '../services/draftStore/orchestraBuildStore.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/business/create
 * Two supported shapes:
 * 1) Orchestra-style (dashboard): { sourceType, payload: { businessName, businessType?, location? }, options?, idempotencyKey? }
 *    → Creates build_store job + draft, auto-runs, returns { ok, jobId, tenantId, storeId, generationRunId }.
 * 2) Legacy: { name, description?, ... } → Creates Business row directly, returns { ok, businessId, storeSlug }.
 */
router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { sourceType, payload, options } = body;
    const hasOrchestraPayload = sourceType && payload && typeof payload === 'object';

    if (hasOrchestraPayload) {
      const tenantId = req.userId;
      const businessName = payload.businessName ?? payload.name ?? null;
      if (!businessName || typeof businessName !== 'string' || businessName.trim().length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'missing_business_name',
          message: 'payload.businessName is required',
        });
      }
      const rawInput = [businessName, payload.businessType, payload.location].filter(Boolean).join(', ') || businessName;
      const result = await createBuildStoreJob(prisma, {
        tenantId,
        userId: req.userId,
        businessName: businessName.trim(),
        businessType: payload.businessType ?? undefined,
        storeType: payload.storeType ?? payload.businessType ?? undefined,
        rawInput,
        storeId: 'temp',
        includeImages: options?.autoImages !== false,
      });
      if (result.needRun && result.createdDraftId) {
        runBuildStoreJob(prisma, result.jobId, result.createdDraftId, result.generationRunId, newTraceId());
      }
      return res.status(200).json({
        ok: true,
        jobId: result.jobId,
        tenantId: result.tenantId,
        storeId: result.storeId,
        generationRunId: result.generationRunId,
      });
    }

    // Legacy: name, description, ...
    const {
      name,
      description,
      email,
      phone,
      industry,
      storeName,
      storeSlug,
      storeDescription,
      enablePublicStore = true,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Business name is required',
        message: 'Business name is required',
      });
    }

    const businessName = name.trim();
    const finalStoreName = storeName?.trim() || businessName;
    const finalDescription = description?.trim() || storeDescription?.trim() || null;

    // Check if user already has a business
    const existingBusiness = await prisma.business.findUnique({
      where: { userId: req.userId },
    });

    if (existingBusiness) {
      // Return existing business instead of error (allows re-publishing)
      return res.status(200).json({
        ok: true,
        businessId: existingBusiness.id,
        storeSlug: existingBusiness.slug,
        message: 'Business already exists',
      });
    }

    // Generate unique slug
    let finalSlug = storeSlug?.trim();
    if (!finalSlug || finalSlug.length === 0) {
      finalSlug = await generateUniqueStoreSlug(prisma, finalStoreName);
    } else {
      // Validate and ensure slug is unique
      const existingSlug = await prisma.business.findUnique({
        where: { slug: finalSlug },
      });
      if (existingSlug) {
        finalSlug = await generateUniqueStoreSlug(prisma, finalStoreName);
      }
    }

    // Create business
    const business = await prisma.business.create({
      data: {
        userId: req.userId,
        name: businessName,
        type: industry || 'General',
        slug: finalSlug,
        description: finalDescription,
        logo: null,
        region: null,
        isActive: enablePublicStore,
      },
    });

    // Update user's hasBusiness flag
    await prisma.user.update({
      where: { id: req.userId },
      data: { hasBusiness: true },
    });

    console.log(`[Business] ✅ Business created: ${business.slug} (${business.id}) by user ${req.userId}`);

    res.status(200).json({
      ok: true,
      businessId: business.id,
      storeSlug: business.slug,
    });
  } catch (error) {
    console.error('[Business] Create error:', error);
    next(error);
  }
});

export default router;


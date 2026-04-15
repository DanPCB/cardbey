/**
 * Automation Routes
 * Headless endpoints for minimal-input → artifact flows (e.g. store-from-input).
 */

import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { createDraft, generateDraft } from '../services/draftStore/draftStoreService.js';
import { publishDraft, PublishDraftError } from '../services/draftStore/publishDraftService.js';

const router = express.Router();
const prisma = new PrismaClient();

const StoreFromInputSchema = z.object({
  businessName: z.string().min(1, 'businessName is required'),
  businessType: z.string().optional(),
  location: z.string().optional(),
});

/**
 * POST /api/automation/store-from-input
 * Create a draft from minimal input, generate it, publish, and return store URL.
 * Requires auth. Uses publish service directly (no HTTP publish call).
 */
router.post('/store-from-input', requireAuth, async (req, res) => {
  try {
    const parsed = StoreFromInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: msg,
      });
    }
    const { businessName, businessType, location } = parsed.data;

    const runId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const draft = await createDraft({
      mode: 'ai',
      input: {
        businessName,
        businessType: businessType || undefined,
        location: location || undefined,
        generationRunId: runId,
      },
    });

    await generateDraft(draft.id, { userId: req.userId ?? null });

    const result = await publishDraft(prisma, {
      storeId: 'temp',
      generationRunId: runId,
      userId: req.userId,
    });

    return res.status(200).json({
      ok: true,
      storeId: result.storeId,
      storeUrl: result.storefrontUrl,
      slug: result.slug,
    });
  } catch (error) {
    if (error instanceof PublishDraftError) {
      return res.status(error.statusCode || 500).json({
        ok: false,
        error: error.code,
        message: error.message,
      });
    }
    console.error('[automation] store-from-input error:', error);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error?.message || 'Failed to create and publish store',
    });
  }
});

export default router;

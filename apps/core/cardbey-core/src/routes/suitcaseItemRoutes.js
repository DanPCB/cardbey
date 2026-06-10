/**
 * Phase 10 — Suitcase items API (account knowledge vault).
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  createSuitcaseItem,
  listSuitcaseItems,
  getSuitcaseItem,
  updateSuitcaseItem,
  deleteSuitcaseItem,
  saveBusinessBriefingSuitcaseItem,
  SUITCASE_SOURCE_TYPES,
  SUITCASE_CONTENT_TYPES,
} from '../services/suitcase/suitcaseItemService.js';

const router = Router();

const sourceTypeSchema = z.enum([...SUITCASE_SOURCE_TYPES]);
const contentTypeSchema = z.enum([...SUITCASE_CONTENT_TYPES]);

const createSchema = z.object({
  storeId: z.string().optional().nullable(),
  spaceId: z.string().optional().nullable(),
  missionId: z.string().optional().nullable(),
  sourceType: sourceTypeSchema,
  contentType: contentTypeSchema,
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  fileUrl: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  payload: z.unknown().optional().nullable(),
  visibility: z.enum(['private', 'shared', 'public']).optional(),
  idempotencyKey: z.string().optional().nullable(),
});

const patchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
    payload: z.unknown().optional().nullable(),
    fileUrl: z.string().optional().nullable(),
    thumbnailUrl: z.string().optional().nullable(),
    missionId: z.string().optional().nullable(),
    spaceId: z.string().optional().nullable(),
    storeId: z.string().optional().nullable(),
    visibility: z.enum(['private', 'shared', 'public']).optional(),
    embeddingStatus: z.enum(['pending', 'indexed', 'failed']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'patch must include at least one field' });

const briefingSchema = z.object({
  storeId: z.string().min(1),
  snapshotId: z.string().min(1),
  storeName: z.string().optional().nullable(),
  briefing: z.record(z.unknown()),
});

router.get('/items', requireAuth, async (req, res, next) => {
  try {
    const result = await listSuitcaseItems({
      ownerId: req.userId,
      storeId: typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
      spaceId: typeof req.query.spaceId === 'string' ? req.query.spaceId : undefined,
      sourceType: typeof req.query.sourceType === 'string' ? req.query.sourceType : undefined,
      contentType: typeof req.query.contentType === 'string' ? req.query.contentType : undefined,
      missionId: typeof req.query.missionId === 'string' ? req.query.missionId : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/items', requireAuth, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const result = await createSuitcaseItem({ ...body, ownerId: req.userId });
    res.status(result.created === false ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.post('/items/briefing', requireAuth, async (req, res, next) => {
  try {
    const body = briefingSchema.parse(req.body);
    const result = await saveBusinessBriefingSuitcaseItem({ ...body, ownerId: req.userId });
    res.status(result.created === false ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.get('/items/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await getSuitcaseItem({ ownerId: req.userId, itemId: req.params.id });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.patch('/items/:id', requireAuth, async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body);
    const result = await updateSuitcaseItem({
      ownerId: req.userId,
      itemId: req.params.id,
      patch,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'validation_error', details: error.errors });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

router.delete('/items/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await deleteSuitcaseItem({ ownerId: req.userId, itemId: req.params.id });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    next(error);
  }
});

export default router;

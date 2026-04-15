/**
 * AI Suggestions Router
 * Fetch and manage AI suggestions
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import cuid from 'cuid';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * GET /logs
 * Retrieve paginated suggestion logs
 * Query params: page, limit, status, node, from, to
 */
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const node = req.query.node;
    const from = req.query.from;
    const to = req.query.to;

    const where = {};
    if (status) where.status = status;
    if (node) where.node = node;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, logs] = await Promise.all([
      prisma.suggestionLog.count({ where }),
      prisma.suggestionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const data = logs.map((log) => ({
      id: log.id,
      node: log.node,
      title: log.title,
      description: log.description,
      confidence: log.confidence,
      impact: log.impact,
      actions: JSON.parse(log.actions),
      sourceEvent: log.sourceEvent,
      createdAt: log.createdAt.toISOString(),
      status: log.status,
    }));

    res.json({
      data,
      meta: {
        page,
        totalPages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    console.error('[AI] logs error:', err);
    res.status(500).json({ error: 'logs_failed', message: err.message });
  }
});

/**
 * POST /apply
 * Apply or ignore a suggestion (human-in-loop)
 * Phase 2: With real action execution
 */
router.post('/apply', async (req, res) => {
  try {
    const { suggestionId, status, note, appliedBy = 'user' } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'];

    if (!suggestionId || !status) {
      return res.status(400).json({ error: 'missing_fields', message: 'suggestionId and status required' });
    }

    if (!['APPLIED', 'IGNORED'].includes(status)) {
      return res.status(400).json({ error: 'invalid_status', message: 'status must be APPLIED or IGNORED' });
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await checkIdempotency(idempotencyKey);
      if (existing) {
        console.log(`[AI] Idempotent request: ${idempotencyKey}`);
        return res.json(existing);
      }
    }

    const suggestion = await prisma.suggestionLog.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      return res.status(404).json({ error: 'not_found', message: 'Suggestion not found' });
    }

    // Only allow applying PENDING suggestions
    if (suggestion.status !== 'PENDING' && status === 'APPLIED') {
      return res.status(409).json({ 
        error: 'already_processed', 
        message: `Suggestion already ${suggestion.status}` 
      });
    }

    // Execute actions if APPLIED
    let actionResults = [];
    if (status === 'APPLIED') {
      const { executeActions } = await import('../actions/executor.js');
      actionResults = await executeActions(suggestion, appliedBy);
    }

    // Update suggestion
    const updated = await prisma.suggestionLog.update({
      where: { id: suggestionId },
      data: { 
        status,
        appliedBy: status === 'APPLIED' ? appliedBy : null,
        appliedAt: status === 'APPLIED' ? new Date() : null,
      },
    });

    console.log(`[AI] Suggestion ${suggestionId} marked as ${status}${note ? ` (${note})` : ''}`);
    if (actionResults.length > 0) {
      console.log(`[AI] Executed ${actionResults.length} action(s):`, actionResults);
    }

    const response = {
      ok: true,
      id: updated.id,
      status: updated.status,
      actionResults,
    };

    // Cache idempotent response
    if (idempotencyKey) {
      await saveIdempotency(idempotencyKey, response);
    }

    // Phase 2: Emit SSE event suggestion.applied
    try {
      const { broadcastSuggestionApplied } = await import('../sse/bus.js');
      broadcastSuggestionApplied({ 
        id: updated.id, 
        status: updated.status,
        node: updated.node,
        actionResults,
      });
    } catch (_) {
      // SSE not available, that's ok
    }

    res.json(response);
  } catch (err) {
    console.error('[AI] apply error:', err);
    res.status(500).json({ error: 'apply_failed', message: err.message });
  }
});

/**
 * Check if request with this idempotency key was already processed
 */
async function checkIdempotency(key) {
  const hash = Buffer.from(key).toString('base64').substring(0, 64);
  const record = await prisma.idempotencyKey.findUnique({
    where: { keyHash: hash },
  });
  
  if (record && new Date(record.expiresAt) > new Date()) {
    return JSON.parse(record.response);
  }
  
  return null;
}

/**
 * Save idempotent response
 */
async function saveIdempotency(key, response) {
  const hash = Buffer.from(key).toString('base64').substring(0, 64);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  
  await prisma.idempotencyKey.create({
    data: {
      id: cuid(),
      keyHash: hash,
      response: JSON.stringify(response),
      createdAt: new Date(),
      expiresAt,
    },
  });
}

export default router;


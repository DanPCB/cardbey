/**
 * Demand Tracking Routes
 * POST /api/demands - Track user intents and actions
 * GET  /api/demands - List user's demands (for analytics)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/demands
 * Track a user intent/demand
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { scope, category, intent, context } = req.body;
    
    // Validation
    if (!scope || !category || !intent) {
      return res.status(400).json({ 
        error: 'Missing required fields: scope, category, intent' 
      });
    }
    
    // Create demand
    const demand = await prisma.demand.create({
      data: {
        userId: req.userId,
        scope,
        category,
        intent,
        context: context ? JSON.stringify(context) : null
      }
    });
    
    console.log(`[Demand] User ${req.userId} - ${intent} (${scope}/${category})`);
    
    res.status(201).json({ data: demand });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/demands
 * Get user's demand history
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { scope, category, fulfilled } = req.query;
    
    const where = {
      userId: req.userId
    };
    
    if (scope) where.scope = scope;
    if (category) where.category = category;
    if (fulfilled !== undefined) where.fulfilled = fulfilled === 'true';
    
    const demands = await prisma.demand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Parse JSON context fields
    const demandsWithParsedContext = demands.map(d => ({
      ...d,
      context: d.context ? JSON.parse(d.context) : null
    }));
    
    res.json({ data: demandsWithParsedContext });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/demands/:id/fulfill
 * Mark a demand as fulfilled
 */
router.patch('/:id/fulfill', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Verify demand belongs to user
    const demand = await prisma.demand.findFirst({
      where: { id, userId: req.userId }
    });
    
    if (!demand) {
      return res.status(404).json({ error: 'Demand not found' });
    }
    
    // Update demand
    const updated = await prisma.demand.update({
      where: { id },
      data: {
        fulfilled: true,
        fulfilledAt: new Date()
      }
    });
    
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;


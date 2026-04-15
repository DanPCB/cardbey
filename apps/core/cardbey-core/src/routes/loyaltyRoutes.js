/**
 * Loyalty Engine API Routes
 * Exposes loyalty engine tools as HTTP endpoints
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { getEventEmitter } from '../engines/loyalty/events.js';
import {
  ConfigureProgramInput,
  GenerateAssetsInput,
  QueryCustomerStatusInput,
  AddStampInput,
  RedeemRewardInput,
} from '../engines/loyalty/types.js';
import {
  configureProgram,
  generateAssets,
  queryCustomerStatus,
  addStamp,
  redeemReward,
} from '../engines/loyalty/index.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Create engine context with services
 */
function createEngineContext() {
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
      // TODO: Add QR, images, PDF services when available
    },
  };
}

/**
 * POST /api/loyalty/program
 * Configure a loyalty program (create or update)
 */
router.post('/program', requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const input = ConfigureProgramInput.parse(req.body);
    
    // Call tool handler
    const result = await configureProgram(input, createEngineContext());
    
    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

/**
 * POST /api/loyalty/assets
 * Generate loyalty card assets (QR, image, PDF)
 */
router.post('/assets', requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const input = GenerateAssetsInput.parse(req.body);
    
    // Call tool handler
    const result = await generateAssets(input, createEngineContext());
    
    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

/**
 * POST /api/loyalty/status
 * Query customer loyalty status
 */
router.post('/status', requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const input = QueryCustomerStatusInput.parse(req.body);
    
    // Call tool handler
    const result = await queryCustomerStatus(input, createEngineContext());
    
    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

/**
 * POST /api/loyalty/add-stamp
 * Add a stamp to customer's loyalty card
 */
router.post('/add-stamp', requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const input = AddStampInput.parse(req.body);
    
    // Call tool handler
    const result = await addStamp(input, createEngineContext());
    
    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    next(error);
  }
});

/**
 * POST /api/loyalty/redeem
 * Redeem a reward for a customer
 */
router.post('/redeem', requireAuth, async (req, res, next) => {
  try {
    // Validate input
    const input = RedeemRewardInput.parse(req.body);
    
    // Call tool handler
    const result = await redeemReward(input, createEngineContext());
    
    res.json(result);
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    
    // Handle business logic errors
    if (error.message?.includes('not found') || error.message?.includes('Not enough stamps')) {
      return res.status(400).json({
        ok: false,
        error: error.message,
      });
    }
    
    next(error);
  }
});

export default router;



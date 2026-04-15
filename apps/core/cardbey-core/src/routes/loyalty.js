/**
 * Loyalty Routes
 * POST /api/loyalty/programs - Create a loyalty program
 * GET /api/loyalty/programs/:storeId - Get all programs for a store
 * POST /api/loyalty/stamp/add - Add a stamp to a customer
 * POST /api/loyalty/stamp/redeem - Redeem a reward
 * GET /api/loyalty/stamp/history/:customerId - Get stamp history for a customer
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const createProgramSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1),
  stampsReq: z.number().int().min(1).max(50),
  reward: z.string().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
  autoReward: z.boolean().optional().default(false),
});

const addStampSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().min(1),
  programId: z.string().min(1),
});

const redeemRewardSchema = z.object({
  storeId: z.string().min(1),
  customerId: z.string().min(1),
  programId: z.string().min(1),
});

/**
 * POST /api/loyalty/programs
 * Create a new loyalty program
 */
router.post('/programs', requireAuth, async (req, res, next) => {
  try {
    const body = createProgramSchema.parse(req.body);
    
    // Check if store exists (optional validation)
    // You can add store ownership check here if needed
    
    const program = await prisma.loyaltyProgram.create({
      data: {
        storeId: body.storeId,
        name: body.name,
        stampsReq: body.stampsReq,
        reward: body.reward,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        autoReward: body.autoReward || false,
      },
    });

    res.status(201).json({
      ok: true,
      program,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
 * GET /api/loyalty/programs/:storeId
 * Get all loyalty programs for a store
 */
router.get('/programs/:storeId', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const programs = await prisma.loyaltyProgram.findMany({
      where: {
        storeId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        _count: {
          select: { stamps: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ok: true,
      programs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loyalty/stamp/add
 * Add a stamp to a customer's loyalty card
 */
router.post('/stamp/add', requireAuth, async (req, res, next) => {
  try {
    const body = addStampSchema.parse(req.body);
    
    // Get or create loyalty stamp record
    let stamp = await prisma.loyaltyProgramStamp.findUnique({
      where: {
        customerId_programId: {
          customerId: body.customerId,
          programId: body.programId,
        },
      },
      include: {
        program: true,
      },
    });

    if (!stamp) {
      // Create new stamp record
      stamp = await prisma.loyaltyProgramStamp.create({
        data: {
          customerId: body.customerId,
          storeId: body.storeId,
          programId: body.programId,
          count: 1,
          rewarded: false,
        },
        include: {
          program: true,
        },
      });
    } else {
      // Increment stamp count
      const newCount = stamp.count + 1;
      const shouldReward = newCount >= stamp.program.stampsReq && !stamp.rewarded;
      
      stamp = await prisma.loyaltyProgramStamp.update({
        where: { id: stamp.id },
        data: {
          count: newCount,
          rewarded: shouldReward && stamp.program.autoReward ? true : stamp.rewarded,
        },
        include: {
          program: true,
        },
      });
    }

    res.json({
      ok: true,
      stamp,
      count: stamp.count,
      canRedeem: stamp.count >= stamp.program.stampsReq && !stamp.rewarded,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
 * POST /api/loyalty/stamp/redeem
 * Redeem a reward for a customer
 */
router.post('/stamp/redeem', requireAuth, async (req, res, next) => {
  try {
    const body = redeemRewardSchema.parse(req.body);
    
    const stamp = await prisma.loyaltyProgramStamp.findUnique({
      where: {
        customerId_programId: {
          customerId: body.customerId,
          programId: body.programId,
        },
      },
      include: {
        program: true,
      },
    });

    if (!stamp) {
      return res.status(404).json({
        ok: false,
        error: 'Loyalty stamp record not found',
      });
    }

    if (stamp.count < stamp.program.stampsReq) {
      return res.status(400).json({
        ok: false,
        error: `Not enough stamps. Need ${stamp.program.stampsReq}, have ${stamp.count}`,
      });
    }

    if (stamp.rewarded) {
      return res.status(400).json({
        ok: false,
        error: 'Reward already redeemed',
      });
    }

    // Mark as rewarded
    const updated = await prisma.loyaltyProgramStamp.update({
      where: { id: stamp.id },
      data: {
        rewarded: true,
      },
      include: {
        program: true,
      },
    });

    res.json({
      ok: true,
      stamp: updated,
      reward: stamp.program.reward,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
 * Get current status for a customer (stamp count, eligibility)
 */
router.post('/status', requireAuth, async (req, res, next) => {
  try {
    const { storeId, customerId, programId } = req.body;
    
    if (!storeId || !customerId || !programId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: storeId, customerId, programId',
      });
    }

    const stamp = await prisma.loyaltyProgramStamp.findUnique({
      where: {
        customerId_programId: {
          customerId,
          programId,
        },
      },
      include: {
        program: true,
      },
    });

    if (!stamp) {
      return res.json({
        ok: true,
        count: 0,
        totalRequired: 0,
        canRedeem: false,
        program: null,
      });
    }

    res.json({
      ok: true,
      count: stamp.count,
      totalRequired: stamp.program.stampsReq,
      canRedeem: stamp.count >= stamp.program.stampsReq && !stamp.rewarded,
      rewarded: stamp.rewarded,
      program: {
        id: stamp.program.id,
        name: stamp.program.name,
        reward: stamp.program.reward,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/loyalty/add-stamp
 * Alias for /stamp/add (for compatibility)
 */
router.post('/add-stamp', requireAuth, async (req, res, next) => {
  // Delegate to the existing /stamp/add handler
  req.url = '/stamp/add';
  router.handle(req, res, next);
});

/**
 * GET /api/loyalty/stamp-history/:customerId
 * Alias for /stamp/history/:customerId (for compatibility)
 */
router.get('/stamp-history/:customerId', requireAuth, async (req, res, next) => {
  // Delegate to the existing /stamp/history/:customerId handler
  req.url = `/stamp/history/${req.params.customerId}`;
  router.handle(req, res, next);
});

/**
 * GET /api/loyalty/stamp/history/:customerId
 * Get stamp history for a customer
 */
router.get('/stamp/history/:customerId', requireAuth, async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const stamps = await prisma.loyaltyProgramStamp.findMany({
      where: {
        customerId,
      },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            reward: true,
            stampsReq: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Format history entries
    const history = stamps.flatMap((stamp) => {
      const entries = [];
      
      // Add initial stamp entries (simplified - in real app, you'd track individual stamps)
      for (let i = 1; i <= stamp.count; i++) {
        entries.push({
          id: `${stamp.id}-${i}`,
          count: i,
          rewarded: i === stamp.count && stamp.rewarded,
          programId: stamp.programId,
          programName: stamp.program.name,
          createdAt: stamp.createdAt,
          updatedAt: stamp.updatedAt,
        });
      }
      
      return entries;
    });

    res.json({
      ok: true,
      history: history.slice(0, 50), // Limit to last 50 entries
      currentStamps: stamps.map(s => ({
        programId: s.programId,
        programName: s.program.name,
        count: s.count,
        rewarded: s.rewarded,
        canRedeem: s.count >= s.program.stampsReq && !s.rewarded,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;


/**
 * Reward API Routes
 * CAI balance and reward endpoints
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * GET /api/reward/balance/:userId
 * Get user's CAI balance
 * 
 * Response:
 *   {
 *     balance: number
 *   }
 */
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // For now, return a mock balance
    // TODO: Implement actual balance calculation from reward transactions
    // This could query RewardTransaction table or a UserCredits table
    const balance = 1250; // Mock balance
    
    res.json({ balance });
  } catch (error) {
    console.error('[Reward] Error fetching balance:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch balance',
      balance: 0
    });
  }
});

export default router;

















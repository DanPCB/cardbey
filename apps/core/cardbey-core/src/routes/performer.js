/**
 * Performer API Routes
 * Routes for Performer app (AI agent interface)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

/**
 * GET /api/performer/lastSession
 * Get the last session data for a user
 * 
 * Query params: ?userId=<userId>
 * Headers: X-User-Key (optional, for user identification)
 * 
 * Response:
 *   {
 *     sessionData: object | null
 *   }
 */
router.get('/lastSession', async (req, res) => {
  try {
    // Get userId from query param, header, or user context
    const userId = req.query.userId || req.headers['x-user-key'] || req.user?.id || null;
    
    // For now, return null session data
    // TODO: Implement actual session storage/retrieval from database
    // This could query a Session table or ChatMemory table
    res.json({ 
      sessionData: null 
    });
  } catch (error) {
    console.error('[Performer] Error fetching last session:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch last session',
      sessionData: null
    });
  }
});

/**
 * POST /api/performer/share
 * Create a share job for publishing content
 * 
 * Request body:
 *   {
 *     userId: string,
 *     title: string,
 *     text: string,
 *     imageUrl?: string,
 *     videoUrl?: string,
 *     targets: Array<{ kind: string, provider?: string, ... }>
 *   }
 * 
 * Response:
 *   {
 *     jobId: string,
 *     status: string,
 *     message: string
 *   }
 */
router.post('/share', async (req, res) => {
  try {
    const { title, text, imageUrl, videoUrl, targets } = req.body;
    
    // Validate required fields
    if (!title || !text || !targets || !Array.isArray(targets)) {
      return res.status(400).json({ 
        ok: false,
        error: 'missing_fields',
        message: 'Missing required fields: title, text, targets'
      });
    }

    // Get userId from header, body, or user context
    const userId = req.body.userId || req.headers['x-user-key'] || req.user?.id || 'anonymous';
    
    // Generate a job ID
    const jobId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    console.log(`[Performer] Created share job ${jobId} for user ${userId}`, {
      title: title.substring(0, 50),
      targetsCount: targets.length,
      hasImage: !!imageUrl,
      hasVideo: !!videoUrl,
    });
    
    // TODO: Store share job in database when ShareJob model is added to core schema
    // For now, return a mock response
    res.json({
      ok: true,
      jobId,
      status: 'QUEUED',
      message: 'Share job created successfully'
    });
  } catch (error) {
    console.error('[Performer] Share error:', error);
    res.status(500).json({ 
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create share job'
    });
  }
});

/**
 * GET /api/performer/share/:jobId
 * Get share job details
 */
router.get('/share/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // TODO: Query ShareJob from database when model is added
    // For now, return a mock response
    res.json({
      ok: true,
      job: {
        id: jobId,
        status: 'QUEUED',
        title: 'Mock Share Job',
        createdAt: new Date().toISOString(),
      },
      events: []
    });
  } catch (error) {
    console.error('[Performer] Get share job error:', error);
    res.status(500).json({ 
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to fetch share job'
    });
  }
});

export default router;


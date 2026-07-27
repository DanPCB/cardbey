/**
 * AI SSE Router
 * Server-Sent Events endpoint for AI suggestions
 * Phase 2: With heartbeat (20s) and reliability
 */

import express from 'express';
import cuid from 'cuid';
import { addAIClient, removeAIClient } from './bus.js';

const router = express.Router();

/**
 * GET /ai/stream
 * SSE endpoint for real-time AI suggestions
 * No auth required for AI dashboard
 */
router.get('/ai/stream', (req, res) => {
  const clientId = cuid();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Register client (handles heartbeat internally)
  addAIClient(clientId, res);

  // Cleanup on disconnect
  req.on('close', () => {
    removeAIClient(clientId);
    res.end();
  });
});

export default router;








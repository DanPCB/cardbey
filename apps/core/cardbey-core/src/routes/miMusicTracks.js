/**
 * MI Music Tracks Routes
 * Endpoints for MI music track catalog
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { handleListMiMusicTracks, handleGetMiMusicTrack } from '../controllers/miMusicTracksController.js';

const router = express.Router();

/**
 * GET /api/mi/music-tracks
 * List all music tracks with optional filtering
 * 
 * Query parameters:
 *   - category (optional, e.g. "christmas_2025", "generic")
 *   - isActive (optional, default: true)
 */
router.get('/', requireAuth, handleListMiMusicTracks);

/**
 * GET /api/mi/music-tracks/:key
 * Get a specific music track by key
 */
router.get('/:key', requireAuth, handleGetMiMusicTrack);

export default router;


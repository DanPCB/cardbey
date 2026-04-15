/**
 * Screen Deletion Service
 * Soft deletes screens by setting deletedAt timestamp
 * 
 * NEVER hard-delete Screen in production.
 * Always use soft delete (update deletedAt) to preserve data integrity.
 */

import { PrismaClient } from '@prisma/client';
import { broadcast } from '../realtime/sse.js';
import { clearPairSessionsByScreenId } from '../pair/sessionStore.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Delete a screen (soft delete)
 * @param {string} screenId - Screen ID to delete
 * @param {{ purgeMedia?: boolean }} [options] - Options
 * @returns {Promise<{ screenId: string }>}
 * @throws {Error} 404 if screen not found or already deleted
 */
export async function deleteScreen(screenId, options = {}) {
  const { purgeMedia = false } = options;

  // Find screen by id where deletedAt = null
  const screen = await prisma.screen.findFirst({
    where: {
      id: screenId,
      deletedAt: null,
    },
  });

  if (!screen) {
    const error = new Error('Screen not found or already deleted');
    error.statusCode = 404;
    throw error;
  }

  // Clear relationships
  // 1. Unassign playlist
  // 2. Revoke device token/session (clear from pair sessions)
  // 3. Set status='OFFLINE'
  // 4. Set lastSeen=null

  // Clear pair sessions for this screen (revoke device tokens)
  try {
    const clearedCount = await clearPairSessionsByScreenId(screenId);
    if (clearedCount > 0) {
      console.log(`[deleteScreen] Cleared ${clearedCount} pair session(s) for screen ${screenId}`);
    }
  } catch (err) {
    console.warn('[deleteScreen] Error clearing pair sessions:', err);
  }

  // Update screen with soft delete
  await prisma.screen.update({
    where: { id: screenId },
    data: {
      deletedAt: new Date(),
      assignedPlaylistId: null, // Unassign playlist
      status: 'OFFLINE',
      lastSeen: null,
      statusText: 'deleted',
    },
  });

  // If purgeMedia is requested, queue a job to remove uploads
  if (purgeMedia) {
    // Don't block the request - do this asynchronously
    setImmediate(async () => {
      try {
        const uploadsDir = path.join(process.cwd(), 'uploads', screenId);
        if (fs.existsSync(uploadsDir)) {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
          console.log(`[deleteScreen] Purged media for screen ${screenId}`);
        }
      } catch (err) {
        console.error(`[deleteScreen] Error purging media for ${screenId}:`, err);
      }
    });
  }

  // Emit SSE broadcast
  broadcast('screen.deleted', {
    screenId,
  });

  return { screenId };
}


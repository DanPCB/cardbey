// src/jobs/videoOptimizerQueue.js
// Lightweight async queue for video optimization jobs (no Redis needed)

import { PrismaClient } from '@prisma/client';
import { optimizeVideoFromS3 } from '../services/videoOptimizer.js';
import { info, error, warn } from '../lib/logger.js';

const prisma = new PrismaClient();

// Simple in-memory queue
const queue = [];
let processing = false;
let processorInterval = null;

/**
 * Enqueue a video optimization job
 * 
 * @param {string} mediaId - Media record ID
 * @param {string} s3Key - Original S3 key
 * @param {string} mimeType - MIME type (for validation)
 */
export function enqueueOptimizeVideo(mediaId, s3Key, mimeType) {
  // Validate it's a video
  if (!mimeType || !mimeType.startsWith('video/')) {
    warn('OPTIMIZER', 'Skipping non-video MIME type', {
      assetId: mediaId,
      mimeType,
    });
    return;
  }
  
  // Check if already queued
  if (queue.find(job => job.mediaId === mediaId)) {
    info('OPTIMIZER', 'Job already queued', {
      assetId: mediaId,
    });
    return;
  }
  
  // Add to queue
  queue.push({
    mediaId,
    s3Key,
    mimeType,
    enqueuedAt: Date.now(),
  });
  
  info('OPTIMIZER', 'Optimization job queued', {
    assetId: mediaId,
    storageKey: s3Key,
    mimeType,
    queueSize: queue.length,
  });
  
  // Start processor if not running
  startProcessor();
}

/**
 * Start the queue processor (runs jobs one at a time)
 */
function startProcessor() {
  if (processorInterval || processing) {
    return; // Already running
  }
  
  info('OPTIMIZER', 'Queue processor started');
  
  // Process queue with a small delay between jobs
  processorInterval = setInterval(() => {
    processNextJob();
  }, 5000); // Check every 5 seconds
  
  // Process immediately
  setImmediate(() => processNextJob());
}

/**
 * Stop the queue processor
 */
function stopProcessor() {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    info('OPTIMIZER', 'Queue processor stopped');
  }
}

/**
 * Process the next job in the queue
 */
async function processNextJob() {
  // Skip if already processing or queue is empty
  if (processing || queue.length === 0) {
    return;
  }
  
  processing = true;
  const job = queue.shift();
  
  if (!job) {
    processing = false;
    return;
  }
  
  const { mediaId, s3Key, mimeType, enqueuedAt } = job;
  const waitTime = Date.now() - enqueuedAt;
  const startTime = Date.now();
  
  info('OPTIMIZER', 'Optimization started', {
    assetId: mediaId,
    storageKey: s3Key,
    waitTimeMs: waitTime,
  });
  
  try {
    // Verify media still exists and is still a video
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, kind: true, mime: true, isOptimized: true },
    });
    
    if (!media) {
      warn('OPTIMIZER', 'Skipping optimization - media not found', {
        assetId: mediaId,
      });
      processing = false;
      return;
    }
    
    if (media.isOptimized) {
      info('OPTIMIZER', 'Skipping optimization - already optimized', {
        assetId: mediaId,
      });
      processing = false;
      return;
    }
    
    if (media.kind !== 'VIDEO' || !media.mime.startsWith('video/')) {
      warn('OPTIMIZER', 'Skipping optimization - not a video', {
        assetId: mediaId,
        kind: media.kind,
        mime: media.mime,
      });
      processing = false;
      return;
    }
    
    // Optimize video from S3
    const { key: optimizedKey, url: optimizedUrl } = await optimizeVideoFromS3(s3Key);
    
    // Calculate duration
    const durationMs = Date.now() - startTime;
    
    // Update media record with optimized URL
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        optimizedUrl,
        optimizedKey,
        isOptimized: true,
        optimizedAt: new Date(),
      },
    });
    
    info('OPTIMIZER', 'Optimization finished', {
      assetId: mediaId,
      originalKey: s3Key,
      optimizedKey,
      optimizedUrl,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    error('OPTIMIZER', 'Optimization failed', {
      assetId: mediaId,
      storageKey: s3Key,
      errorMessage: err.message,
      errorStack: err.stack?.substring(0, 300),
      durationMs,
    });
    
    // Don't update DB on error - media will keep isOptimized=false
    // Job won't be retried automatically (could add retry logic later)
  } finally {
    processing = false;
    
    // Stop processor if queue is empty
    if (queue.length === 0) {
      stopProcessor();
    }
  }
}

/**
 * Get queue status (for debugging)
 */
export function getQueueStatus() {
  return {
    queueSize: queue.length,
    processing,
    jobs: queue.map(job => ({
      mediaId: job.mediaId,
      waitTime: Date.now() - job.enqueuedAt,
    })),
  };
}

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('SIGINT', () => {
    stopProcessor();
  });
  
  process.on('SIGTERM', () => {
    stopProcessor();
  });
}


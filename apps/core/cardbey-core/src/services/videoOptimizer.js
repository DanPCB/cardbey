// src/services/videoOptimizer.js
// Video optimization service using ffmpeg

import path from 'path';
import fs from 'fs';
import { downloadFromS3, uploadBufferToS3, makeOptimizedKey } from '../lib/s3Client.js';
import { info, error, debug } from '../lib/logger.js';
import { createTempPath, safeUnlink } from '../lib/tempFiles.js';

// Lazy initialization for ffmpeg
let ffmpeg = null;
let ffmpegInitialized = false;
let ffmpegInitializationPromise = null;

async function initializeFfmpeg() {
  if (ffmpegInitialized) {
    return ffmpeg;
  }
  
  if (ffmpegInitializationPromise) {
    return ffmpegInitializationPromise.then(() => ffmpeg);
  }
  
  ffmpegInitializationPromise = (async () => {
    try {
      const { default: ffmpegModule } = await import('fluent-ffmpeg');
      ffmpeg = ffmpegModule;
      
      const { default: ffmpegStatic } = await import('ffmpeg-static');
      const { default: ffprobeStatic } = await import('ffprobe-static');
      
      if (ffmpeg && ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
      }
      
      if (ffmpeg && ffprobeStatic?.path) {
        ffmpeg.setFfprobePath(ffprobeStatic.path);
      }
      
      ffmpegInitialized = true;
      return ffmpeg;
    } catch (error) {
      console.error('[VideoOptimizer] Failed to load ffmpeg packages:', error.message);
      ffmpegInitialized = true;
      ffmpeg = null;
      return null;
    }
  })();
  
  return ffmpegInitializationPromise;
}

/**
 * Optimize video from file path using ffmpeg
 * Target: ~6-8 Mbps, 720p max height, H.264/AAC
 * This version works with file paths to avoid loading large files into memory
 * 
 * @param {string} inputFilePath - Path to input video file
 * @param {string} originalName - Original filename for logging
 * @returns {Promise<Buffer>} Optimized video buffer
 */
export async function optimizeVideoFromFile(inputFilePath, originalName = 'video') {
  const ffmpegInstance = await initializeFfmpeg();
  
  if (!ffmpegInstance) {
    throw new Error('ffmpeg not available');
  }
  
  // Create temp output file path using os.tmpdir()
  const tempOutputPath = createTempPath('cardbey-optimized-', '.mp4');
  
  try {
    // Get input file size for logging
    const inputStats = await fs.promises.stat(inputFilePath);
    const inputSize = inputStats.size;
    
    // Run ffmpeg optimization (input is already a file path)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video optimization timeout (15 minutes)'));
      }, 15 * 60 * 1000); // 15 minute timeout
      
      ffmpegInstance(inputFilePath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('?x720') // Max height 720px, preserve aspect ratio
        .videoBitrate('6000k') // 6 Mbps video bitrate (target ~6-8 Mbps total)
        .audioBitrate('192k') // 192 kbps audio bitrate
        .outputOptions([
          '-preset fast', // Fast encoding preset
          '-movflags +faststart', // Enable fast start for streaming
          '-crf 23', // Constant rate factor for quality (23 is good balance)
          '-pix_fmt yuv420p', // Ensure compatibility
          '-profile:v high', // H.264 high profile
          '-level 4.0', // H.264 level 4.0
        ])
        .on('start', (commandLine) => {
          info('OPTIMIZER', 'FFmpeg optimization started', {
            originalName,
            command: commandLine.substring(0, 100),
          });
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            // Log progress at 25%, 50%, 75%, 100% only to reduce noise
            const percent = Math.round(progress.percent);
            if (percent % 25 === 0 || percent === 100) {
              info('OPTIMIZER', 'Optimization progress', {
                originalName,
                percent,
              });
            }
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          info('OPTIMIZER', 'FFmpeg optimization completed', {
            originalName,
          });
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          error('OPTIMIZER', 'FFmpeg optimization failed', {
            originalName,
            errorMessage: err.message,
          });
          reject(err);
        })
        .save(tempOutputPath);
    });
    
    // Read optimized video buffer
    const optimizedBuffer = await fs.promises.readFile(tempOutputPath);
    
    const reductionPercent = Math.round((1 - optimizedBuffer.length / inputSize) * 100);
    info('OPTIMIZER', 'Video optimization size reduction', {
      originalName,
      originalSize: inputSize,
      optimizedSize: optimizedBuffer.length,
      reductionPercent,
    });
    
    return optimizedBuffer;
  } finally {
    // Clean up temp output file (input file cleanup is handled by caller)
    await safeUnlink(tempOutputPath, 'OPTIMIZER');
  }
}

/**
 * Optimize video buffer using ffmpeg (legacy - loads into memory)
 * WARNING: This loads the entire video into memory. Use optimizeVideoFromFile() for large files.
 * 
 * @param {Buffer} inputBuffer - Original video buffer
 * @param {string} originalName - Original filename for logging
 * @returns {Promise<Buffer>} Optimized video buffer
 */
export async function optimizeVideo(inputBuffer, originalName = 'video') {
  const ffmpegInstance = await initializeFfmpeg();
  
  if (!ffmpegInstance) {
    throw new Error('ffmpeg not available');
  }
  
  // Create temp file paths using os.tmpdir()
  const ext = path.extname(originalName) || '.mp4';
  const tempInputPath = createTempPath('cardbey-input-', ext);
  const tempOutputPath = createTempPath('cardbey-optimized-', '.mp4');
  
  try {
    // Write input buffer to temp file
    await fs.promises.writeFile(tempInputPath, inputBuffer);
    
    // Run ffmpeg optimization
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video optimization timeout (15 minutes)'));
      }, 15 * 60 * 1000); // 15 minute timeout
      
      ffmpegInstance(tempInputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('?x720') // Max height 720px, preserve aspect ratio
        .videoBitrate('6000k') // 6 Mbps video bitrate (target ~6-8 Mbps total)
        .audioBitrate('192k') // 192 kbps audio bitrate
        .outputOptions([
          '-preset fast', // Fast encoding preset
          '-movflags +faststart', // Enable fast start for streaming
          '-crf 23', // Constant rate factor for quality (23 is good balance)
          '-pix_fmt yuv420p', // Ensure compatibility
          '-profile:v high', // H.264 high profile
          '-level 4.0', // H.264 level 4.0
        ])
        .on('start', (commandLine) => {
          info('OPTIMIZER', 'FFmpeg optimization started', {
            originalName,
            command: commandLine.substring(0, 100),
          });
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            // Log progress at 25%, 50%, 75%, 100% only to reduce noise
            const percent = Math.round(progress.percent);
            if (percent % 25 === 0 || percent === 100) {
              info('OPTIMIZER', 'Optimization progress', {
                originalName,
                percent,
              });
            }
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          info('OPTIMIZER', 'FFmpeg optimization completed', {
            originalName,
          });
          resolve();
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          error('OPTIMIZER', 'FFmpeg optimization failed', {
            originalName,
            errorMessage: err.message,
          });
          reject(err);
        })
        .save(tempOutputPath);
    });
    
    // Read optimized video buffer
    const optimizedBuffer = await fs.promises.readFile(tempOutputPath);
    
    const reductionPercent = Math.round((1 - optimizedBuffer.length / inputBuffer.length) * 100);
    info('OPTIMIZER', 'Video optimization size reduction', {
      originalName,
      originalSize: inputBuffer.length,
      optimizedSize: optimizedBuffer.length,
      reductionPercent,
    });
    
    return optimizedBuffer;
  } finally {
    // Clean up temp files
    await Promise.all([
      safeUnlink(tempInputPath, 'OPTIMIZER'),
      safeUnlink(tempOutputPath, 'OPTIMIZER'),
    ]);
  }
}

/**
 * Optimize video from S3 and upload optimized version back to S3
 * 
 * @param {string} originalS3Key - Original S3 key (e.g., "media/1699999999999-abc123.mp4")
 * @returns {Promise<{key: string, url: string}>} Optimized S3 key and CloudFront URL
 */
export async function optimizeVideoFromS3(originalS3Key) {
  info('OPTIMIZER', 'Starting optimization from S3', {
    originalKey: originalS3Key,
  });
  
  // Download original video from S3 to temp file (streams to disk, avoids OOM)
  const { downloadFromS3ToFile } = await import('../lib/s3Client.js');
  const tempInputPath = await downloadFromS3ToFile(originalS3Key);
  
  try {
    // Optimize video from file (ffmpeg works with file paths)
    const optimizedBuffer = await optimizeVideoFromFile(tempInputPath, path.basename(originalS3Key));
    
    // Generate optimized S3 key
    const optimizedKey = makeOptimizedKey(originalS3Key);
    
    // Upload optimized video to S3 with predefined key
    const { uploadOptimizedToS3 } = await import('../lib/s3Client.js');
    const result = await uploadOptimizedToS3(optimizedBuffer, optimizedKey);
    
    info('OPTIMIZER', 'Optimized video uploaded to S3', {
      originalKey: originalS3Key,
      optimizedKey: result.key,
      optimizedUrl: result.url,
    });
    
    return result;
  } finally {
    // Clean up downloaded temp file
    await safeUnlink(tempInputPath, 'OPTIMIZER');
  }
}


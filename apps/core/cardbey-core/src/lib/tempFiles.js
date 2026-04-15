// src/lib/tempFiles.js
// Helper utilities for managing temporary files

import fs from 'fs';
import path from 'path';
import os from 'os';
import { debug, warn } from './logger.js';

/**
 * Create a temporary file path with a recognizable prefix
 * 
 * @param {string} prefix - Prefix for the temp file (e.g., "cardbey-")
 * @param {string} extension - File extension (e.g., ".mp4")
 * @returns {string} Full path to temp file
 */
export function createTempPath(prefix = 'cardbey-', extension = '') {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}${timestamp}-${random}${extension}`;
  return path.join(tempDir, filename);
}

/**
 * Safely delete a temporary file
 * Ignores ENOENT (file not found) errors, logs others
 * 
 * @param {string} filePath - Path to file to delete
 * @param {string} component - Component name for logging (default: "OPTIMIZER")
 * @returns {Promise<boolean>} True if deleted successfully or didn't exist, false on error
 */
export async function safeUnlink(filePath, component = 'OPTIMIZER') {
  if (!filePath) {
    return true; // Nothing to delete
  }
  
  try {
    await fs.promises.unlink(filePath);
    debug(component, 'Temp file deleted', { filePath });
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist - that's fine, already cleaned up
      return true;
    }
    
    // Other error - log it
    warn(component, 'Failed to delete temp file', {
      filePath,
      errorMessage: err.message,
      errorCode: err.code,
    });
    return false;
  }
}

/**
 * Clean up multiple temp files
 * 
 * @param {string[]} filePaths - Array of file paths to delete
 * @param {string} component - Component name for logging
 * @returns {Promise<{deleted: number, failed: number}>} Cleanup results
 */
export async function cleanupTempFiles(filePaths, component = 'OPTIMIZER') {
  if (!filePaths || filePaths.length === 0) {
    return { deleted: 0, failed: 0 };
  }
  
  const results = await Promise.all(
    filePaths.map(path => safeUnlink(path, component))
  );
  
  const deleted = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;
  
  if (deleted > 0) {
    debug(component, 'Temp files cleaned', {
      deleted,
      failed,
      filePaths: filePaths.slice(0, 5), // Log first 5 for debugging
    });
  }
  
  return { deleted, failed };
}



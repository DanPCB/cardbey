/**
 * Upload Menu Crop Helper
 * Uploads cropped image buffers directly to media system
 * Reuses existing upload infrastructure without HTTP calls
 */

import { PrismaClient } from '@prisma/client';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';

// Lazy load sharp
let sharp = null;

async function getSharp() {
  if (sharp) return sharp;
  
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    console.warn('[Upload Crop] Failed to load sharp:', error.message);
    return null;
  }
}

const prisma = new PrismaClient();

// Debug logging helper
const DEBUG_CROP = process.env.DEBUG_MENU_CROP === 'true' || process.env.DEBUG_MENU_CROP === '1';

function debugLog(...args) {
  if (DEBUG_CROP) {
    console.log('[Upload Crop]', ...args);
  }
}

/**
 * Upload a cropped image buffer to media system
 * @param {Object} params - Parameters
 * @param {Buffer} params.buffer - Image buffer
 * @param {string} params.filename - Filename for storage
 * @param {string} params.storeId - Store ID
 * @param {string} params.extractionId - Extraction ID (for naming)
 * @param {number} params.index - Crop index
 * @param {Object} [params.req] - Express request object (for URL resolution)
 * @returns {Promise<Object>} { id, url, width, height }
 */
export async function uploadCropImage({
  buffer,
  filename,
  storeId,
  extractionId,
  index,
  req = null,
}) {
  try {
    // Generate filename if not provided
    const finalFilename = filename || `menu-crop-${storeId}-${extractionId}-${index}.jpg`;

    // Upload to S3 (or local storage)
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, finalFilename, 'image/jpeg');

    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);

    // Extract image dimensions using sharp
    const sharp = await getSharp();
    let width = null;
    let height = null;

    if (sharp) {
      try {
        const metadata = await sharp(buffer).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch (err) {
        debugLog('Failed to extract metadata:', err.message);
      }
    }

    // Create media record
    const media = await prisma.media.create({
      data: {
        url: normalizedUrl,
        storageKey: key,
        kind: 'IMAGE',
        mime: 'image/jpeg',
        width,
        height,
        sizeBytes: buffer.length,
      },
    });

    debugLog(`Uploaded crop ${index}:`, {
      mediaId: media.id,
      url: normalizedUrl,
      width,
      height,
      sizeBytes: buffer.length,
    });

    return {
      id: media.id,
      url: normalizedUrl,
      width,
      height,
    };
  } catch (error) {
    debugLog('Error uploading crop:', error.message);
    throw new Error(`Failed to upload crop image: ${error.message}`);
  }
}


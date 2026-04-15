/**
 * Menu Photo Extract Service
 * Extracts individual dish photos from menu images using SAM-3 segmentation
 * 
 * This service:
 * 1. Loads a menu image (from Media asset)
 * 2. Uses SAM-3 to segment and detect individual dishes
 * 3. Crops each detected region
 * 4. Optionally enhances crops (food photo retouch)
 * 5. Returns candidate dish photos with suggested metadata
 * 
 * @typedef {Object} MenuPhotoExtractRequest
 * @property {string} storeId - Store/Business ID
 * @property {string} sourceAssetId - Media asset ID of the menu photo
 * @property {Object} [options] - Optional configuration
 * @property {boolean} [options.enhance] - Whether to enhance crops (default: false)
 * 
 * @typedef {Object} MenuPhotoCandidate
 * @property {string} id - Candidate ID (e.g., "cand_1")
 * @property {string} cropAssetId - Media asset ID of the cropped image
 * @property {string} previewUrl - Preview URL for the crop
 * @property {string} nameGuess - Suggested dish name (from OCR/LLM)
 * @property {number|null} priceGuess - Suggested price (from OCR/LLM, in cents)
 * @property {number} confidence - Confidence score (0-1)
 * @property {Object} box - Bounding box { x, y, width, height }
 * 
 * @typedef {Object} MenuPhotoExtractResponse
 * @property {string} taskId - Task identifier
 * @property {string} storeId - Store/Business ID
 * @property {string} sourceAssetId - Source media asset ID
 * @property {MenuPhotoCandidate[]} candidates - Array of candidate dish photos
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { runSam3Inference } from './sam3DesignTaskService.js';
import { uploadBufferToS3 } from '../../lib/s3Client.js';
import { normalizeMediaUrlForStorage, buildMediaUrl } from '../../utils/publicUrl.js';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

// Lazy load sharp to avoid startup crashes
let sharp = null;
async function getSharp() {
  if (sharp) return sharp;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    logger.warn('[MenuPhotoExtract] Failed to load sharp:', error.message);
    return null;
  }
}

const prisma = new PrismaClient();

/**
 * Segment menu image using SAM-3
 * Detects individual dish regions in a menu photo
 * 
 * @param {Buffer|string} imageInput - Image buffer or URL
 * @returns {Promise<Array>} Array of detected regions with masks and boxes
 */
async function segmentMenuImage(imageInput) {
  try {
    // Use SAM-3 with a prompt optimized for menu/dish detection
    const prompt = 'individual dishes, food items, menu items, separate plates, distinct food products';
    
    logger.info('[MenuPhotoExtract] Running SAM-3 segmentation for menu', {
      prompt: prompt.substring(0, 50),
    });
    
    const sam3Result = await runSam3Inference(imageInput, prompt, {
      device: process.env.SAM3_DEVICE || 'cpu',
      modelPath: process.env.SAM3_MODEL_PATH || null,
      timeout: 60000,
    });
    
    // Filter regions by score (only high-confidence detections)
    const regions = (sam3Result.regions || []).filter(r => r.score > 0.7);
    
    logger.info('[MenuPhotoExtract] SAM-3 segmentation complete', {
      totalRegions: sam3Result.regions?.length || 0,
      highConfidenceRegions: regions.length,
      scores: regions.map(r => r.score).slice(0, 5),
    });
    
    return regions;
  } catch (error) {
    logger.error('[MenuPhotoExtract] SAM-3 segmentation error', {
      error: error.message,
      stack: error.stack,
    });
    
    // Fallback: return stub regions for development
    logger.warn('[MenuPhotoExtract] Using stub regions (SAM-3 not available)', {
      message: 'TODO: Implement real SAM-3 integration',
    });
    
    // Return 3-5 fake regions for development
    return [
      { id: 'stub-1', box: { x: 50, y: 50, width: 200, height: 200 }, score: 0.9, mask: null },
      { id: 'stub-2', box: { x: 300, y: 50, width: 200, height: 200 }, score: 0.85, mask: null },
      { id: 'stub-3', box: { x: 550, y: 50, width: 200, height: 200 }, score: 0.8, mask: null },
    ];
  }
}

/**
 * Crop image region
 * Extracts a specific region from the original image
 * 
 * @param {Buffer} originalImage - Original image buffer
 * @param {Object} box - Bounding box { x, y, width, height }
 * @param {Object} mask - Optional mask data for precise cropping
 * @returns {Promise<Buffer>} Cropped image buffer
 */
async function cropImageRegion(originalImage, box, mask = null) {
  try {
    const sharpLib = await getSharp();
    if (!sharpLib) {
      throw new Error('Sharp is not available for image processing');
    }
    const image = sharpLib(originalImage);
    
    // Add padding (10% of dimensions)
    const paddingX = Math.floor(box.width * 0.1);
    const paddingY = Math.floor(box.height * 0.1);
    
    const cropX = Math.max(0, box.x - paddingX);
    const cropY = Math.max(0, box.y - paddingY);
    const cropWidth = box.width + (paddingX * 2);
    const cropHeight = box.height + (paddingY * 2);
    
    // Get image metadata to ensure we don't crop outside bounds
    const metadata = await image.metadata();
    const maxWidth = metadata.width || 0;
    const maxHeight = metadata.height || 0;
    
    const finalX = Math.min(cropX, maxWidth - 1);
    const finalY = Math.min(cropY, maxHeight - 1);
    const finalWidth = Math.min(cropWidth, maxWidth - finalX);
    const finalHeight = Math.min(cropHeight, maxHeight - finalY);
    
    // Crop the image
    const cropped = await image
      .extract({
        left: finalX,
        top: finalY,
        width: finalWidth,
        height: finalHeight,
      })
      .png()
      .toBuffer();
    
    logger.info('[MenuPhotoExtract] Image region cropped', {
      originalBox: box,
      finalCrop: { x: finalX, y: finalY, width: finalWidth, height: finalHeight },
      croppedSize: cropped.length,
    });
    
    return cropped;
  } catch (error) {
    logger.error('[MenuPhotoExtract] Crop error', {
      error: error.message,
      box,
    });
    throw error;
  }
}

/**
 * Enhance food photo (stub for now)
 * Applies food photo retouching/enhancement
 * 
 * @param {Buffer} cropBuffer - Cropped image buffer
 * @returns {Promise<Buffer>} Enhanced image buffer
 */
async function enhanceFoodPhoto(cropBuffer) {
  // TODO: Implement food photo enhancement
  // For now, just return the original
  logger.info('[MenuPhotoExtract] Food photo enhancement (stub)', {
    message: 'TODO: Implement food photo retouching/enhancement',
  });
  
  return cropBuffer;
}

/**
 * Extract name and price from region using OCR + LLM (stub for now)
 * 
 * @param {Buffer} cropBuffer - Cropped image buffer
 * @param {Object} region - Region metadata
 * @returns {Promise<Object>} { nameGuess, priceGuess, confidence }
 */
async function extractMetadataFromRegion(cropBuffer, region) {
  // TODO: Implement OCR + LLM extraction
  // For now, return placeholder data
  logger.info('[MenuPhotoExtract] Metadata extraction (stub)', {
    message: 'TODO: Implement OCR + LLM for name/price extraction',
  });
  
  return {
    nameGuess: `Dish ${region.id?.replace('stub-', '') || 'Unknown'}`,
    priceGuess: null,
    confidence: 0.5,
  };
}

/**
 * Save crop as Media asset
 * 
 * @param {Buffer} cropBuffer - Cropped image buffer
 * @param {Object} req - Express request object (for URL resolution)
 * @returns {Promise<Object>} { id, url, previewUrl }
 */
async function saveCropAsAsset(cropBuffer, req) {
  try {
    // Upload to S3 or local storage
    const random = randomBytes(4).toString('hex');
    const filename = `menu-crop-${Date.now()}-${random}.png`;
    const { key, url: storageUrl } = await uploadBufferToS3(cropBuffer, filename, 'image/png');
    
    // Normalize URL
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, req);
    
    // Get image dimensions
    const sharpLib = await getSharp();
    if (!sharpLib) {
      throw new Error('Sharp is not available for image processing');
    }
    const metadata = await sharpLib(cropBuffer).metadata();
    
    // Create Media record
    const media = await prisma.media.create({
      data: {
        url: normalizedUrl,
        storageKey: key,
        kind: 'IMAGE',
        mime: 'image/png',
        width: metadata.width || null,
        height: metadata.height || null,
        sizeBytes: cropBuffer.length,
      },
    });
    
    // Build preview URL
    const previewUrl = buildMediaUrl(normalizedUrl, req);
    
    logger.info('[MenuPhotoExtract] Crop saved as asset', {
      assetId: media.id,
      url: normalizedUrl,
      previewUrl,
    });
    
    return {
      id: media.id,
      url: normalizedUrl,
      previewUrl,
    };
  } catch (error) {
    logger.error('[MenuPhotoExtract] Failed to save crop as asset', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process menu photo extraction
 * 
 * @param {Object} input - Service input
 * @param {string} input.storeId - Store/Business ID
 * @param {string} input.sourceAssetId - Media asset ID of the menu photo
 * @param {Object} [input.options] - Options
 * @param {boolean} [input.options.enhance] - Whether to enhance crops (default: false)
 * @param {Object} [req] - Express request object (for URL resolution)
 * @returns {Promise<Object>} MenuPhotoExtractResult
 */
export async function runMenuPhotoExtract(input, req = null) {
  const { storeId, sourceAssetId, options = {} } = input;
  const { enhance = false } = options;
  
  const taskId = `menu-extract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  logger.info('[MenuPhotoExtract] Starting', {
    taskId,
    storeId,
    sourceAssetId,
    enhance,
  });
  
  try {
    // 1. Load source asset
    const sourceAsset = await prisma.media.findUnique({
      where: { id: sourceAssetId },
      select: {
        id: true,
        url: true,
        storageKey: true,
        width: true,
        height: true,
      },
    });
    
    if (!sourceAsset) {
      throw new Error(`Source asset not found: ${sourceAssetId}`);
    }
    
    logger.info('[MenuPhotoExtract] Source asset loaded', {
      assetId: sourceAsset.id,
      url: sourceAsset.url.substring(0, 50),
    });
    
    // 2. Load image buffer
    let imageBuffer;
    if (sourceAsset.url.startsWith('http://') || sourceAsset.url.startsWith('https://')) {
      const response = await fetch(sourceAsset.url);
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Local file path
      const fs = await import('fs/promises');
      imageBuffer = await fs.readFile(sourceAsset.storageKey || sourceAsset.url);
    }
    
    // 3. Segment menu image using SAM-3
    const regions = await segmentMenuImage(imageBuffer);
    
    if (regions.length === 0) {
      logger.warn('[MenuPhotoExtract] No regions detected', {
        taskId,
      });
      
      return {
        taskId,
        storeId,
        sourceAssetId,
        candidates: [],
      };
    }
    
    // 4. Process each region
    const candidates = [];
    
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      
      try {
        // Crop the region
        const cropBuffer = await cropImageRegion(imageBuffer, region.box, region.mask);
        
        // Enhance if requested
        const finalBuffer = enhance ? await enhanceFoodPhoto(cropBuffer) : cropBuffer;
        
        // Save as Media asset
        const asset = await saveCropAsAsset(finalBuffer, req);
        
        // Extract metadata (name, price)
        const metadata = await extractMetadataFromRegion(finalBuffer, region);
        
        candidates.push({
          id: `cand_${i + 1}`,
          cropAssetId: asset.id,
          previewUrl: asset.previewUrl,
          nameGuess: metadata.nameGuess,
          priceGuess: metadata.priceGuess,
          confidence: region.score || metadata.confidence,
          box: region.box,
        });
        
        logger.info('[MenuPhotoExtract] Candidate processed', {
          candidateId: candidates[candidates.length - 1].id,
          assetId: asset.id,
          confidence: region.score,
        });
      } catch (error) {
        logger.error('[MenuPhotoExtract] Failed to process region', {
          regionIndex: i,
          error: error.message,
        });
        // Continue with other regions
      }
    }
    
    logger.info('[MenuPhotoExtract] Complete', {
      taskId,
      candidateCount: candidates.length,
    });
    
    return {
      taskId,
      storeId,
      sourceAssetId,
      candidates,
    };
  } catch (error) {
    logger.error('[MenuPhotoExtract] Error', {
      error: error.message,
      stack: error.stack,
      taskId,
      storeId,
      sourceAssetId,
    });
    
    throw error;
  }
}


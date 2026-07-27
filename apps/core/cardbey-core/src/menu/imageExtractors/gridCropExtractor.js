/**
 * Grid Crop Menu Image Extractor
 * Extracts individual item images from grid-style menu photos
 * 
 * Feature-flagged: FEATURE_MENU_GRID_CROP_IMAGES
 */

import fetch from 'node-fetch';

// Lazy load sharp (same pattern as upload.js)
let sharp = null;

async function getSharp() {
  if (sharp) return sharp;
  
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
    return sharp;
  } catch (error) {
    console.warn('[Grid Crop] Failed to load sharp:', error.message);
    return null;
  }
}

// Debug logging helper (gated by environment variable)
const DEBUG_CROP = process.env.DEBUG_MENU_CROP === 'true' || process.env.DEBUG_MENU_CROP === '1';

function debugLog(...args) {
  if (DEBUG_CROP) {
    console.log('[Grid Crop Extractor]', ...args);
  }
}

/**
 * Download image from URL (supports private URLs)
 * @param {string} imageUrl - Image URL (can be private/local)
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(imageUrl) {
  debugLog('Downloading image:', imageUrl);
  
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Cardbey-GridCrop/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    debugLog('Error downloading image:', error.message);
    throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`);
  }
}

/**
 * Crop menu images from a grid-style menu photo
 * @param {Object} params - Parameters
 * @param {string} params.imageUrl - Source menu image URL
 * @param {number} [params.cols=4] - Number of columns in grid
 * @param {number} [params.rows=3] - Number of rows in grid
 * @param {number} [params.photoRatio=0.62] - Ratio of photo height to tile height
 * @param {number} [params.padPx=6] - Padding pixels around each tile
 * @param {boolean} [params.removeOverlay=true] - Remove overlay icons (V/+ icons)
 * @returns {Promise<Object>} { ok: true, crops: Array<{ index, buffer, mime, debug }> }
 */
export async function gridCropMenuImages({
  imageUrl,
  cols = 4,
  rows = 3,
  photoRatio = 0.62,
  padPx = 6,
  removeOverlay = true,
}) {
  debugLog('Starting grid crop', {
    imageUrl,
    cols,
    rows,
    photoRatio,
    padPx,
    removeOverlay,
  });

  try {
    // Download image
    const imageBuffer = await downloadImage(imageUrl);

    // Get sharp instance
    const sharp = await getSharp();
    if (!sharp) {
      throw new Error('Sharp not available - cannot process images');
    }

    // Read image metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;

    debugLog('Image dimensions:', { width, height });

    if (!width || !height) {
      throw new Error('Could not determine image dimensions');
    }

    // Calculate tile dimensions
    const tileW = Math.round(width / cols);
    const tileH = Math.round(height / rows);

    debugLog('Tile dimensions:', { tileW, tileH });

    const crops = [];

    // Process each grid cell (row-major order: left-to-right, top-to-bottom)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const index = r * cols + c;

        // Calculate tile box
        const tileLeft = Math.round(c * tileW) + padPx;
        const tileTop = Math.round(r * tileH) + padPx;
        const tileWidth = Math.round(tileW) - 2 * padPx;
        const tileHeight = Math.round(tileH) - 2 * padPx;

        // Calculate photo crop box inside tile
        const photoH = Math.round(tileHeight * photoRatio);
        let cropLeft = 0;
        let cropTop = 0;
        let cropW = tileWidth;
        let cropH = photoH;

        // Remove overlay (top-right corner where V/+ icons are)
        if (removeOverlay) {
          const overlayTrimW = Math.round(cropW * 0.12);
          // Reduce crop width to exclude overlay area
          cropW = cropW - overlayTrimW;
        }

        // Final photo box (relative to tile)
        const photoBox = {
          left: cropLeft,
          top: cropTop,
          width: cropW,
          height: cropH,
        };

        // Absolute coordinates for extraction
        const extractLeft = tileLeft + cropLeft;
        const extractTop = tileTop + cropTop;
        const extractWidth = cropW;
        const extractHeight = cropH;

        // Log first 1-2 crops for debugging
        if (index < 2) {
          debugLog(`Crop ${index} (row ${r}, col ${c}):`, {
            tileBox: { left: tileLeft, top: tileTop, width: tileWidth, height: tileHeight },
            photoBox,
            extractBox: { left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight },
          });
        }

        // Extract and process crop
        const cropBuffer = await image
          .clone()
          .extract({
            left: extractLeft,
            top: extractTop,
            width: extractWidth,
            height: extractHeight,
          })
          .resize(512, 512, {
            fit: 'cover', // Maintain aspect ratio, crop to fit
            withoutEnlargement: true, // Don't upscale small images
          })
          .jpeg({
            quality: 82,
            mozjpeg: true, // Better compression
          })
          .toBuffer();

        crops.push({
          index,
          buffer: cropBuffer,
          mime: 'image/jpeg',
          debug: {
            tileBox: {
              left: tileLeft,
              top: tileTop,
              width: tileWidth,
              height: tileHeight,
            },
            photoBox,
            row: r,
            col: c,
          },
        });
      }
    }

    debugLog(`Generated ${crops.length} crops`);

    return {
      ok: true,
      crops,
    };
  } catch (error) {
    debugLog('Grid crop error:', error.message);
    throw error;
  }
}


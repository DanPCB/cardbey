/**
 * SAM-3 Design Task Service
 * Handles design tasks from Content Studio using SAM-3 orchestrator
 * Processes canvas state and user prompts to generate design improvements
 * 
 * Uses real SAM-3 (Meta's Segment Anything Model 3) via Python subprocess
 */

import { logger } from './logger.js';
import { spawn } from 'child_process';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { createTempPath, safeUnlink } from '../../lib/tempFiles.js';
import { broadcastSse } from '../../realtime/simpleSse.js';

// Support both SAM-2 and SAM-3 (SAM-2 takes priority if both are set)
const SAM2_MODEL_PATH = process.env.SAM2_MODEL_PATH || null;
const SAM3_MODEL_PATH = process.env.SAM3_MODEL_PATH || null;
const MODEL_PATH = SAM2_MODEL_PATH || SAM3_MODEL_PATH || null;
const MODEL_TYPE = SAM2_MODEL_PATH ? 'SAM-2' : (SAM3_MODEL_PATH ? 'SAM-3' : null);

const SAM2_DEVICE = process.env.SAM2_DEVICE || null;
const SAM3_DEVICE = process.env.SAM3_DEVICE || null;
const DEVICE = SAM2_DEVICE || SAM3_DEVICE || 'cpu';

const SAM3_TIMEOUT = parseInt(process.env.SAM3_TIMEOUT || '60000', 10); // 60 seconds default
const SAM3_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'sam3_inference.py');
const PYTHON_COMMAND = process.env.PYTHON_COMMAND || null; // Allow override via env var

/**
 * Detect Python executable command
 * Tries multiple methods to find Python, including common Windows paths
 * 
 * @returns {string} Python command ('python3', 'python', full path, or custom)
 */
function detectPythonCommand() {
  // Allow override via environment variable
  if (PYTHON_COMMAND) {
    return PYTHON_COMMAND;
  }
  
  const platform = os.platform();
  const userHome = os.homedir();
  
  // On Windows, try multiple methods
  if (platform === 'win32') {
    // Method 1: Try 'python' command (if in PATH)
    try {
      execSync('python --version', { stdio: 'ignore' });
      
      // Try to get full path using 'where'
      try {
        const whereOutput = execSync('where.exe python', { encoding: 'utf-8', stdio: 'pipe' });
        const paths = whereOutput.trim().split('\n').filter(p => p.trim());
        // Use the first non-WindowsApps path (WindowsApps is usually a stub)
        const realPath = paths.find(p => !p.includes('WindowsApps') && fsSync.existsSync(p));
        if (realPath) {
          return realPath.trim();
        }
      } catch (e) {
        // If 'where' fails, continue to other methods
      }
      
      return 'python';
    } catch (e) {
      // Continue to other methods
    }
    
    // Method 2: Try common Windows Python installation paths
    const commonPaths = [
      // User installation (most common)
      path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'python.exe'),
      path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
      // System-wide installation
      'C:\\Python314\\python.exe',
      'C:\\Python313\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
      // Program Files
      'C:\\Program Files\\Python314\\python.exe',
      'C:\\Program Files\\Python313\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files (x86)\\Python314\\python.exe',
      'C:\\Program Files (x86)\\Python313\\python.exe',
      'C:\\Program Files (x86)\\Python312\\python.exe',
    ];
    
    for (const pythonPath of commonPaths) {
      if (fsSync.existsSync(pythonPath)) {
        try {
          // Verify it's actually Python
          execSync(`"${pythonPath}" --version`, { stdio: 'ignore' });
          logger.info('[SAM3] Found Python at common path', { path: pythonPath });
          return pythonPath;
        } catch (e) {
          // Not a valid Python, continue
        }
      }
    }
    
    // Method 3: Try python3 as last resort
    try {
      execSync('python3 --version', { stdio: 'ignore' });
      return 'python3';
    } catch (e2) {
      // Neither found, return 'python' as default (will give better error)
      return 'python';
    }
  }
  
  // On Unix/Mac, try python3 first
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return 'python3';
  } catch (e) {
    // Fallback to python
    try {
      execSync('python --version', { stdio: 'ignore' });
      return 'python';
    } catch (e2) {
      // Neither found, return python3 as default
      return 'python3';
    }
  }
}

// Cache the Python command
const PYTHON_CMD = detectPythonCommand();

// Log Python detection on module load
let PYTHON_AVAILABLE = false;
try {
  // Quote the command if it's a full path (for Windows)
  const testCmd = PYTHON_CMD.includes(' ') || PYTHON_CMD.includes('\\') 
    ? `"${PYTHON_CMD}"` 
    : PYTHON_CMD;
  
  const pythonVersion = execSync(`${testCmd} --version`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  PYTHON_AVAILABLE = true;
  logger.info('[SAM3] ✅ Python detected and ready', {
    command: PYTHON_CMD,
    version: pythonVersion,
    platform: os.platform(),
    scriptPath: SAM3_SCRIPT_PATH,
  });
} catch (error) {
  PYTHON_AVAILABLE = false;
  const platform = os.platform();
  const userHome = os.homedir();
  
  // Check if Python exists at common paths but wasn't detected
  const commonPath = path.join(userHome, 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'python.exe');
  const pythonExists = fsSync.existsSync(commonPath);
  
  let installHint = '';
  if (platform === 'win32') {
    if (pythonExists) {
      installHint = `Python found at ${commonPath} but not accessible. Set PYTHON_COMMAND="${commonPath}" in .env file and restart server.`;
    } else {
      installHint = 'Install Python from python.org or Microsoft Store. See docs/PYTHON_INSTALLATION_WINDOWS.md';
    }
  } else {
    installHint = 'Install Python 3: sudo apt-get install python3 (Linux) or brew install python3 (Mac)';
  }
  
  logger.warn('[SAM3] ⚠️  Python not accessible', {
    command: PYTHON_CMD,
    error: error.message,
    platform,
    pythonExistsAtCommonPath: pythonExists,
    commonPath: pythonExists ? commonPath : 'not found',
    installHint,
    envVarHint: `Set PYTHON_COMMAND="${commonPath}" in .env file and restart server`,
  });
}

/**
 * Run SAM-3 inference via Python subprocess
 * 
 * @param {Buffer|string} imageInput - Image buffer or file path
 * @param {string} prompt - Text prompt for segmentation
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} SAM-3 inference result with masks, boxes, scores
 */
export async function runSam3Inference(imageInput, prompt = '', options = {}) {
  const { device = DEVICE, modelPath = MODEL_PATH, timeout = SAM3_TIMEOUT } = options;
  
  // Check Python availability first
  if (!PYTHON_AVAILABLE) {
    const platform = os.platform();
    let installHint = '';
    
    if (platform === 'win32') {
      installHint = 'Install Python from python.org or Microsoft Store. See docs/PYTHON_INSTALLATION_WINDOWS.md for instructions.';
    } else {
      installHint = 'Install Python 3: sudo apt-get install python3 (Linux) or brew install python3 (Mac)';
    }
    
    throw new Error(`Python is not installed or not found in PATH. ${installHint} Alternatively, set PYTHON_COMMAND environment variable to specify the Python executable path.`);
  }
  
  if (!modelPath) {
    throw new Error(`${MODEL_TYPE || 'SAM'} model path not configured. Set SAM2_MODEL_PATH or SAM3_MODEL_PATH in .env`);
  }
  
  let tempImagePath = null;
  let tempOutputPath = null;
  
  try {
    // Handle image input (buffer or path)
    if (Buffer.isBuffer(imageInput)) {
      // Write buffer to temp file
      tempImagePath = createTempPath('sam3-input-', '.png');
      await fs.writeFile(tempImagePath, imageInput);
    } else if (typeof imageInput === 'string') {
      // Assume it's a file path
      tempImagePath = imageInput;
    } else {
      throw new Error('Invalid image input: must be Buffer or file path string');
    }
    
    // Create temp output file for JSON results
    tempOutputPath = createTempPath('sam3-output-', '.json');
    
    // Build Python command
    // Ensure prompt is passed as a single argument even if it contains spaces
    const pythonArgs = [
      SAM3_SCRIPT_PATH,
      '--image', tempImagePath,
      '--prompt', (prompt || '').trim(), // Trim whitespace but keep as single arg
      '--device', device,
    ];
    
    if (modelPath) {
      pythonArgs.push('--model-path', modelPath);
    }
    
    logger.info('[SAM3] Running inference', {
      imagePath: tempImagePath,
      prompt: prompt?.substring(0, 50),
      device,
      modelPath: modelPath || 'default',
      pythonArgs: pythonArgs.map((arg, i) => i === 4 ? `"${arg}"` : arg).join(' '), // Log with quotes for debugging
    });
    
    // Run Python script with timeout
    // Note: When using spawn with array, Node.js handles quoting automatically
    // shell: false ensures arguments are passed correctly without shell interpretation
    const result = await new Promise((resolve, reject) => {
      const pythonProcess = spawn(PYTHON_CMD, pythonArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: false, // Don't use shell - let Node.js handle argument passing correctly
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeoutId = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        reject(new Error(`SAM-3 inference timeout after ${timeout}ms`));
      }, timeout);
      
      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          // Try to parse error message if it's JSON
          let errorMessage = stderr;
          try {
            // Check if stderr contains JSON error
            const jsonMatch = stderr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const errorObj = JSON.parse(jsonMatch[0]);
              if (errorObj.error === 'Python packages not installed') {
                errorMessage = `${errorObj.message}\n\nTo fix this, run:\n${errorObj.install_command}\n\nOr install all packages:\npip install torch torchvision pillow opencv-python numpy`;
              } else {
                errorMessage = errorObj.message || stderr;
              }
            }
          } catch (e) {
            // Not JSON, use original error
          }
          
          reject(new Error(`SAM-3 inference failed with code ${code}: ${errorMessage}`));
          return;
        }
        
        try {
          const output = JSON.parse(stdout);
          resolve(output);
        } catch (parseError) {
          reject(new Error(`Failed to parse SAM-3 output: ${parseError.message}. Output: ${stdout}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        const platform = os.platform();
        let errorMessage = `Failed to spawn Python process: ${error.message}`;
        
        if (error.code === 'ENOENT' || error.message.includes('not found')) {
          errorMessage = `Python not found. Tried command: "${PYTHON_CMD}". `;
          if (platform === 'win32') {
            errorMessage += 'On Windows, install Python from python.org or Microsoft Store. ';
            errorMessage += 'You can also set PYTHON_COMMAND environment variable to specify the Python executable path.';
          } else {
            errorMessage += 'Install Python 3 and ensure it is in your PATH. ';
            errorMessage += 'You can also set PYTHON_COMMAND environment variable to specify the Python executable path.';
          }
        }
        
        reject(new Error(errorMessage));
      });
    });
    
    logger.info('[SAM3] Inference complete', {
      regionCount: result.regions?.length || 0,
      hasError: !!result.error,
      imageWidth: result.image_width,
      imageHeight: result.image_height,
      topScores: result.regions?.map(r => r.score).sort((a, b) => b - a).slice(0, 5) || [],
      regions: result.regions?.map((r, i) => ({
        index: i,
        score: r.score,
        box: r.box,
        hasMask: !!r.mask,
      })).slice(0, 5) || [], // Log first 5 regions
    });
    
    return result;
    
  } catch (error) {
    logger.error('[SAM3] Inference error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    // Cleanup temp files (only if we created them)
    if (tempImagePath && Buffer.isBuffer(imageInput)) {
      await safeUnlink(tempImagePath, 'SAM3');
    }
    if (tempOutputPath) {
      await safeUnlink(tempOutputPath, 'SAM3');
    }
  }
}

/**
 * Disable grid overlay in canvas settings
 * Permanently removes the blue grid overlay from the canvas
 * 
 * @param {Object} settings - Existing canvas settings
 * @returns {Object} Settings with grid overlay disabled
 */
function disableGridOverlay(settings = {}) {
  return {
    ...settings,
    // Permanently disable grid overlay
    showGrid: false,
    gridVisible: false,
    gridEnabled: false,
    showGridOverlay: false,
    grid: false,
  };
}

/**
 * Generate Python code for image processing
 * Helper function for mode-specific image processing
 * 
 * @param {string} mode - Task mode
 * @param {string} prompt - User prompt
 * @returns {string} Python code snippet (if needed)
 */
function getImagePyCode(mode, prompt) {
  // Mode-specific prompt enhancements
  const modePrompts = {
    new_banner: `Create a new banner design. ${prompt}`,
    improve_layout: `Improve the layout and visual hierarchy. ${prompt}`,
    fix_copy: `Identify and fix text/copy issues. ${prompt}`,
    video_storyboard: `Generate video storyboard frames. ${prompt}`,
    product_cutout: 'main product only, ignore background, text, hands, reflections',
  };
  
  return modePrompts[mode] || prompt;
}

/**
 * Generate transparent PNG cutout from SAM-3 mask
 * 
 * @param {Buffer|string} originalImage - Original image buffer or path
 * @param {Object} maskData - Mask data from SAM-3 (base64 encoded or array)
 * @param {Object} box - Bounding box for cropping
 * @returns {Promise<Object>} Cutout data with buffer, data URL, and refined box
 */
async function generateTransparentCutout(originalImage, maskData, box) {
  try {
    // Dynamic import of sharp
    const sharp = (await import('sharp')).default;
    
    // Load original image
    let imageBuffer;
    if (Buffer.isBuffer(originalImage)) {
      imageBuffer = originalImage;
    } else if (typeof originalImage === 'string') {
      // Download if URL, or read if path
      if (originalImage.startsWith('http://') || originalImage.startsWith('https://')) {
        const response = await fetch(originalImage);
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        imageBuffer = await fs.readFile(originalImage);
      }
    } else {
      throw new Error('Invalid image input for cutout generation');
    }
    
    // Get image metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const width = metadata.width || box.width;
    const height = metadata.height || box.height;
    
    // Decode mask if base64
    let maskBuffer;
    let maskWidth = width;
    let maskHeight = height;
    
    if (typeof maskData === 'string') {
      // Assume base64
      maskBuffer = Buffer.from(maskData, 'base64');
    } else if (Buffer.isBuffer(maskData)) {
      maskBuffer = maskData;
    } else if (maskData?.data) {
      maskBuffer = Buffer.from(maskData.data, 'base64');
      maskWidth = maskData.width || width;
      maskHeight = maskData.height || height;
    } else {
      throw new Error('Invalid mask data format');
    }
    
    // Process mask: resize to image dimensions and convert to greyscale
    logger.info('[SAM3] Processing mask', {
      imageSize: { width, height },
      maskSize: { width: maskWidth, height: maskHeight },
      maskBufferSize: maskBuffer.length,
    });
    
    let processedMask;
    try {
      // Try to process mask as image first
      processedMask = await sharp(maskBuffer, { 
        raw: { 
          width: maskWidth, 
          height: maskHeight, 
          channels: 1 
        } 
      })
        .resize(width, height, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();
      
      logger.info('[SAM3] Mask processed successfully with Sharp', {
        processedSize: processedMask.length,
        expectedSize: width * height,
      });
    } catch (error) {
      // If that fails, try treating it as a raw buffer
      logger.warn('[SAM3] Mask processing fallback', { 
        error: error.message,
        maskWidth,
        maskHeight,
        imageWidth: width,
        imageHeight: height,
      });
      // Create a simple mask from the buffer
      processedMask = Buffer.from(maskBuffer);
      if (processedMask.length !== width * height) {
        // Resize buffer by sampling
        const resized = Buffer.alloc(width * height);
        const scaleX = maskWidth / width;
        const scaleY = maskHeight / height;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcX = Math.floor(x * scaleX);
            const srcY = Math.floor(y * scaleY);
            const srcIdx = srcY * maskWidth + srcX;
            const dstIdx = y * width + x;
            resized[dstIdx] = srcIdx < processedMask.length ? processedMask[srcIdx] : 255;
          }
        }
        processedMask = resized;
        logger.info('[SAM3] Mask resized manually', {
          originalSize: maskBuffer.length,
          resizedSize: processedMask.length,
        });
      }
    }
    
    // Create RGBA image: RGB from original, Alpha from mask
    const rgb = await image.removeAlpha().raw().toBuffer();
    const alpha = processedMask;
    
    // Combine RGB + Alpha
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = rgb[i * 3];         // R
      rgba[i * 4 + 1] = rgb[i * 3 + 1]; // G
      rgba[i * 4 + 2] = rgb[i * 3 + 2]; // B
      rgba[i * 4 + 3] = alpha[i] || 0;  // A (from mask, default to 0 if missing)
    }
    
    // Create PNG with transparency
    const cutoutBuffer = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    
    // Generate data URL
    const cutoutDataUrl = `data:image/png;base64,${cutoutBuffer.toString('base64')}`;
    
    // Refine box: calculate tightest bounding box from mask
    // Find the actual bounds of non-transparent pixels
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;
    
    // Threshold for considering a pixel "opaque" (adjust if needed)
    const alphaThreshold = 10; // Pixels with alpha > 10 are considered part of the product
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alphaIdx = (y * width + x) * 4 + 3;
        const alpha = rgba[alphaIdx];
        
        if (alpha > alphaThreshold) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    // Add small padding (2% of dimensions) for better visual result
    const paddingX = Math.max(2, Math.floor(width * 0.02));
    const paddingY = Math.max(2, Math.floor(height * 0.02));
    
    const refinedBox = hasContent ? {
      x: Math.max(0, minX - paddingX),
      y: Math.max(0, minY - paddingY),
      width: Math.min(width, maxX - minX + paddingX * 2),
      height: Math.min(height, maxY - minY + paddingY * 2),
    } : {
      // Fallback to original box if no content found
      x: box.x || 0,
      y: box.y || 0,
      width: box.width || width,
      height: box.height || height,
    };
    
    logger.info('[SAM3] Refined bounding box calculated', {
      originalBox: { x: box.x || 0, y: box.y || 0, width: box.width || width, height: box.height || height },
      refinedBox,
      hasContent,
      reduction: {
        width: ((box.width || width) - refinedBox.width).toFixed(1),
        height: ((box.height || height) - refinedBox.height).toFixed(1),
      },
    });
    
    return {
      buffer: cutoutBuffer,
      dataUrl: cutoutDataUrl,
      refinedBox,
    };
    
  } catch (error) {
    logger.error('[SAM3] Cutout generation error', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Normalize canvas state to use 'elements' internally
 * Supports both 'nodes' and 'elements' formats
 * 
 * @param {Object} canvasState - Canvas state (may have 'nodes' or 'elements')
 * @returns {Object} Normalized canvas state with 'elements'
 */
function normalizeCanvasState(canvasState) {
  if (!canvasState) return null;
  
  // Support both 'nodes' and 'elements' formats
  const elements = canvasState.nodes || canvasState.elements || [];
  
  return {
    ...canvasState,
    elements,
    // Keep nodes if it exists for backward compatibility
    nodes: canvasState.nodes || elements,
  };
}

/**
 * Convert canvas state back to response format (use 'nodes' if original had it)
 * 
 * @param {Object} canvasState - Canvas state with 'elements'
 * @param {Object} originalState - Original canvas state to check format
 * @returns {Object} Canvas state in response format
 */
function formatCanvasResponse(canvasState, originalState) {
  if (!canvasState) return null;
  
  // If original used 'nodes', return 'nodes'; otherwise return 'elements'
  const useNodes = originalState && 'nodes' in originalState;
  
  if (useNodes) {
    return {
      ...canvasState,
      nodes: canvasState.elements || canvasState.nodes || [],
      // Remove elements to avoid duplication
      elements: undefined,
    };
  }
  
  return canvasState;
}

/**
 * Arrange elements based on SAM-3 segmentation results
 * 
 * @param {Object} canvasState - Current canvas state
 * @param {Object} sam3Result - SAM-3 inference result
 * @param {string} mode - Task mode
 * @returns {Object} Updated canvas state
 */
function arrangeElements(canvasState, sam3Result, mode) {
  if (!canvasState || !sam3Result?.regions || sam3Result.regions.length === 0) {
    return canvasState;
  }
  
  const regions = sam3Result.regions.filter(r => r.score > 0.7);
  // Support both 'nodes' and 'elements'
  const elements = canvasState.nodes || canvasState.elements || [];
  const updatedElements = [...elements];
  
  switch (mode) {
    case 'new_banner':
      // Use SAM-3 regions to suggest element placement
      regions.forEach((region, idx) => {
        if (idx < 3) { // Limit to top 3 regions
          updatedElements.push({
            id: `sam3-suggested-${Date.now()}-${idx}`,
            type: 'text',
            text: 'New Element',
            x: region.box.x,
            y: region.box.y,
            width: region.box.width,
            height: region.box.height,
            fontSize: Math.max(12, Math.min(region.box.height * 0.3, 48)),
            fill: '#000000',
            meta: {
              sam3Region: region.id,
              sam3Score: region.score,
            },
          });
        }
      });
      break;
      
    case 'improve_layout':
      // Adjust existing elements based on SAM-3 layout suggestions
      updatedElements.forEach((el, idx) => {
        if (regions[idx]) {
          const region = regions[idx];
          el.x = region.box.x;
          el.y = region.box.y;
          el.width = region.box.width;
          el.height = region.box.height;
          el.meta = {
            ...(el.meta || {}),
            layoutOptimized: true,
            sam3Region: region.id,
          };
        }
      });
      break;
      
    case 'fix_copy':
      // Use SAM-3 to identify text regions and suggest fixes
      regions.forEach((region) => {
        const textElements = updatedElements.filter(el => el.type === 'text');
        textElements.forEach((el) => {
          // Check if element overlaps with SAM-3 text region
          const overlap = checkOverlap(el, region.box);
          if (overlap > 0.5) {
            el.meta = {
              ...(el.meta || {}),
              copyReviewed: true,
              sam3Score: region.score,
            };
          }
        });
      });
      break;
      
    case 'video_storyboard':
      // Use SAM-3 regions to create storyboard scenes
      // This is handled separately in video storyboard generation
      break;
  }
  
  return {
    ...canvasState,
    elements: updatedElements,
    settings: disableGridOverlay(canvasState.settings),
  };
}

/**
 * Check overlap between element and box
 * 
 * @param {Object} element - Canvas element
 * @param {Object} box - Bounding box
 * @returns {number} Overlap ratio (0-1)
 */
function checkOverlap(element, box) {
  const elBox = {
    x: element.x || 0,
    y: element.y || 0,
    width: element.width || 0,
    height: element.height || 0,
  };
  
  const intersectionX = Math.max(0, Math.min(elBox.x + elBox.width, box.x + box.width) - Math.max(elBox.x, box.x));
  const intersectionY = Math.max(0, Math.min(elBox.y + elBox.height, box.y + box.height) - Math.max(elBox.y, box.y));
  const intersectionArea = intersectionX * intersectionY;
  const elementArea = elBox.width * elBox.height;
  
  return elementArea > 0 ? intersectionArea / elementArea : 0;
}

/**
 * Process design task from Content Studio
 * 
 * @param {Object} input - Service input
 * @param {string} input.entryPoint - Always "content_studio"
 * @param {string} input.mode - Task mode: "new_banner" | "improve_layout" | "fix_copy" | "video_storyboard"
 * @param {string} input.target - Target type: "image" | "layout" | "video"
 * @param {Object} [input.canvasState] - Current canvas JSON state
 * @param {Buffer} [input.canvasPngBuffer] - Canvas PNG buffer from frontend (canvasState.exportToPng())
 * @param {Object} [input.selection] - Selected element(s)
 * @param {string} input.userPrompt - User's design request
 * @param {Object} [ctx] - Execution context
 * @returns {Promise<Object>} Sam3DesignTaskResult format
 */
export async function runSam3DesignTask(input, ctx) {
  const { 
    entryPoint, 
    mode, 
    target, 
    canvasState, 
    canvasPngBuffer,
    selection, 
    userPrompt,
    imageUrl,
    imageBuffer,
    taskId: providedTaskId, // Allow taskId to be provided from frontend
  } = input;

  // Use provided taskId or generate a new one
  // This allows frontend to create task first, then use that taskId
  const taskId = providedTaskId || `sam3-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  logger.info('[Sam3DesignTaskService] Starting', {
    entryPoint,
    mode,
    target,
    taskId,
    hasCanvasState: !!canvasState,
    hasCanvasPngBuffer: !!canvasPngBuffer,
    hasSelection: !!selection,
    promptLength: userPrompt?.length || 0,
    canvasFormat: canvasState ? (canvasState.nodes ? 'nodes' : 'elements') : 'none',
  });

  try {
    // Validate mode
    const validModes = ['new_banner', 'improve_layout', 'fix_copy', 'video_storyboard', 'product_cutout'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
    }
    
    // Emit progress: Started
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'started',
      progress: 0,
      message: 'Starting SAM-3 processing...',
      mode,
      timestamp: Date.now(),
    });
    
    // Normalize canvas state (support both 'nodes' and 'elements')
    const normalizedCanvasState = normalizeCanvasState(canvasState);
    const originalCanvasState = canvasState; // Keep original for response formatting
    
    // Normalize selection (support both 'nodes' and 'elements' format)
    const normalizedSelection = selection ? (
      Array.isArray(selection) ? selection : [selection]
    ) : null;
    
    // Extract image URL from canvas state if available
    function extractImageUrlFromCanvas(canvasState) {
      if (!canvasState) return null;
      
      const elements = canvasState.nodes || canvasState.elements || [];
      
      logger.info('[Sam3DesignTaskService] Extracting image from canvas', {
        elementCount: elements.length,
        hasSettings: !!canvasState.settings,
      });
      
      // Look for image elements (check multiple possible types and properties)
      for (const element of elements) {
        const elementType = (element.type || element.kind || '').toLowerCase();
        
        // Check if it's an image element
        if (elementType === 'image' || elementType === 'img' || elementType === 'picture') {
          const imageUrl = element.src || 
                          element.url || 
                          element.imageUrl || 
                          element.imageSrc ||
                          element.image ||
                          element.href ||
                          element.data?.src ||
                          element.attrs?.src ||
                          element.props?.src;
          
          if (imageUrl) {
            logger.info('[Sam3DesignTaskService] Found image URL in element', {
              type: elementType,
              imageUrl: imageUrl.substring(0, 50),
            });
            return imageUrl;
          }
        }
        
        // Check for image data in element data/attrs/props
        if (element.data?.image || element.attrs?.image || element.props?.image) {
          const imageUrl = element.data?.image || element.attrs?.image || element.props?.image;
          if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
            logger.info('[Sam3DesignTaskService] Found image URL in element data', {
              imageUrl: imageUrl.substring(0, 50),
            });
            return imageUrl;
          }
        }
        
        // Check for base64 data URLs
        if (element.src && element.src.startsWith('data:image')) {
          logger.info('[Sam3DesignTaskService] Found data URL in element');
          return element.src;
        }
      }
      
      // Check canvas settings for background image
      if (canvasState.settings) {
        const bgImage = canvasState.settings.backgroundImage || 
                       canvasState.settings.background ||
                       canvasState.settings.bgImage ||
                       canvasState.settings.image;
        
        if (bgImage && typeof bgImage === 'string') {
          logger.info('[Sam3DesignTaskService] Found background image in settings', {
            imageUrl: bgImage.substring(0, 50),
          });
          return bgImage;
        }
      }
      
      // Check selection for image (use normalized selection)
      const selectionToCheck = normalizedSelection || (selection ? (Array.isArray(selection) ? selection : [selection]) : null);
      if (selectionToCheck && selectionToCheck.length > 0) {
        for (const selectedElement of selectionToCheck) {
          const imageUrl = selectedElement.src || 
                          selectedElement.url || 
                          selectedElement.imageUrl ||
                          selectedElement.imageSrc ||
                          selectedElement.image ||
                          selectedElement.href ||
                          selectedElement.data?.src ||
                          selectedElement.attrs?.src ||
                          selectedElement.props?.src;
          
          if (imageUrl && typeof imageUrl === 'string') {
            logger.info('[Sam3DesignTaskService] Found image URL in selection', {
              imageUrl: imageUrl.substring(0, 50),
            });
            return imageUrl;
          }
        }
      }
      
      logger.warn('[Sam3DesignTaskService] No image URL found in canvas state', {
        elementTypes: elements.map(el => el.type || el.kind || 'unknown'),
        elementKeys: elements.length > 0 ? Object.keys(elements[0]).slice(0, 10) : [],
        hasSettings: !!canvasState.settings,
        settingsKeys: canvasState.settings ? Object.keys(canvasState.settings).slice(0, 10) : [],
        selectionCount: selection ? (Array.isArray(selection) ? selection.length : 1) : 0,
        selectionKeys: selection && Array.isArray(selection) && selection.length > 0 ? Object.keys(selection[0]).slice(0, 10) : [],
      });
      
      return null;
    }
    
    // Auto-detect product_cutout mode from prompt
    const promptLower = (userPrompt || '').toLowerCase();
    const isBackgroundRemoval = promptLower.includes('remove background') || 
                                promptLower.includes('remove the background') ||
                                promptLower.includes('background removal') ||
                                promptLower.includes('cutout') ||
                                promptLower.includes('transparent background') ||
                                promptLower.includes('isolate') ||
                                promptLower.includes('extract');
    
    // Auto-switch to product_cutout mode if prompt suggests background removal
    let effectiveMode = mode;
    if (isBackgroundRemoval && mode !== 'product_cutout') {
      logger.info('[Sam3DesignTaskService] Auto-switching to product_cutout mode for background removal', {
        originalMode: mode,
        prompt: userPrompt?.substring(0, 50),
      });
      effectiveMode = 'product_cutout';
    }
    
    // Prepare image input for SAM-3
    let imageInput = null;
    let imageUrlForCutout = null;
    
    if (effectiveMode === 'product_cutout') {
      // For product_cutout or background removal, accept imageUrl, imageBuffer, or extract from canvas
      if (input.imageUrl) {
        imageUrlForCutout = input.imageUrl;
        // Download image to buffer for processing
        const response = await fetch(input.imageUrl);
        imageInput = Buffer.from(await response.arrayBuffer());
      } else if (input.imageBuffer && Buffer.isBuffer(input.imageBuffer)) {
        imageInput = input.imageBuffer;
      } else if (canvasPngBuffer && Buffer.isBuffer(canvasPngBuffer)) {
        imageInput = canvasPngBuffer;
        } else {
          // Try to extract image URL from canvas state or selection
          const extractedImageUrl = extractImageUrlFromCanvas(normalizedCanvasState);
          if (extractedImageUrl) {
            imageUrlForCutout = extractedImageUrl;
            try {
              // Handle data URLs differently
              if (extractedImageUrl.startsWith('data:image')) {
                // Extract base64 from data URL
                const base64Data = extractedImageUrl.split(',')[1];
                imageInput = Buffer.from(base64Data, 'base64');
                logger.info('[Sam3DesignTaskService] Extracted data URL from canvas state');
              } else {
                // Fetch HTTP/HTTPS URL
                const response = await fetch(extractedImageUrl);
                imageInput = Buffer.from(await response.arrayBuffer());
                logger.info('[Sam3DesignTaskService] Extracted image URL from canvas state', {
                  imageUrl: extractedImageUrl.substring(0, 50),
                });
              }
            } catch (fetchError) {
              logger.error('[Sam3DesignTaskService] Failed to fetch extracted image', {
                error: fetchError.message,
                imageUrl: extractedImageUrl.substring(0, 50),
              });
              throw new Error(`Failed to fetch image from canvas state: ${fetchError.message}. Please provide imageUrl or canvasPngBuffer.`);
            }
          } else {
          // Provide helpful error message with suggestions
          const hasCanvasState = !!normalizedCanvasState;
          const hasSelection = !!selection;
          const elementCount = normalizedCanvasState ? (normalizedCanvasState.nodes?.length || normalizedCanvasState.elements?.length || 0) : 0;
          
          logger.error('[Sam3DesignTaskService] No image source found for product_cutout', {
            hasCanvasState,
            hasSelection,
            elementCount,
            hasImageUrl: !!input.imageUrl,
            hasImageBuffer: !!input.imageBuffer,
            hasCanvasPngBuffer: !!canvasPngBuffer,
          });
          
          let errorMessage = 'product_cutout mode requires an image source. ';
          const suggestions = [];
          
          if (!input.imageUrl && !input.imageBuffer && !canvasPngBuffer) {
            suggestions.push('Provide imageUrl in the request body');
            suggestions.push('Provide imageBuffer (base64) in the request body');
            suggestions.push('Export canvas as PNG and provide canvasPngBuffer');
          }
          
          if (hasCanvasState && elementCount > 0) {
            suggestions.push('Ensure canvasState contains an image element with src/url/imageUrl property');
          }
          
          if (hasSelection) {
            suggestions.push('Ensure selection contains an image element with src/url/imageUrl property');
          }
          
          errorMessage += 'Options: ' + suggestions.join(', ') + '.';
          
          throw new Error(errorMessage);
        }
      }
    } else {
      // For other modes, use canvas buffer
      if (canvasPngBuffer && Buffer.isBuffer(canvasPngBuffer)) {
        imageInput = canvasPngBuffer;
      } else if (normalizedCanvasState) {
        // Try to extract image URL as fallback
        const extractedImageUrl = extractImageUrlFromCanvas(normalizedCanvasState);
        if (extractedImageUrl) {
          logger.warn('[Sam3DesignTaskService] Using extracted image URL as fallback for canvas mode', {
            mode,
            imageUrl: extractedImageUrl.substring(0, 50),
          });
          imageUrlForCutout = extractedImageUrl;
          const response = await fetch(extractedImageUrl);
          imageInput = Buffer.from(await response.arrayBuffer());
        } else {
          throw new Error('canvasPngBuffer is required for this mode. Please call canvasState.exportToPng() on the frontend, or use product_cutout mode with an imageUrl.');
        }
      } else {
        throw new Error('Either canvasState with canvasPngBuffer or image input is required');
      }
    }
    
    // Build mode-specific prompt (use effectiveMode)
    const enhancedPrompt = getImagePyCode(effectiveMode, userPrompt || '');
    
    // Emit progress: Processing
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'processing',
      progress: 30,
      message: 'Running SAM-3 inference...',
      mode: effectiveMode,
      timestamp: Date.now(),
    });
    
    // Run SAM-3 inference
    const sam3Result = await runSam3Inference(imageInput, enhancedPrompt, {
      device: DEVICE,
      modelPath: MODEL_PATH,
      timeout: SAM3_TIMEOUT,
    });
    
    // Emit progress: Inference complete
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'processing',
      progress: 60,
      message: 'SAM-3 inference complete. Processing results...',
      mode: effectiveMode,
      regionCount: sam3Result.regions?.length || 0,
      timestamp: Date.now(),
    });
    
    // Process results based on effectiveMode
    let result = {
      updatedCanvas: null,
      videoStoryboard: null,
      // reviewNotes removed - no longer showing right-side panel during generation
    };
    
    switch (effectiveMode) {
      case 'new_banner':
        result.updatedCanvas = formatCanvasResponse(
          arrangeElements(normalizedCanvasState, sam3Result, mode),
          originalCanvasState
        );
        break;
        
      case 'improve_layout':
        result.updatedCanvas = formatCanvasResponse(
          arrangeElements(normalizedCanvasState, sam3Result, mode),
          originalCanvasState
        );
        break;
        
      case 'fix_copy':
        result.updatedCanvas = formatCanvasResponse(
          arrangeElements(normalizedCanvasState, sam3Result, mode),
          originalCanvasState
        );
        break;
        
      case 'video_storyboard':
        // Generate video storyboard from SAM-3 regions
        const elements = normalizedCanvasState?.elements || normalizedCanvasState?.nodes || [];
        const scenes = (sam3Result.regions || []).slice(0, 5).map((region, idx) => ({
          id: `scene-${idx + 1}`,
          duration: 3,
          description: `Scene ${idx + 1} based on SAM-3 region ${region.id}`,
          elements: elements.slice(idx * 2, (idx + 1) * 2),
          region: {
            box: region.box,
            score: region.score,
          },
        }));
        
        result.updatedCanvas = normalizedCanvasState ? formatCanvasResponse({
          ...normalizedCanvasState,
          settings: disableGridOverlay(normalizedCanvasState.settings),
        }, originalCanvasState) : null;
        result.videoStoryboard = {
          scenes,
          totalDuration: scenes.reduce((sum, s) => sum + s.duration, 0),
        };
        break;
        
      case 'product_cutout':
        // Product cutout mode: generate transparent PNG
        const allRegions = sam3Result.regions || [];
        const regions = allRegions.filter(r => r.score > 0.85);
        
        logger.info('[SAM3] Product cutout processing', {
          totalRegions: allRegions.length,
          highQualityRegions: regions.length,
          scores: allRegions.map(r => r.score).sort((a, b) => b - a).slice(0, 5), // Top 5 scores
          threshold: 0.85,
        });
        
        if (regions.length === 0) {
          // Fallback: return original with warning
          const maxScore = allRegions.reduce((max, r) => Math.max(max, r.score || 0), 0);
          logger.warn('[SAM3] No high-quality mask found for product cutout', {
            totalRegions: allRegions.length,
            maxScore,
            allScores: allRegions.map(r => r.score),
            threshold: 0.85,
          });
          
          result.cutoutUrl = imageUrlForCutout || null;
          result.previewUrl = imageUrlForCutout || null;
          result.mask = null;
          result.refinedBox = null;
          result.warning = `No high-quality mask found (score > 0.85). Best score: ${maxScore.toFixed(3)}. Returning original image.`;
          
          // Still return canvas (unchanged) so frontend knows request completed
          if (normalizedCanvasState) {
            result.updatedCanvas = formatCanvasResponse(
              {
                ...normalizedCanvasState,
                settings: disableGridOverlay(normalizedCanvasState.settings),
              },
              originalCanvasState
            );
          }
        } else {
          // Use highest scoring mask
          const bestRegion = regions.reduce((best, r) => 
            (r.score || 0) > (best.score || 0) ? r : best
          );
          
          logger.info('[SAM3] Using best region for cutout', {
            score: bestRegion.score,
            box: bestRegion.box,
            regionIndex: regions.indexOf(bestRegion),
            totalCandidates: regions.length,
          });
          
          try {
            const cutout = await generateTransparentCutout(
              imageInput,
              bestRegion.mask,
              bestRegion.box
            );
            
            result.cutoutUrl = cutout.dataUrl;
            result.previewUrl = cutout.dataUrl; // Same for preview
            result.mask = bestRegion.mask;
            result.refinedBox = cutout.refinedBox;
            result.score = bestRegion.score;
            
            // Update canvas with the cutout image
            if (normalizedCanvasState) {
              const elements = normalizedCanvasState.elements || normalizedCanvasState.nodes || [];
              
              // Find the image element to update (use selection if available, otherwise first image)
              let imageElement = null;
              
              if (normalizedSelection && normalizedSelection.length > 0) {
                // Use selected element
                imageElement = normalizedSelection.find(el => {
                  const type = (el.type || el.kind || '').toLowerCase();
                  return type === 'image' || type === 'img' || type === 'picture';
                });
              }
              
              // If no selected image, find first image element
              if (!imageElement) {
                imageElement = elements.find(el => {
                  const type = (el.type || el.kind || '').toLowerCase();
                  return type === 'image' || type === 'img' || type === 'picture';
                });
              }
              
              if (imageElement) {
                // Update the image element with the cutout
                imageElement.src = cutout.dataUrl;
                imageElement.url = cutout.dataUrl;
                imageElement.imageUrl = cutout.dataUrl;
                
                // Remove background properties to show transparency
                delete imageElement.backgroundColor;
                delete imageElement.background;
                delete imageElement.fill;
                delete imageElement.bgColor;
                
                // Clear style background if it exists
                if (imageElement.style) {
                  if (typeof imageElement.style === 'object') {
                    delete imageElement.style.backgroundColor;
                    delete imageElement.style.background;
                    delete imageElement.style.backgroundImage;
                  } else if (typeof imageElement.style === 'string') {
                    // If style is a string, try to remove background properties
                    imageElement.style = imageElement.style
                      .replace(/background[^;]*;?/gi, '')
                      .replace(/background-color[^;]*;?/gi, '')
                      .trim();
                  }
                }
                
                // Update refined box if available
                if (cutout.refinedBox) {
                  imageElement.x = cutout.refinedBox.x;
                  imageElement.y = cutout.refinedBox.y;
                  imageElement.width = cutout.refinedBox.width;
                  imageElement.height = cutout.refinedBox.height;
                }
                
                // Add metadata to indicate this is a cutout
                imageElement.meta = {
                  ...(imageElement.meta || {}),
                  isCutout: true,
                  cutoutScore: bestRegion.score,
                  hasTransparency: true,
                };
                
                logger.info('[SAM3] Updated canvas element with cutout', {
                  elementId: imageElement.id,
                  hasRefinedBox: !!cutout.refinedBox,
                  backgroundCleared: true,
                });
              } else {
                logger.warn('[SAM3] No image element found in canvas to update with cutout');
              }
              
              // Return updated canvas
              result.updatedCanvas = formatCanvasResponse(
                {
                  ...normalizedCanvasState,
                  elements: normalizedCanvasState.elements || normalizedCanvasState.nodes || [],
                  settings: disableGridOverlay(normalizedCanvasState.settings),
                },
                originalCanvasState
              );
            }
            
            logger.info('[SAM3] Product cutout generated successfully', {
              score: bestRegion.score,
              originalBox: bestRegion.box,
              refinedBox: cutout.refinedBox,
              cutoutSize: cutout.buffer.length,
              dataUrlLength: cutout.dataUrl.length,
              canvasUpdated: !!result.updatedCanvas,
            });
            
            // Emit progress: Complete
            broadcastSse('admin', 'sam3.design_task.progress', {
              taskId,
              status: 'completed',
              progress: 100,
              message: 'Background removal complete!',
              mode: 'product_cutout',
              score: bestRegion.score,
              timestamp: Date.now(),
            });
          } catch (cutoutError) {
            logger.error('[SAM3] Cutout generation failed', {
              error: cutoutError.message,
              stack: cutoutError.stack,
              score: bestRegion.score,
              box: bestRegion.box,
            });
            
            // Fallback to original
            result.cutoutUrl = imageUrlForCutout || null;
            result.previewUrl = imageUrlForCutout || null;
            result.mask = null;
            result.refinedBox = null;
            result.warning = `Cutout generation failed: ${cutoutError.message}. Returning original image.`;
          }
        }
        break;
        
      default:
        result.updatedCanvas = normalizedCanvasState ? formatCanvasResponse({
          ...normalizedCanvasState,
          settings: disableGridOverlay(normalizedCanvasState.settings),
        }, originalCanvasState) : null;
    }
    
    logger.info('[Sam3DesignTaskService] Task complete', {
      taskId,
      mode,
      effectiveMode: effectiveMode !== mode ? effectiveMode : undefined,
      hasUpdatedCanvas: !!result.updatedCanvas,
      hasVideoStoryboard: !!result.videoStoryboard,
      sam3RegionCount: sam3Result.regions?.length || 0,
    });

    return {
      ok: true,
      taskId,
      result,
    };
    
  } catch (error) {
    logger.error('[Sam3DesignTaskService] Error', {
      error: error.message,
      stack: error.stack,
      mode,
      target,
      taskId,
    });

    // Emit progress: Error
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'error',
      progress: 0,
      message: `Error: ${error.message}`,
      mode,
      error: error.message,
      timestamp: Date.now(),
    });

    // Return error response instead of throwing
    return {
      ok: false,
      taskId: taskId || `sam3-error-${Date.now()}`,
      error: error.message,
      result: {
        updatedCanvas: canvasState ? formatCanvasResponse(normalizeCanvasState(canvasState), canvasState) : null,
        videoStoryboard: null,
        // reviewNotes removed - no longer showing right-side panel
      },
    };
  }
}

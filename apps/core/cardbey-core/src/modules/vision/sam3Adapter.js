/**
 * SAM-3 Segmentation Adapter
 * Real SAM-3 (Segment Anything Model 3) integration using Python subprocess
 * 
 * Supports both images and videos, with automatic detection
 */

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { createTempPath, safeUnlink } from '../../lib/tempFiles.js';

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
          console.log(`[SAM] Found Python at common path: ${pythonPath}`);
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
try {
  const pythonVersion = execSync(`${PYTHON_CMD} --version`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  console.log(`[SAM] Python detected: ${PYTHON_CMD} - ${pythonVersion}`);
} catch (error) {
  console.warn(`[SAM] Python detection warning: ${PYTHON_CMD} - ${error.message}`);
  console.warn(`[SAM] Set PYTHON_COMMAND environment variable to specify Python path`);
}

// Log SAM-2/SAM-3 status on module load
if (MODEL_PATH) {
  const modelExists = fsSync.existsSync(MODEL_PATH);
  const modelSize = modelExists ? (fsSync.statSync(MODEL_PATH).size / 1024 / 1024).toFixed(2) + ' MB' : 'NOT FOUND';
  
  console.log(`[SAM] ${MODEL_TYPE} Configuration:`, {
    model: MODEL_TYPE,
    path: MODEL_PATH,
    exists: modelExists,
    size: modelSize,
    device: DEVICE,
    status: modelExists ? '✅ Ready' : '❌ Model file not found',
  });
  
  if (!modelExists) {
    console.warn(`[SAM] ⚠️  Model file not found at: ${MODEL_PATH}`);
    console.warn(`[SAM] SAM-2/SAM-3 segmentation will be disabled until model is available`);
  }
} else {
  console.log('[SAM] SAM-2/SAM-3 not configured (SAM2_MODEL_PATH or SAM3_MODEL_PATH not set)');
  console.log('[SAM] Vision pipeline will use OCR-only mode');
}

/**
 * Run SAM-3 inference via Python subprocess
 * Reuses the same function style from sam3DesignTaskService.js
 * 
 * @param {string|Buffer} imagePathOrBuffer - Image file path or buffer
 * @param {string} [prompt] - Optional text prompt for segmentation
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isVideo] - Whether input is a video (default: auto-detect)
 * @returns {Promise<Object>} SAM-3 inference result with regions
 */
async function runSam3Inference(imagePathOrBuffer, prompt = '', options = {}) {
  const { device = DEVICE, modelPath = MODEL_PATH, timeout = SAM3_TIMEOUT, isVideo = false } = options;
  
  if (!modelPath) {
    throw new Error(`${MODEL_TYPE || 'SAM'} model path not configured. Set SAM2_MODEL_PATH or SAM3_MODEL_PATH in .env`);
  }
  
  let tempImagePath = null;
  
  try {
    // Handle image input (buffer or path)
    if (Buffer.isBuffer(imagePathOrBuffer)) {
      // Write buffer to temp file
      tempImagePath = createTempPath('sam3-vision-', '.png');
      await fs.writeFile(tempImagePath, imagePathOrBuffer);
    } else if (typeof imagePathOrBuffer === 'string') {
      // Check if it's a URL or file path
      if (imagePathOrBuffer.startsWith('http://') || imagePathOrBuffer.startsWith('https://')) {
        // Download image from URL
        const response = await fetch(imagePathOrBuffer);
        const buffer = Buffer.from(await response.arrayBuffer());
        tempImagePath = createTempPath('sam3-vision-', '.png');
        await fs.writeFile(tempImagePath, buffer);
      } else {
        // Assume it's a file path
        tempImagePath = imagePathOrBuffer;
      }
    } else {
      throw new Error('Invalid image input: must be Buffer, file path string, or URL string');
    }
    
    // Detect if input is video (by extension or isVideo flag)
    const isVideoFile = isVideo || 
      (typeof imagePathOrBuffer === 'string' && 
       /\.(mp4|avi|mov|mkv|webm)$/i.test(imagePathOrBuffer));
    
    if (isVideoFile) {
      // For videos, we'd need video-specific processing
      // For now, extract first frame and process as image
      console.log('[SAM3] Video detected, processing first frame only');
      // TODO: Implement video frame extraction
      // For now, fall through to image processing
    }
    
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
    
    console.log(`[${MODEL_TYPE || 'SAM'}] Running segmentation`, {
      imagePath: tempImagePath,
      prompt: prompt?.substring(0, 50),
      device,
      modelPath: modelPath?.substring(modelPath.length - 50), // Show last 50 chars
      isVideo: isVideoFile,
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
        reject(new Error(`SAM-3 segmentation timeout after ${timeout}ms`));
      }, timeout);
      
      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          reject(new Error(`SAM-3 segmentation failed with code ${code}: ${stderr}`));
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
    
    console.log(`[${MODEL_TYPE || 'SAM'}] Segmentation complete`, {
      regionCount: result.regions?.length || 0,
      hasError: !!result.error,
    });
    
    return result;
    
  } catch (error) {
    console.error(`[${MODEL_TYPE || 'SAM'}] Segmentation error`, {
      error: error.message,
      stack: error.stack,
    });
    // Return empty regions on failure so OCR still works
    return {
      regions: [],
      error: error.message,
    };
  } finally {
    // Cleanup temp files (only if we created them)
    if (tempImagePath && (Buffer.isBuffer(imagePathOrBuffer) || typeof imagePathOrBuffer === 'string' && imagePathOrBuffer.startsWith('http'))) {
      await safeUnlink(tempImagePath, 'SAM3');
    }
  }
}

/**
 * Run SAM-3 segmentation on an image
 * 
 * @param {Object} req - Segmentation request
 * @param {string} req.imageUrl - Image URL or file path
 * @param {string} req.purpose - Vision purpose (menu, loyalty, promo, etc.)
 * @param {Buffer} [req.imageBuffer] - Optional image buffer (alternative to imageUrl)
 * @param {boolean} [req.isVideo] - Whether input is a video
 * @returns {Promise<Object>} Segmentation result with detected regions
 */
export async function runSam3Segmentation(req) {
  const { imageUrl, purpose, imageBuffer, isVideo = false } = req;
  
  if (!MODEL_PATH) {
    console.warn(`[${MODEL_TYPE || 'SAM'}] Model not configured. Set SAM2_MODEL_PATH or SAM3_MODEL_PATH in .env`);
    return { regions: [] };
  }
  
  if (!imageUrl && !imageBuffer) {
    console.warn(`[${MODEL_TYPE || 'SAM'}] No image URL or buffer provided`);
    return { regions: [] };
  }
  
  try {
    // Build prompt based on purpose
    const purposePrompts = {
      menu: 'Identify menu items, prices, sections, and text',
      loyalty: 'Identify loyalty card elements, punch holes, and text',
      promo: 'Identify promotional elements, offers, and text',
    };
    
    const prompt = purposePrompts[purpose] || 'Identify all regions and text';
    
    // Run SAM-2/SAM-3 inference
    const sam3Result = await runSam3Inference(
      imageBuffer || imageUrl,
      prompt,
      {
        device: DEVICE,
        modelPath: MODEL_PATH,
        timeout: SAM3_TIMEOUT,
        isVideo,
      }
    );
    
    // Map SAM-3 results to Sam3Region format
    const regions = (sam3Result.regions || [])
      .filter(region => region.score > 0.7) // Filter low-confidence results
      .map((region, idx) => ({
        id: region.id || `region_${idx}`,
        label: region.label || 'unknown',
        bbox: {
          x: region.box?.x || 0,
          y: region.box?.y || 0,
          width: region.box?.width || 0,
          height: region.box?.height || 0,
        },
        text: region.text || null,
        confidence: region.score || 0.0,
        maskId: region.mask?.data ? `mask_${idx}` : null,
        meta: {
          ...region.meta,
          sam3Score: region.score,
          purpose,
        },
      }));
    
    console.log(`[${MODEL_TYPE || 'SAM'}] Segmentation result`, {
      purpose,
      regionCount: regions.length,
      imageUrl: imageUrl?.substring(0, 50),
    });
    
    return { regions };
    
  } catch (error) {
    console.error(`[${MODEL_TYPE || 'SAM'}] Segmentation failed, returning empty regions`, {
      error: error.message,
      purpose,
    });
    // Return empty regions on failure so OCR still works
    return { regions: [] };
  }
}

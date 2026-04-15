#!/usr/bin/env node
/**
 * Download SAM-3 Model from Hugging Face using Node.js
 * No Python required!
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_HUB_TOKEN || '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';

// Support both SAM-2 (public) and SAM-3 (requires access)
const USE_SAM2 = process.env.USE_SAM2 === 'true' || process.env.USE_SAM2 === '1';
const MODEL_REPO = USE_SAM2 ? 'merve/sam2-hiera-large' : 'facebook/sam3-hiera-large';
const MODEL_NAME = USE_SAM2 ? 'sam2' : 'sam3';
const OUTPUT_DIR = path.join(__dirname, '..', 'models', `${MODEL_NAME}_hiera_large`);
const MODEL_FILE = USE_SAM2 ? 'sam2_hiera_large.pt' : 'sam3_hiera_large.pt';

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✅ Created directory: ${OUTPUT_DIR}`);
}

/**
 * Download file from URL with progress
 */
function downloadFile(url, outputPath, token) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'cardbey-sam3-downloader/1.0'
      }
    };

    console.log(`📥 Downloading: ${path.basename(outputPath)}`);
    console.log(`   From: ${url.replace(/\/resolve\/.*$/, '/resolve/[hidden]')}`);
    
    protocol.get(url, options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, outputPath, token)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r   Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\n✅ Download complete!');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * List files in Hugging Face repository
 */
async function listFiles(repoId, token) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://huggingface.co/api/models/${repoId}/tree/main`;
    
    const options = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'cardbey-sam3-downloader/1.0'
      }
    };

    https.get(apiUrl, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const files = JSON.parse(data);
          resolve(files);
        } catch (err) {
          reject(new Error(`Failed to parse API response: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get file download URL from Hugging Face API
 */
async function getFileUrl(repoId, fileName, token) {
  try {
    console.log('   Listing repository files...');
    const files = await listFiles(repoId, token);
    
    if (Array.isArray(files)) {
      console.log(`   Found ${files.length} files in repository`);
      
      // Look for .pt files
      const ptFiles = files.filter(f => f.path && f.path.endsWith('.pt'));
      if (ptFiles.length > 0) {
        console.log(`   Found ${ptFiles.length} .pt file(s):`);
        ptFiles.forEach(f => console.log(`     - ${f.path}`));
        
        // Use the first .pt file or exact match
        const targetFile = ptFiles.find(f => f.path === fileName) || ptFiles[0];
        const actualFileName = targetFile.path;
        
        console.log(`   Using file: ${actualFileName}`);
        return `https://huggingface.co/${repoId}/resolve/main/${actualFileName}`;
      }
    }
    
    // Fallback: try direct download
    console.log(`   Trying direct download URL...`);
    return `https://huggingface.co/${repoId}/resolve/main/${fileName}`;
  } catch (err) {
    console.log(`   API error: ${err.message}, using direct download URL...`);
    return `https://huggingface.co/${repoId}/resolve/main/${fileName}`;
  }
}

/**
 * Main download function
 */
async function main() {
  console.log(`=== ${MODEL_NAME.toUpperCase()} Model Downloader ===\n`);
  console.log(`Model: ${USE_SAM2 ? 'SAM-2 (public, no access needed)' : 'SAM-3 (requires access approval)'}`);
  console.log(`Repository: ${MODEL_REPO}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const outputPath = path.join(OUTPUT_DIR, MODEL_FILE);

  // Check if file already exists
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    console.log(`⚠️  File already exists: ${outputPath}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Delete it first if you want to re-download.\n`);
    return;
  }

  try {
    console.log('🔍 Getting file URL from Hugging Face API...');
    const fileUrl = await getFileUrl(MODEL_REPO, MODEL_FILE, HUGGINGFACE_TOKEN);
    
    console.log(`✅ File URL obtained: ${fileUrl.replace(/token=[^&]+/, 'token=[hidden]')}\n`);
    
    // Update output filename if different
    const actualFileName = fileUrl.split('/').pop().split('?')[0];
    const finalOutputPath = path.join(OUTPUT_DIR, actualFileName);
    
    await downloadFile(fileUrl, finalOutputPath, HUGGINGFACE_TOKEN);
    
    // Verify download
    const stats = fs.statSync(finalOutputPath);
    console.log(`\n✅ Verification:`);
    console.log(`   File: ${finalOutputPath}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\n🎉 ${MODEL_NAME.toUpperCase()} model downloaded successfully!`);
    console.log(`\nNext steps:`);
    console.log(`1. Update .env file:`);
    if (USE_SAM2) {
      console.log(`   SAM2_MODEL_PATH=./models/sam2_hiera_large/${actualFileName}`);
      console.log(`   SAM2_DEVICE=cuda  # or 'cpu'`);
      console.log(`   # Note: Using SAM-2 (public). Upgrade to SAM-3 later if needed.`);
    } else {
      console.log(`   SAM3_MODEL_PATH=./models/sam3_hiera_large/${actualFileName}`);
      console.log(`   SAM3_DEVICE=cuda  # or 'cpu'`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      if (USE_SAM2) {
        console.error(`\n⚠️  SAM-2 repository not found. This is unexpected.`);
        console.error(`Try: https://huggingface.co/${MODEL_REPO}`);
      } else {
        console.error(`\n⚠️  Repository Access Required:`);
        console.error(`The SAM-3 model repository requires manual approval from Meta.`);
        console.error(`\nSteps to get access:`);
        console.error(`1. Go to: https://huggingface.co/${MODEL_REPO}`);
        console.error(`2. Click "Request access" button`);
        console.error(`3. Fill out the access request form`);
        console.error(`4. Wait for approval (usually 1-3 business days)`);
        console.error(`5. After approval, run this script again`);
        console.error(`\n💡 Alternative: Use SAM-2 (public, no access needed):`);
        console.error(`   $env:USE_SAM2="true"; node scripts/download-sam3-node.js`);
        console.error(`\nOr use Roboflow SAM-3 API (see docs/SAM3_SETUP.md)`);
      }
    } else {
      console.error(`\nTroubleshooting:`);
      console.error(`1. Verify your Hugging Face token is valid`);
      console.error(`2. Check that you have access to ${MODEL_REPO}`);
      console.error(`3. Ensure you have internet connection`);
      console.error(`4. Try manual download: https://huggingface.co/${MODEL_REPO}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);


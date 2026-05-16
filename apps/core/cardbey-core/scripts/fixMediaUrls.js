/**
 * Fix Media URLs Script
 * 
 * This script fixes malformed and outdated URLs in the database:
 * - Fixes "http/" -> "http://"
 * - Replaces old IP (192.168.1.9) with current base URL
 * - Converts absolute URLs to relative paths (optional)
 * 
 * Usage:
 *   node scripts/fixMediaUrls.js [--dry-run] [--convert-to-relative]
 * 
 * Options:
 *   --dry-run: Show what would be changed without updating the database
 *   --convert-to-relative: Convert absolute URLs to relative paths
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const OLD_HOST = '192.168.1.9:3001';
const NEW_BASE_URL = process.env.MEDIA_BASE_URL || 
                     process.env.PUBLIC_BASE_URL || 
                     process.env.PUBLIC_API_BASE_URL || 
                     'http://192.168.1.12:3001';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONVERT_TO_RELATIVE = args.includes('--convert-to-relative');

/**
 * Fix a single URL
 */
function fixUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }
  
  let fixed = url;
  
  // Fix malformed scheme: "http/" -> "http://"
  if (fixed.startsWith('http/')) {
    fixed = 'http://' + fixed.slice('http/'.length);
  }
  
  // Replace old IP with new base URL
  if (fixed.includes(OLD_HOST)) {
    const newHost = NEW_BASE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    fixed = fixed.replace(OLD_HOST, newHost);
  }
  
  // Optionally convert to relative path
  if (CONVERT_TO_RELATIVE && (fixed.startsWith('http://') || fixed.startsWith('https://'))) {
    try {
      const urlObj = new URL(fixed);
      const isLocalIP = urlObj.hostname.startsWith('192.168.') || 
                       urlObj.hostname.startsWith('10.') ||
                       urlObj.hostname === 'localhost' ||
                       urlObj.hostname === '127.0.0.1';
      
      // Don't convert CloudFront/S3 URLs
      const isCloudFront = urlObj.hostname.includes('cloudfront') || 
                          urlObj.hostname.includes('amazonaws.com') ||
                          urlObj.hostname.includes('s3');
      
      if (isLocalIP && !isCloudFront) {
        // Extract path from local URL
        fixed = urlObj.pathname + urlObj.search + urlObj.hash;
      }
    } catch (e) {
      // Invalid URL, skip conversion
    }
  }
  
  return fixed;
}

/**
 * Fix SignageAsset URLs
 */
async function fixSignageAssets() {
  console.log('\n📦 Fixing SignageAsset URLs...');
  
  const assets = await prisma.signageAsset.findMany({
    select: { id: true, url: true },
  });
  
  let fixedCount = 0;
  const changes = [];
  
  for (const asset of assets) {
    const fixedUrl = fixUrl(asset.url);
    
    if (fixedUrl !== asset.url) {
      changes.push({
        id: asset.id,
        old: asset.url,
        new: fixedUrl,
      });
      
      if (!DRY_RUN) {
        await prisma.signageAsset.update({
          where: { id: asset.id },
          data: { url: fixedUrl },
        });
      }
      fixedCount++;
    }
  }
  
  console.log(`   Found ${assets.length} SignageAssets`);
  console.log(`   ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixedCount} URLs`);
  
  if (changes.length > 0 && DRY_RUN) {
    console.log('\n   Sample changes:');
    changes.slice(0, 5).forEach(change => {
      console.log(`   - ${change.id}:`);
      console.log(`     OLD: ${change.old}`);
      console.log(`     NEW: ${change.new}`);
    });
    if (changes.length > 5) {
      console.log(`   ... and ${changes.length - 5} more`);
    }
  }
  
  return fixedCount;
}

/**
 * Fix Media URLs
 */
async function fixMedia() {
  console.log('\n📦 Fixing Media URLs...');
  
  const media = await prisma.media.findMany({
    select: { id: true, url: true, optimizedUrl: true },
  });
  
  let fixedCount = 0;
  const changes = [];
  
  for (const item of media) {
    const fixedUrl = fixUrl(item.url);
    const fixedOptimizedUrl = item.optimizedUrl ? fixUrl(item.optimizedUrl) : null;
    
    const needsUpdate = fixedUrl !== item.url || 
                       (item.optimizedUrl && fixedOptimizedUrl !== item.optimizedUrl);
    
    if (needsUpdate) {
      changes.push({
        id: item.id,
        oldUrl: item.url,
        newUrl: fixedUrl,
        oldOptimizedUrl: item.optimizedUrl,
        newOptimizedUrl: fixedOptimizedUrl,
      });
      
      if (!DRY_RUN) {
        await prisma.media.update({
          where: { id: item.id },
          data: {
            url: fixedUrl,
            ...(item.optimizedUrl && { optimizedUrl: fixedOptimizedUrl }),
          },
        });
      }
      fixedCount++;
    }
  }
  
  console.log(`   Found ${media.length} Media records`);
  console.log(`   ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixedCount} URLs`);
  
  if (changes.length > 0 && DRY_RUN) {
    console.log('\n   Sample changes:');
    changes.slice(0, 3).forEach(change => {
      console.log(`   - ${change.id}:`);
      console.log(`     URL: ${change.oldUrl} -> ${change.newUrl}`);
      if (change.oldOptimizedUrl) {
        console.log(`     Optimized: ${change.oldOptimizedUrl} -> ${change.newOptimizedUrl}`);
      }
    });
    if (changes.length > 3) {
      console.log(`   ... and ${changes.length - 3} more`);
    }
  }
  
  return fixedCount;
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Media URL Fix Script');
  console.log('='.repeat(50));
  console.log(`Base URL: ${NEW_BASE_URL}`);
  console.log(`Old Host: ${OLD_HOST}`);
  console.log(`Dry Run: ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`Convert to Relative: ${CONVERT_TO_RELATIVE ? 'YES' : 'NO'}`);
  console.log('='.repeat(50));
  
  try {
    const signageCount = await fixSignageAssets();
    const mediaCount = await fixMedia();
    
    console.log('\n✅ Summary:');
    console.log(`   SignageAssets: ${DRY_RUN ? 'Would fix' : 'Fixed'} ${signageCount} URLs`);
    console.log(`   Media: ${DRY_RUN ? 'Would fix' : 'Fixed'} ${mediaCount} URLs`);
    console.log(`   Total: ${signageCount + mediaCount} URLs ${DRY_RUN ? 'would be' : ''} fixed`);
    
    if (DRY_RUN) {
      console.log('\n💡 Run without --dry-run to apply changes');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


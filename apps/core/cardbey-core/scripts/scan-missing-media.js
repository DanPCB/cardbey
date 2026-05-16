// scripts/scan-missing-media.js
// One-time scanner to flag Media records whose files are missing on disk
// Run with: node scripts/scan-missing-media.js

import { scanMissingMedia } from './scan-missing-media-runner.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Main scanner function (CLI wrapper)
 */
async function runScanner() {
  console.log('[SCAN] Starting missing media file scan...\n');
  
  try {
    // Get total count for progress
    const totalCount = await prisma.media.count();
    console.log(`[SCAN] Total media records in database: ${totalCount}\n`);
    
    // Run the scanner (runner doesn't have detailed logging, so we add it here)
    const result = await scanMissingMedia();
    
    console.log('\n' + '='.repeat(60));
    console.log('[SCAN] Scan completed!');
    console.log('='.repeat(60));
    console.log(`Total media checked:        ${result.totalChecked}`);
    console.log(`Newly marked as missing:    ${result.markedMissing}`);
    console.log(`Cleared missing flags:      ${result.clearedMissing} (files restored)`);
    console.log(`Invalid optimizedUrls cleared: ${result.optimizedCleared}`);
    console.log(`Duration:                   ${result.duration}s`);
    console.log('='.repeat(60));
    console.log(`\nCurrent missing file count: ${result.currentMissingCount}`);
    
    if (result.markedMissing > 0 || result.clearedMissing > 0) {
      console.log('\n💡 Next steps:');
      console.log('   - Review playlists with missing files in the dashboard');
      console.log('   - Remove or replace missing media items');
      console.log('   - Re-run this scanner after fixing files to clear flags');
    }
    
    return result;
  } catch (error) {
    console.error('\n[SCAN] ❌ Error during scan:', error);
    throw error;
  }
}

// Run scanner
runScanner()
  .then((result) => {
    console.log('\n[SCAN] Scanner finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[SCAN] Scanner failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


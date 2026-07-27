// scripts/scan-missing-media.js
// One-time scanner to flag Media records whose files are missing on disk
// Run with: node --import tsx scripts/scan-missing-media.js

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, '..');
loadEnv({ path: path.join(packageRoot, '.env'), override: false });

import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient, disconnectDatabase } from '../src/lib/prisma.js';
import { scanMissingMedia } from './scan-missing-media-runner.js';

/**
 * Main scanner function (CLI wrapper)
 */
async function runScanner() {
  console.log('[SCAN] Starting missing media file scan...\n');

  const prisma = getPrismaClient();

  try {
    const totalCount = await prisma.media.count();
    console.log(`[SCAN] Total media records in database: ${totalCount}\n`);

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

runScanner()
  .then(() => {
    console.log('\n[SCAN] Scanner finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[SCAN] Scanner failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });

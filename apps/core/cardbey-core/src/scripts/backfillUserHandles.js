/**
 * Backfill User Handles Script
 * Generates unique handles for all users that don't have one
 * Safe to re-run multiple times (idempotent)
 * 
 * Usage: npm run backfill:handles
 * Or: node src/scripts/backfillUserHandles.js
 */

import { PrismaClient } from '@prisma/client';
import { generateHandle, generateUniqueHandle } from '../utils/generateHandle.js';

const prisma = new PrismaClient();

async function backfillUserHandles() {
  console.log('[BackfillHandles] Starting handle generation for existing users...');

  try {
    // Find all users without handles
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { handle: null },
          { handle: '' }
        ]
      }
    });

    console.log(`[BackfillHandles] Found ${users.length} users without handles`);

    if (users.length === 0) {
      console.log('[BackfillHandles] ✅ All users already have handles. Nothing to do.');
      return;
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Generate base handle from fullName, displayName, or email
        const baseInput = user.fullName || user.displayName || user.email;
        const baseHandle = generateHandle(baseInput);

        if (!baseHandle) {
          console.warn(`[BackfillHandles] ⚠️  Skipping user ${user.id} - cannot generate handle from: ${baseInput}`);
          skipped++;
          continue;
        }

        // Generate unique handle
        const uniqueHandle = await generateUniqueHandle(
          baseHandle,
          async (handle) => {
            const existing = await prisma.user.findUnique({
              where: { handle }
            });
            return existing !== null;
          }
        );

        if (!uniqueHandle) {
          console.warn(`[BackfillHandles] ⚠️  Failed to generate unique handle for user ${user.id}`);
          skipped++;
          continue;
        }

        // Update user with handle
        await prisma.user.update({
          where: { id: user.id },
          data: { handle: uniqueHandle }
        });

        console.log(`[BackfillHandles] ✅ Generated handle "${uniqueHandle}" for user ${user.id} (${user.email})`);
        generated++;
      } catch (error) {
        console.error(`[BackfillHandles] ❌ Error processing user ${user.id}:`, error.message);
        errors++;
      }
    }

    console.log(`[BackfillHandles] ✅ Complete: ${generated} handles generated, ${skipped} skipped, ${errors} errors`);
    
    // Verify no users have null handles
    const remaining = await prisma.user.count({
      where: {
        OR: [
          { handle: null },
          { handle: '' }
        ]
      }
    });
    
    if (remaining === 0) {
      console.log('[BackfillHandles] ✅ Verification passed: All users now have handles');
    } else {
      console.warn(`[BackfillHandles] ⚠️  Warning: ${remaining} users still missing handles`);
    }
  } catch (error) {
    console.error('[BackfillHandles] ❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('backfillUserHandles')) {
  backfillUserHandles()
    .then(() => {
      console.log('[BackfillHandles] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[BackfillHandles] Script failed:', error);
      process.exit(1);
    });
}

export { backfillUserHandles };


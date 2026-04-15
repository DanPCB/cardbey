/**
 * Post-migration script: Generate handles for existing users
 * Run this after applying the migration to add handle field
 * 
 * Usage: node src/scripts/generateUserHandles.js
 */

import { PrismaClient } from '@prisma/client';
import { generateHandle, generateUniqueHandle } from '../utils/generateHandle.js';

const prisma = new PrismaClient();

async function generateHandlesForExistingUsers() {
  console.log('[GenerateHandles] Starting handle generation for existing users...');

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

    console.log(`[GenerateHandles] Found ${users.length} users without handles`);

    let generated = 0;
    let skipped = 0;

    for (const user of users) {
      // Generate base handle from fullName, displayName, or email
      const baseInput = user.fullName || user.displayName || user.email;
      const baseHandle = generateHandle(baseInput);

      if (!baseHandle) {
        console.warn(`[GenerateHandles] Skipping user ${user.id} - cannot generate handle from: ${baseInput}`);
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
        console.warn(`[GenerateHandles] Failed to generate unique handle for user ${user.id}`);
        skipped++;
        continue;
      }

      // Update user with handle
      await prisma.user.update({
        where: { id: user.id },
        data: { handle: uniqueHandle }
      });

      console.log(`[GenerateHandles] ✅ Generated handle "${uniqueHandle}" for user ${user.id} (${user.email})`);
      generated++;
    }

    console.log(`[GenerateHandles] ✅ Complete: ${generated} handles generated, ${skipped} skipped`);
  } catch (error) {
    console.error('[GenerateHandles] Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateHandlesForExistingUsers()
    .then(() => {
      console.log('[GenerateHandles] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[GenerateHandles] Script failed:', error);
      process.exit(1);
    });
}

export { generateHandlesForExistingUsers };


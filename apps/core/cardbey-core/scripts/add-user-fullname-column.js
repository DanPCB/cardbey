/**
 * One-off: add User.fullName (and other missing User columns) to SQLite DB if missing.
 * Run from apps/core/cardbey-core: node scripts/add-user-fullname-column.js
 * Safe to run multiple times (skips if column exists).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(packageRoot, '.env'), override: false });

import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '../node_modules/.prisma/client-gen/index.js';

const prisma = new PrismaClient();

const columnsToAdd = [
  { name: 'fullName', sql: 'ALTER TABLE "User" ADD COLUMN "fullName" TEXT' },
  { name: 'handle', sql: 'ALTER TABLE "User" ADD COLUMN "handle" TEXT' },
  { name: 'avatarUrl', sql: 'ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT' },
  { name: 'accountType', sql: 'ALTER TABLE "User" ADD COLUMN "accountType" TEXT' },
  { name: 'tagline', sql: 'ALTER TABLE "User" ADD COLUMN "tagline" TEXT' },
  { name: 'role', sql: 'ALTER TABLE "User" ADD COLUMN "role" TEXT DEFAULT \'owner\'' },
  { name: 'emailVerified', sql: 'ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN DEFAULT 0' },
  { name: 'verificationToken', sql: 'ALTER TABLE "User" ADD COLUMN "verificationToken" TEXT' },
  { name: 'verificationExpires', sql: 'ALTER TABLE "User" ADD COLUMN "verificationExpires" DATETIME' },
  { name: 'resetToken', sql: 'ALTER TABLE "User" ADD COLUMN "resetToken" TEXT' },
  { name: 'resetExpires', sql: 'ALTER TABLE "User" ADD COLUMN "resetExpires" DATETIME' },
  { name: 'aiCreditsBalance', sql: 'ALTER TABLE "User" ADD COLUMN "aiCreditsBalance" INTEGER DEFAULT 0' },
  { name: 'welcomeFullStoreRemaining', sql: 'ALTER TABLE "User" ADD COLUMN "welcomeFullStoreRemaining" INTEGER DEFAULT 1' },
  { name: 'aiCreditsUpdatedAt', sql: 'ALTER TABLE "User" ADD COLUMN "aiCreditsUpdatedAt" DATETIME' },
];

async function main() {
  for (const { name, sql } of columnsToAdd) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('Added column:', name);
    } catch (e) {
      if (e.message && e.message.includes('duplicate column name')) {
        console.log('Column already exists:', name);
      } else {
        console.error('Failed to add', name, e.message);
      }
    }
  }
  await prisma.$disconnect();
}

main();

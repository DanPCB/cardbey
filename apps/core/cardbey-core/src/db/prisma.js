/**
 * Prisma entry point for Core.
 *
 * Device pairing lifecycle is being unified on `src/db/prisma.js → getPrismaClient()`.
 * For now this module is a thin shim over the existing singleton in `src/lib/prisma.js`.
 */
export { getPrismaClient, assertCampaignModels, testDatabaseConnection } from '../lib/prisma.js';


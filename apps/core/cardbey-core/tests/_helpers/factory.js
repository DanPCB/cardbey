/**
 * Test Factory Helper
 * Creates test data with all required fields to avoid FK constraint violations
 */

import { generateToken } from '../../src/middleware/auth.js';
import bcrypt from 'bcryptjs';
import { getPrismaClient } from '../../src/lib/prisma.js';
import { resetDb } from '../../src/test/helpers/resetDb.js';

/** App singleton so factory seeds match what `supertest(app)` resolves via auth + DB. */
export const prisma = getPrismaClient();

/**
 * Create a complete test setup: Tenant (if needed) + User + Business + Token
 * Returns { user, business, token }
 */
export async function seedTenantUserStore(options = {}) {
  const {
    email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password = 'test-password-123',
    displayName = 'Test User',
    role = 'owner',
    storeName = 'Test Store',
    storeType = 'General',
    storeSlug = `test-store-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } = options;

  // Create user
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      role,
      roles: JSON.stringify([role]),
      hasBusiness: true,
    },
  });

  // Create business
  const business = await prisma.business.create({
    data: {
      userId: user.id,
      name: storeName,
      type: storeType,
      slug: storeSlug,
      isActive: true,
    },
  });

  // Generate token
  const token = generateToken(user.id);

  return { user, business, token };
}

/**
 * Create a product with all required fields
 */
export async function seedProduct(businessId, options = {}) {
  const {
    name = `Test Product ${Date.now()}`,
    price = 10.99,
    currency = 'USD',
    isPublished = true,
    description = null,
    category = null,
  } = options;

  return await prisma.product.create({
    data: {
      businessId, // Explicitly use the passed businessId parameter
      name,
      price,
      currency,
      isPublished,
      description,
      category,
      viewCount: 0,
      likeCount: 0,
      deletedAt: null, // Explicitly set to null to match stats query filter
    },
  });
}

/**
 * Create a screen with all required fields
 */
export async function seedScreen(businessId, options = {}) {
  const {
    fingerprint = `test-fp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name = 'Test Screen',
    status = 'OFFLINE',
    paired = true,
    assignedPlaylistId = null,
  } = options;

  return await prisma.screen.create({
    data: {
      fingerprint,
      name,
      status,
      paired,
      assignedPlaylistId,
    },
  });
}

/**
 * Create a playlist with all required fields
 */
export async function seedPlaylist(options = {}) {
  const {
    name = `Test Playlist ${Date.now()}`,
    type = 'MEDIA',
    tenantId = null,
    storeId = null,
  } = options;

  return await prisma.playlist.create({
    data: {
      name,
      type,
      tenantId,
      storeId,
    },
  });
}

/**
 * Clean up test data (full SQLite reset in FK-safe order for route suites).
 */
export async function cleanupTestData() {
  await resetDb(prisma);
}


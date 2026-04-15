/**
 * Idempotency Middleware
 * Prevents duplicate event processing within 24h window
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotency middleware for event intake
 */
export async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  
  if (!key) {
    // No idempotency key provided, proceed normally
    return next();
  }

  try {
    const hash = Buffer.from(key).toString('base64').substring(0, 64);
    
    // Check if this key was already processed
    const existing = await prisma.idempotencyKey.findUnique({
      where: { keyHash: hash },
    });

    if (existing && new Date(existing.expiresAt) > new Date()) {
      // Return cached response
      console.log(`[Idempotency] Duplicate request detected: ${key.substring(0, 16)}...`);
      const cachedResponse = JSON.parse(existing.response);
      return res.status(cachedResponse.statusCode || 202).json(cachedResponse.body);
    }

    // Store the key for caching after response
    req.idempotencyKey = key;
    req.idempotencyHash = hash;

    next();
  } catch (err) {
    console.error('[Idempotency] Error:', err);
    // On error, proceed without idempotency check
    next();
  }
}

/**
 * Cache the response for idempotency
 */
export async function cacheIdempotencyResponse(key, hash, statusCode, body) {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    
    await prisma.idempotencyKey.create({
      data: {
        keyHash: hash,
        response: JSON.stringify({ statusCode, body }),
        expiresAt,
      },
    });
  } catch (err) {
    console.error('[Idempotency] Failed to cache:', err);
  }
}








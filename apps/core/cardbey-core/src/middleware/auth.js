/**
 * JWT Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';


/**
 * Extract token from request.
 * Authorization: Bearer <token> is the primary source; header key is case-insensitive (Node lowercases, Express req.get is case-insensitive).
 */
function extractToken(req) {
  // Try Authorization header first (Node lowercases headers; also support req.get for proxy quirks)
  const authHeader = req.headers.authorization || (typeof req.get === 'function' ? req.get('Authorization') : null);
  if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  // Try query param (for iframe/widget scenarios)
  if (req.query.token) {
    return req.query.token;
  }

  // Try cookie (if using cookie-based auth)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Require authentication middleware
 * Validates JWT and attaches user to req.user
 * Also supports dev tokens for development
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    const authSource = req.headers.authorization || (typeof req.get === 'function' ? req.get('Authorization') : null);
    const fromBearer = authSource && typeof authSource === 'string' && authSource.toLowerCase().startsWith('bearer ');

    // Dev-only: log whether Bearer was present and token extracted (do not log token value)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Auth] requireAuth', {
        method: req.method,
        path: req.path,
        bearerPresent: !!fromBearer,
        tokenExtracted: !!token,
        tokenSource: token ? (fromBearer ? 'authorization' : (req.query.token ? 'query' : 'cookie')) : 'none',
      });
    }

    if (!token) {
      // Log helpful debugging info
      console.warn('[Auth] No token provided', {
        method: req.method,
        path: req.path,
        hasAuthHeader: !!req.headers.authorization,
        authHeaderValue: req.headers.authorization ? 'present' : 'missing',
        hasCookie: !!req.cookies?.token,
        hasQueryToken: !!req.query?.token,
      });

      return res.status(401).json({
        ok: false,
        error: 'unauthorized_token_required',
        message: 'Authentication token required. Please include Authorization header with "Bearer <token>".',
        hint: 'For development: Include header "Authorization: Bearer dev-admin-token" in your request.'
      });
    }

    // DEV ONLY SUPERUSER TOKEN: Handle dev-admin-token (for development/testing only)
    if (token === 'dev-admin-token' && process.env.NODE_ENV !== 'production') {
      // DEV ONLY SUPERUSER TOKEN: Create a safe dev user object without database queries
      const devUser = {
        id: 'dev-user-id',
        email: 'dev@cardbey.local',
        displayName: 'Dev User',
        roles: '["admin"]',
        role: 'admin',
        emailVerified: true,
        isDevAdmin: true, // Flag for dev-admin bypass in store access checks
        // Add any other fields that routes might expect
        business: null,
      };

      req.user = devUser;
      req.userId = req.userId ?? req.user?.id ?? devUser.id;
      req.tenantId = null; // Set tenantId if routes require it (can be overridden by routes)

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Auth] Bearer parsed, req.user set', { userId: devUser.id, source: 'dev-admin-token' });
      }
      console.log('[Auth] ✅ Dev token authenticated (non-production only)', {
        userId: devUser.id,
        email: devUser.email,
        role: devUser.role,
        isDevAdmin: true,
      });

      return next();
    }
    
    // Block dev token in production for security
    if (token === 'dev-admin-token' && process.env.NODE_ENV === 'production') {
      console.warn('[Auth] ⚠️ Dev token attempted in production - blocked');
      return res.status(401).json({ 
        ok: false,
        error: 'unauthorized',
        message: 'Dev tokens are not allowed in production'
      });
    }
    
    // Verify JWT (accepts both userId and sub claims)
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Extract userId from either userId or sub claim (for compatibility)
    const userId = decoded.userId || decoded.sub;
    
    if (!userId) {
      return res.status(401).json({ 
        ok: false,
        error: 'unauthorized',
        message: 'Token missing userId or sub claim'
      });
    }
    
    // Minimal guest token: no DB lookup, compatible with optionalAuth/requireAuth
    if (decoded.role === 'guest' && decoded.auth === 'guest') {
      req.user = { id: userId, role: 'guest' };
      req.userId = req.userId ?? req.user?.id ?? userId;
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Auth] Bearer parsed, req.user set', { userId, source: 'guest' });
      }
      return next();
    }

    // Login/session lookup: minimal scalars only; do not eagerly load relations (e.g. businesses).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        handle: true,
        displayName: true,
        passwordHash: true,
        role: true,
        roles: true,
        emailVerified: true,
      },
    });

    if (!user) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] JWT accepted but no User row for id (wrong DB, deleted user, or stale token)', {
          userId,
        });
      }
      // Valid token but user doesn't exist - this is a real auth error
      return res.status(401).json({
        ok: false,
        error: 'unauthorized_user_missing',
        message: 'User not found for this token. Sign in again or check the database this server uses.',
      });
    }

    // Attach user to request; ensure req.userId is always set from req.user.id for draft-store/summary and other routes
    req.user = user;
    req.userId = req.userId ?? req.user?.id ?? user.id;
    // isDevAdmin is only set for the explicit dev-admin-token above; do not grant it to all users in dev/test
    // so that owner-only routes (e.g. GET /api/stores/:id) correctly return 403 for staff/viewer.

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Auth] Bearer parsed, req.user set', { userId: user.id, source: 'jwt-db' });
    }
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] JWT verify failed (signature/secret mismatch or malformed token)', {
          name: error.name,
          message: error.message,
        });
      }
      return res.status(401).json({ 
        ok: false,
        error: 'unauthorized',
        message: 'The provided token is invalid. Please check your authentication token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] JWT expired', { expiredAt: error.expiredAt });
      }
      return res.status(401).json({ 
        ok: false,
        error: 'unauthorized',
        message: 'Your authentication token has expired. Please log in again.'
      });
    }
    
    console.error('[Auth] Error:', error);
    return res.status(401).json({ 
      ok: false,
      error: 'unauthorized',
      message: 'Authentication failed. Please sign in again.'
    });
  }
}

/**
 * Require platform admin role middleware.
 * req.user must come from DB (requireAuth) so role is authoritative; guest tokens never pass.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Not authenticated', message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    console.warn('[Auth] Admin required, request blocked (403)', { path: req.path, method: req.method, userId: req.user?.id });
    return res.status(403).json({ ok: false, error: 'Admin access required', message: 'Platform admin access required' });
  }
  next();
}

/**
 * Optional auth middleware - doesn't fail if no token
 */
export async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (token) {
      // Dev-only: allow optionalAuth to recognize dev-admin-token so routes that use optionalAuth
      // can still derive an authenticated tenant context in local development.
      if (token === 'dev-admin-token' && process.env.NODE_ENV !== 'production') {
        const devUser = {
          id: 'dev-user-id',
          email: 'dev@cardbey.local',
          displayName: 'Dev User',
          roles: '["admin"]',
          role: 'admin',
          emailVerified: true,
          isDevAdmin: true,
          business: null,
        };
        req.user = devUser;
        req.userId = req.userId ?? devUser.id;
        return next();
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      // Extract userId from either userId or sub claim (for compatibility)
      const userId = decoded.userId || decoded.sub;
      
      if (userId) {
        // Minimal guest token: no DB lookup
        if (decoded.role === 'guest' && decoded.auth === 'guest') {
          req.user = { id: userId, role: 'guest' };
          req.userId = userId;
        } else {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              handle: true,
              displayName: true,
              passwordHash: true,
              role: true,
              roles: true,
              emailVerified: true,
            },
          });
          if (user) {
            req.user = user;
            req.userId = user.id;
          }
        }
      }
    }
  } catch (error) {
    // Silently fail - this is optional auth
  }
  
  next();
}

/**
 * Generate JWT token for user
 * Production: uses userId claim only
 * Test: includes both userId and sub for compatibility
 */
export function generateToken(userId) {
  const payload = process.env.NODE_ENV === 'test'
    ? { userId, sub: userId } // Test: include both for compatibility
    : { userId }; // Production: use userId only (stable)
  
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Generate minimal guest JWT (no DB user). Payload: { userId, role: 'guest', auth: 'guest' }.
 * Compatible with requireAuth/optionalAuth when they recognize role:'guest'.
 * @returns {{ token: string, userId: string }}
 */
export function generateGuestToken() {
  const userId = `guest_${crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex')}`;
  const payload = { userId, role: 'guest', auth: 'guest' };
  const token = jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  return { token, userId };
}

/**
 * Require owner role middleware
 * Only allows users with role="owner"
 */
export function requireOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      ok: false,
      error: 'Not authenticated',
      message: 'Authentication required'
    });
  }
  
  const userRole = req.user.role || 'viewer';
  
  if (userRole !== 'owner') {
    return res.status(403).json({ 
      ok: false,
      error: 'Owner access required',
      message: 'This action requires owner permissions'
    });
  }
  
  next();
}

/**
 * Require store access middleware
 * Allows owner or staff, but not viewer
 */
export function requireStoreAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      ok: false,
      error: 'Not authenticated',
      message: 'Authentication required'
    });
  }
  
  const userRole = req.user.role || 'viewer';
  
  if (userRole === 'viewer') {
    return res.status(403).json({ 
      ok: false,
      error: 'Insufficient permissions',
      message: 'This action requires owner or staff permissions'
    });
  }
  
  next();
}


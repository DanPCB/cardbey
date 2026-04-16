/**
 * Guest & User Authentication Middleware
 * Supports both full users and limited guest tokens
 */

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
/** Must match default in middleware/auth.js so Bearer tokens verify consistently. */
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

// In-memory rate limiting (use Redis in production)
const guestRateLimits = new Map();

function applyGuestRateLimit(guestKey) {
  const guestId = String(guestKey || '').trim();
  if (!guestId) return true;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (!guestRateLimits.has(guestId)) {
    guestRateLimits.set(guestId, { count: 0, resetAt: now + dayMs });
  }
  const limit = guestRateLimits.get(guestId);
  if (now > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = now + dayMs;
  }
  if (limit.count >= 20) {
    return false;
  }
  limit.count++;
  return true;
}

function attachGuestRequest(req, guestId) {
  const gid = String(guestId || '').trim();
  req.user = null;
  req.userId = gid || null;
  req.isGuest = true;
  req.guestId = gid || null;
  req.guest = gid ? { id: gid, role: 'guest' } : null;
}

/**
 * Middleware: Require user OR guest token
 * Guests have limited permissions
 */
export async function requireUserOrGuest(req, res, next) {
  // Dev-only: Log all headers for debugging
  if (process.env.NODE_ENV !== 'production') {
    // Check both lowercase and original case
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const allHeaderKeys = Object.keys(req.headers);
    const authRelatedHeaders = allHeaderKeys.filter(h => 
      h.toLowerCase().includes('auth') || 
      h.toLowerCase().includes('cookie') ||
      h.toLowerCase().includes('authorization')
    );
    
    console.log('[assistantAuth] Request received:', {
      method: req.method,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      hasAuthHeader: !!authHeader,
      authHeaderValue: authHeader ? authHeader.substring(0, 30) + '...' : 'none',
      hasCookie: !!req.cookies?.accessToken,
      cookieKeys: Object.keys(req.cookies || {}),
      allHeaderKeys: allHeaderKeys.length,
      authRelatedHeaders: authRelatedHeaders,
      // Log first 10 header keys to see what's actually present
      sampleHeaders: allHeaderKeys.slice(0, 10).map(k => ({ key: k, value: req.headers[k]?.substring(0, 20) + '...' }))
    });
  }
  
  try {
    // Try to get token from cookie first (full user)
    const cookieToken = req.cookies?.accessToken;
    
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET);
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId }
        });
        
        if (user) {
          req.user = user;
          req.userId = user.id;
          req.isGuest = false;
          return next();
        }
      } catch (err) {
        console.error('[Auth] Cookie token invalid:', err.message);
      }
    }
    
    // Try Authorization header for both guest and user tokens
    // Check both lowercase (Express normalizes) and original case
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Dev-only: Log token presence
      if (process.env.NODE_ENV !== 'production') {
        console.log('[assistantAuth] Authorization header present, token length:', token.length);
      }
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Dev-only: Log decoded token structure
        if (process.env.NODE_ENV !== 'production') {
          console.log('[assistantAuth] Token decoded successfully:', {
            hasUserId: !!decoded.userId,
            hasRole: !!decoded.role,
            hasGuestId: !!decoded.guestId,
            role: decoded.role
          });
        }
        
        const tokenUserId = decoded.userId || decoded.sub;

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
          req.isGuest = false;
          req.guest = null;
          req.guestId = null;
          if (process.env.NODE_ENV !== 'production') {
            console.log('[assistantAuth] mode=user dev-admin-token');
          }
          return next();
        }

        // Canonical guest JWT from POST /api/auth/guest — same contract as middleware/auth.js requireAuth
        // (must run before DB user lookup; guest ids are not User rows).
        if (decoded.role === 'guest' && decoded.auth === 'guest' && tokenUserId) {
          const gid = String(tokenUserId).trim();
          if (!applyGuestRateLimit(gid)) {
            return res.status(429).json({
              error: 'Rate limit exceeded',
              message: 'Create an account to continue using Cardbey Assistant',
              upgradeUrl: '/signup',
            });
          }
          attachGuestRequest(req, gid);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[assistantAuth] mode=guest canonical userId=${gid}`);
          }
          return next();
        }

        // Legacy guest tokens: guestId claim only (no User row)
        if (decoded.role === 'guest' && decoded.guestId) {
          const guestId = String(decoded.guestId).trim();
          if (!applyGuestRateLimit(guestId)) {
            return res.status(429).json({
              error: 'Rate limit exceeded',
              message: 'Create an account to continue using Cardbey Assistant',
              upgradeUrl: '/signup',
            });
          }
          attachGuestRequest(req, guestId);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[assistantAuth] mode=guest legacy guestId=${guestId}`);
          }
          return next();
        }

        // Handle user tokens (FIX: Added support for user tokens from Authorization header)
        if (decoded.userId) {
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { businesses: true }
          });
          
          if (!user) {
            // Valid token but user doesn't exist
            return res.status(401).json({ 
              error: 'Authentication required',
              message: 'User not found'
            });
          }
          
          req.user = user;
          req.userId = user.id;
          req.isGuest = false;
          
          // Dev-only debug log
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[assistantAuth] mode=user userId=${user.id}`);
          }
          
          return next();
        }
        
        // Token decoded but doesn't match guest or user pattern
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Invalid token format'
        });
      } catch (err) {
        // JWT verification failed (expired, invalid signature, etc.)
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
          req.isGuest = false;
          req.guest = null;
          req.guestId = null;
          if (process.env.NODE_ENV !== 'production') {
            console.log('[assistantAuth] mode=user dev-admin-token fallback');
          }
          return next();
        }
        if (process.env.NODE_ENV !== 'production') {
          console.error('[assistantAuth] Token verification failed:', {
            name: err.name,
            message: err.message,
            tokenLength: token.length,
            tokenPreview: token.substring(0, 20) + '...'
          });
        }
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Invalid or expired token'
        });
      }
    }
    
    // No valid auth found: allow guest-capable routes to proceed as anonymous guest.
    if (process.env.NODE_ENV !== 'production') {
      console.log('[assistantAuth] No valid auth found - no Authorization header or cookie token');
    }
    const anonGuestId = req.guestSessionId
      ? `guest_${String(req.guestSessionId).trim()}`
      : `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!applyGuestRateLimit(anonGuestId)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Create an account to continue using Cardbey Assistant',
        upgradeUrl: '/signup',
      });
    }
    attachGuestRequest(req, anonGuestId);
    return next();
    
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware: Require full user (no guests allowed)
 * Use this for actions that modify data or require full permissions
 */
export async function requireUser(req, res, next) {
  try {
    // Try cookie token first
    const cookieToken = req.cookies?.cardbey_auth_token;
    
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET);
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId }
        });
        
        if (user) {
          req.user = user;
          req.userId = user.id;
          req.isGuest = false;
          return next();
        }
      } catch (err) {
        console.error('[Auth] Cookie token invalid:', err.message);
      }
    }
    
    // No valid user auth found
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please sign in to access this feature',
      upgradeUrl: '/signup'
    });
    
  } catch (error) {
    console.error('[Auth] requireUser error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Check if user/guest can perform action
 */
export function canPerformAction(req, intent) {
  // Guest limitations
  if (req.isGuest) {
    const allowedForGuests = [
      'show_trending',
      'design_flyer', // Preview only
      'chat' // Limited
    ];
    
    return allowedForGuests.includes(intent);
  }
  
  // Full users can do everything
  return true;
}


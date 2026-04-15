/**
 * OAuth Routes - Facebook & TikTok
 * Complete flow: start → provider → callback → user creation → cookie → redirect
 */

import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// In-memory state store (use Redis in production)
const oauthStates = new Map();

/**
 * Generate secure state token
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Set auth cookie
 */
function setAuthCookie(res, token) {
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    domain: process.env.COOKIE_DOMAIN || undefined
  });
}

/**
 * Create or update user from OAuth data
 * Phase 2: Match by email, set role="owner", emailVerified=true for new users
 */
async function upsertUser(provider, profile) {
  const email = profile.email || `${provider}_${profile.id}@placeholder.cardbey.com`;
  const normalizedEmail = email.toLowerCase().trim();
  
  // Match by email (SQLite is case-sensitive, so normalize before search)
  // Try exact match first, then try case variations
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { email: email }, // Original case
        { email: email.toLowerCase() },
        { email: email.toUpperCase() }
      ]
    }
  });
  
  if (user) {
    // Update existing user (don't change role or emailVerified if already set)
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: profile.name || user.displayName,
        avatarUrl: profile.picture || profile.avatar_url || user.avatarUrl
      }
    });
  } else {
    // Create new user with Phase 2 defaults
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: crypto.randomBytes(32).toString('hex'), // Random - OAuth only
        displayName: profile.name || profile.displayName || normalizedEmail.split('@')[0],
        avatarUrl: profile.picture || profile.avatar_url || null,
        hasBusiness: false,
        role: 'owner', // Phase 2: Social login users are owners
        emailVerified: true, // Phase 2: OAuth emails are pre-verified
        roles: JSON.stringify(['viewer']), // Legacy field
        onboarding: JSON.stringify({
          completed: false,
          currentStep: 'welcome',
          steps: {
            welcome: false,
            profile: false,
            business: false
          }
        })
      }
    });
  }
  
  return user;
}

/**
 * GET /oauth/facebook/start
 * Redirect to Facebook OAuth
 */
router.get('/facebook/start', (req, res) => {
  const clientId = process.env.FACEBOOK_APP_ID;
  
  if (!clientId) {
    return res.status(500).send(`
      <html>
        <body>
          <h2>Facebook OAuth not configured</h2>
          <p>Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment variables.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
  
  const state = generateState();
  oauthStates.set(state, { provider: 'facebook', timestamp: Date.now() });
  
  // Clean old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of oauthStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      oauthStates.delete(key);
    }
  }
  
  const redirectUri = `${req.protocol}://${req.get('host')}/oauth/facebook/callback`;
  const scope = 'email,public_profile';
  
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${state}&` +
    `scope=${scope}`;
  
  console.log('[OAuth] Facebook start, redirecting to:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /oauth/facebook/callback
 * Handle Facebook OAuth callback
 */
router.get('/facebook/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('[OAuth] Facebook error:', error);
    return res.send(generateBridgePage('facebook', false, error));
  }
  
  if (!oauthStates.has(state)) {
    console.error('[OAuth] Invalid state token');
    return res.send(generateBridgePage('facebook', false, 'Invalid state'));
  }
  
  oauthStates.delete(state);
  
  try {
    // Exchange code for access token
    const clientId = process.env.FACEBOOK_APP_ID;
    const clientSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/oauth/facebook/callback`;
    
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${clientId}&` +
      `client_secret=${clientSecret}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`;
    
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access token received');
    }
    
    // Get user profile
    const profileUrl = `https://graph.facebook.com/me?fields=id,name,email&access_token=${tokenData.access_token}`;
    const profileResponse = await fetch(profileUrl);
    const profile = await profileResponse.json();
    
    console.log('[OAuth] Facebook profile:', profile);
    
    // Create/update user
    const user = await upsertUser('facebook', profile);
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set cookie
    setAuthCookie(res, token);
    
    console.log('[OAuth] Facebook success, user:', user.email);
    
    // Send bridge page
    res.send(generateBridgePage('facebook', true));
    
  } catch (error) {
    console.error('[OAuth] Facebook callback error:', error);
    res.send(generateBridgePage('facebook', false, error.message));
  }
});

/**
 * GET /oauth/google/start
 * Redirect to Google OAuth
 */
router.get('/google/start', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    return res.status(500).send(`
      <html>
        <body>
          <h2>Google OAuth not configured</h2>
          <p>Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
  
  const state = generateState();
  oauthStates.set(state, { provider: 'google', timestamp: Date.now() });
  
  // Clean old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of oauthStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      oauthStates.delete(key);
    }
  }
  
  const redirectUri = `${req.protocol}://${req.get('host')}/oauth/google/callback`;
  const scope = 'openid email profile';
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `state=${state}&` +
    `access_type=offline&` +
    `prompt=consent`;
  
  console.log('[OAuth] Google start, redirecting to:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /oauth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('[OAuth] Google error:', error);
    return res.send(generateBridgePage('google', false, error));
  }
  
  if (!oauthStates.has(state)) {
    console.error('[OAuth] Invalid state token');
    return res.send(generateBridgePage('google', false, 'Invalid state'));
  }
  
  oauthStates.delete(state);
  
  try {
    // Exchange code for access token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/oauth/google/callback`;
    
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access token received');
    }
    
    // Get user profile
    const profileUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
    const profileResponse = await fetch(profileUrl, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    const profile = await profileResponse.json();
    
    console.log('[OAuth] Google profile:', profile);
    
    // Create/update user
    const user = await upsertUser('google', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture
    });
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set cookie
    setAuthCookie(res, token);
    
    console.log('[OAuth] Google success, user:', user.email);
    
    // Send bridge page
    res.send(generateBridgePage('google', true));
    
  } catch (error) {
    console.error('[OAuth] Google callback error:', error);
    res.send(generateBridgePage('google', false, error.message));
  }
});

/**
 * GET /oauth/tiktok/start
 * Redirect to TikTok OAuth
 */
router.get('/tiktok/start', (req, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  
  if (!clientKey) {
    return res.status(500).send(`
      <html>
        <body>
          <h2>TikTok OAuth not configured</h2>
          <p>Please set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in environment variables.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
  
  const state = generateState();
  oauthStates.set(state, { provider: 'tiktok', timestamp: Date.now() });
  
  const redirectUri = `${req.protocol}://${req.get('host')}/oauth/tiktok/callback`;
  const scope = 'user.info.basic';
  
  const authUrl = `https://www.tiktok.com/auth/authorize/?` +
    `client_key=${clientKey}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `state=${state}&` +
    `scope=${scope}&` +
    `response_type=code`;
  
  console.log('[OAuth] TikTok start, redirecting to:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /oauth/tiktok/callback
 * Handle TikTok OAuth callback
 */
router.get('/tiktok/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('[OAuth] TikTok error:', error);
    return res.send(generateBridgePage('tiktok', false, error));
  }
  
  if (!oauthStates.has(state)) {
    console.error('[OAuth] Invalid state token');
    return res.send(generateBridgePage('tiktok', false, 'Invalid state'));
  }
  
  oauthStates.delete(state);
  
  try {
    // Exchange code for access token
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/oauth/tiktok/callback`;
    
    const tokenUrl = 'https://open-api.tiktok.com/oauth/access_token/';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.data?.access_token) {
      throw new Error('No access token received');
    }
    
    // Get user profile
    const profileUrl = `https://open-api.tiktok.com/user/info/?access_token=${tokenData.data.access_token}`;
    const profileResponse = await fetch(profileUrl);
    const profileData = await profileResponse.json();
    const profile = profileData.data?.user;
    
    if (!profile) {
      throw new Error('Failed to get user profile');
    }
    
    console.log('[OAuth] TikTok profile:', profile);
    
    // Create/update user
    const user = await upsertUser('tiktok', {
      id: profile.open_id,
      name: profile.display_name,
      email: profile.email
    });
    
    // Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    // Set cookie
    setAuthCookie(res, token);
    
    console.log('[OAuth] TikTok success, user:', user.email);
    
    // Send bridge page
    res.send(generateBridgePage('tiktok', true));
    
  } catch (error) {
    console.error('[OAuth] TikTok callback error:', error);
    res.send(generateBridgePage('tiktok', false, error.message));
  }
});

/**
 * Generate OAuth bridge page
 * Posts message to opener and closes popup
 */
function generateBridgePage(provider, success, errorMessage = null) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${success ? 'Authentication Successful' : 'Authentication Failed'}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          text-align: center;
          padding: 40px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          backdrop-filter: blur(10px);
        }
        .icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        h1 {
          margin: 0 0 12px 0;
          font-size: 24px;
        }
        p {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }
        .error {
          background: rgba(239, 68, 68, 0.2);
          padding: 12px;
          border-radius: 8px;
          margin-top: 16px;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${success ? '✅' : '❌'}</div>
        <h1>${success ? 'Authentication Successful!' : 'Authentication Failed'}</h1>
        <p>${success ? 'Closing window...' : 'Please try again'}</p>
        ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
      </div>
      
      <script>
        (function() {
          console.log('[OAuth Bridge] Sending message to opener');
          
          // Send message to parent window
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              kind: 'oauth:${success ? 'success' : 'error'}',
              provider: '${provider}',
              ${errorMessage ? `error: '${errorMessage.replace(/'/g, "\\'")}'` : ''}
            }, window.location.origin);
            
            console.log('[OAuth Bridge] Message sent, closing window in 1s');
            setTimeout(() => {
              window.close();
            }, 1000);
          } else {
            console.warn('[OAuth Bridge] No opener window found');
            setTimeout(() => {
              window.location.href = '${FRONTEND_URL}';
            }, 2000);
          }
        })();
      </script>
    </body>
    </html>
  `;
}

export default router;


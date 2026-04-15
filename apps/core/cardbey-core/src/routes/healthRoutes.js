/**
 * Health and Dashboard Routes
 * Provides system health status and dashboard trend data
 */

import { Router } from 'express';
import os from 'os';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { testDatabaseConnection } from '../lib/prisma.js';
import { getStatus as getSchedulerStatus } from '../scheduler/heartbeat.js';
import { isSseHealthy } from '../realtime/sse.js';
import { getOAuthStatus } from '../auth/providers.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let version = '0.0.0';
try {
  const pkgPath = join(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version || '0.0.0';
} catch (e) {
  console.warn('[Health] Could not read package.json version:', e.message);
}

/**
 * GET /api/ping
 * Simple health check endpoint for API availability
 * Returns immediately with no DB work - used by devices/apps to verify API is reachable
 */
router.get('/ping', (req, res) => {
  console.log(`[PING] /api/ping from ${req.ip}`);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, status: 'ok' });
});

/**
 * GET /api/health
 * Simple health check endpoint for device players
 * Returns basic status without DB checks - lightweight for device pings
 * 
 * If ?full=true is provided, returns comprehensive health status (for dashboard)
 * Otherwise returns simple format: { ok: true, env: "...", timestamp: "..." }
 */
router.get('/health', async (req, res) => {
  // Simple health check for device players (default)
  if (req.query.full !== 'true') {
    console.log(`[Health] GET /api/health (simple) from ${req.ip}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  }

  // Comprehensive health check for dashboard (?full=true)
  console.log(`[Health] GET /api/health (full) from ${req.ip}`);
  // Set cache headers
  res.setHeader('Cache-Control', 'no-store');
  
  try {
    const uptimeSec = Math.floor(process.uptime());
    
    // API: Always ok if route handler runs
    const apiStatus = { ok: true };
    
    // Database: Test connection with timeout
    const dbResult = await testDatabaseConnection();
    const databaseStatus = {
      ok: dbResult.ok,
      ...(dbResult.dialect && { dialect: dbResult.dialect }),
      ...(dbResult.latencyMs !== undefined && { latencyMs: dbResult.latencyMs }),
      ...(dbResult.error && { error: dbResult.error }),
      ...(dbResult.reason && { reason: dbResult.reason }),
    };
    
    // Scheduler: Check heartbeat
    const schedulerStatus = getSchedulerStatus();
    
    // SSE: Check if route is registered and has broadcasted recently
    const sseOk = isSseHealthy(60000); // 60s max age
    const sseStatus = {
      ok: sseOk,
      path: '/api/stream',
    };
    
    // OAuth: Check configured providers
    const oauthStatus = getOAuthStatus();
    
    const healthData = {
      version,
      uptimeSec,
      api: apiStatus,
      database: databaseStatus,
      scheduler: schedulerStatus,
      sse: sseStatus,
      oauth: oauthStatus,
    };
    
    res.json(healthData);
  } catch (error) {
    console.error('[Health] Error generating health status:', error);
    res.status(500).json({
      version,
      uptimeSec: Math.floor(process.uptime()),
      api: { ok: false, error: error.message },
      database: { ok: false, error: 'check_failed' },
      scheduler: { ok: false },
      sse: { ok: false, path: '/api/stream' },
      oauth: { ok: false, providers: [], details: [] },
    });
  }
});

/**
 * GET /api/healthz (also accessible at /healthz via root-level mount)
 * Simple health check: 200 if API and DB are ok, else 503
 * Single source of truth: handler defined here, mounted at both /api and root level
 */
router.get('/healthz', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  
  try {
    const dbResult = await testDatabaseConnection();
    const apiOk = true; // If we reach here, API is ok
    const dbOk = dbResult.ok;
    
    if (apiOk && dbOk) {
      return res.status(200).json({ ok: true });
    } else {
      return res.status(503).json({ ok: false, api: apiOk, database: dbOk });
    }
  } catch (error) {
    return res.status(503).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/readyz (also accessible at /readyz via root-level mount)
 * Readiness check: 200 if all sections are ok, else 503
 * OAuth is required in production, optional in local/dev
 * Single source of truth: handler defined here, mounted at both /api and root level
 */
router.get('/readyz', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  
  try {
    // Compute all values per request (not at module init)
    const api = true;
    const dbResult = await testDatabaseConnection();
    const database = dbResult.ok;
    const schedulerStatus = getSchedulerStatus();
    const scheduler = schedulerStatus.ok;
    const sse = isSseHealthy(60000);
    const oauthStatus = getOAuthStatus();
    const oauth = !!oauthStatus.ok; // Normalize to boolean
    
    // Read env vars per request (fresh read each time)
    const nodeEnv = process.env.NODE_ENV || '';
    const oauthRequiredEnv = process.env.OAUTH_REQUIRED === 'true';
    
    // Compute oauthRequired: true if OAUTH_REQUIRED='true' OR NODE_ENV='production'
    const oauthRequired = oauthRequiredEnv || nodeEnv === 'production';
    
    // Compute final readiness: OAuth only required if oauthRequired is true
    const ok =
      api &&
      database &&
      scheduler &&
      sse &&
      (!oauthRequired || oauth);
    
    return res.status(ok ? 200 : 503).json({
      ok,
      api,
      database,
      scheduler,
      sse,
      oauth,
      oauthRequired,
      env: {
        nodeEnv,
        oauthRequiredEnv,
      },
    });
  } catch (error) {
    return res.status(503).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/dashboard/trend
 * Returns mock 7-day trend data for dashboard charts
 */
router.get('/dashboard/trend', (req, res) => {
  console.log('[Dashboard] GET /api/dashboard/trend');
  
  try {
    // Generate mock data for last 7 days
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    
    // Get the day of week for today (0 = Sunday, 1 = Monday, etc.)
    const todayDay = now.getDay();
    const dayIndex = todayDay === 0 ? 6 : todayDay - 1; // Convert to Mon-Sun index
    
    // Shift days array so today is at the end
    const orderedDays = [...days.slice(dayIndex + 1), ...days.slice(0, dayIndex + 1)];
    
    // Generate trend data with some variation
    const series = orderedDays.map((day, idx) => {
      const baseImp = 2000 + Math.floor(Math.random() * 800);
      const baseClick = Math.floor(baseImp * 0.08) + Math.floor(Math.random() * 40);
      const baseShare = Math.floor(baseClick * 0.15) + Math.floor(Math.random() * 10);
      
      return {
        d: day,
        impressions: baseImp,
        clicks: baseClick,
        shares: baseShare,
      };
    });
    
    res.json({
      ok: true,
      series,
      updatedAt: new Date().toISOString(),
      period: '7d',
    });
  } catch (error) {
    console.error('[Dashboard] Error generating trend data:', error);
    res.status(500).json({
      ok: false,
      series: [],
      error: error.message,
      updatedAt: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/dashboard/insights
 * Returns AI-generated dashboard insights
 * Used by the dashboard to display AI-powered summaries and metrics
 */
router.get('/dashboard/insights', (req, res) => {
  console.log('[Dashboard] GET /api/dashboard/insights');
  
  try {
    // Check if OpenAI API key is configured
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    // For now, return a placeholder response
    // TODO: Implement actual AI insights generation when ready
    res.json({
      summary: hasOpenAI 
        ? 'AI insights are configured and ready. Full insights coming soon.'
        : 'AI insights temporarily unavailable. Configure OPENAI_API_KEY to enable.',
      enabled: hasOpenAI,
      metrics: hasOpenAI ? {
        // Placeholder metrics structure
        performance: 'good',
        trends: 'stable',
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Dashboard] Error generating insights:', error);
    res.status(500).json({
      summary: 'Error generating insights',
      enabled: false,
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * GET /api/ai/insights
 * Returns AI insights status (mock until real pipeline is ready)
 */
router.get('/ai/insights', (req, res) => {
  console.log('[AI] GET /api/ai/insights');
  
  res.json({
    status: 'neutral',
    message: 'AI insights temporarily unavailable',
    generatedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/env
 * Returns environment configuration status
 * Used to verify deployment readiness (Render/Vultr/etc)
 */
router.get('/env', (req, res) => {
  console.log('[Env] GET /api/env');
  
  try {
    const envData = {
      mode: process.env.NODE_ENV || 'development',
      environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'development', // DEV/STAGING/PROD
      host: os.hostname(),
      publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
      dashboardUrl: process.env.DASHBOARD_URL || null,
      db: process.env.DATABASE_URL ? 'configured' : 'missing',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      jwt: process.env.JWT_SECRET ? 'configured' : 'missing',
      port: process.env.PORT || '3001',
      sseStreamKey: process.env.SSE_STREAM_KEY ? 'configured' : 'using default',
      allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
      timestamp: new Date().toISOString(),
    };
    
    res.json(envData);
  } catch (error) {
    console.error('[Env] Error generating env status:', error);
    res.status(500).json({
      mode: 'unknown',
      environment: 'unknown',
      host: 'unknown',
      db: 'unknown',
      openai: 'unknown',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/media/health
 * Simple health check for media service
 * Returns { ok: true } if media routes are accessible
 */
router.get('/media/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

export default router;


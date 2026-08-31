/**
 * Cardbey Core API Server
 * Central backend for all Cardbey services
 * 
 * NOTE: This server requires TypeScript support for orchestrator handlers.
 * Run with: tsx src/server.js (or use npm run dev which uses nodemon)
 */

// Memory limit must be established before any other application code runs.
import './lib/forceV8MemoryLimit.js';
import { verifyMemoryLimit } from './lib/memoryVerification.js';

// Load environment variables first so DATABASE_URL/engine flags are present.
import './env/loadEnv.js';
import './lib/processGuards.js';

// MUST run before any PrismaClient: normalize DATABASE_URL for SQLite (file:)
import './env/ensureDatabaseUrl.js';
import { assertDatabaseIdentityAtStartup, logCoreEnvBoot } from './lib/dbIdentity.js';
import { logStorageBoot } from './lib/storage/index.js';
import { assertSchemaFingerprintAtStartup } from './lib/schemaFingerprint.js';
import { logPublicWebBaseOnStartup, publicCanonicalWebBase } from './utils/publicWebBase.js';
import './lib/skills/index.js';
import './services/skills/builtinSkills.js';
import './services/hooks/builtinHooks.js';
import './services/agents/builtinAgents.js';
import './services/reliability/builtinHeals.js';
import './services/reliability/rateLimitConfig.js';
import './services/reliability/bulkheadConfig.js';
import './services/reliability/sloConfig.js';
import { initReliabilityLayer } from './services/reliability/reliabilityInit.js';

assertDatabaseIdentityAtStartup();
assertSchemaFingerprintAtStartup();
logCoreEnvBoot();
logStorageBoot();

const memoryVerified = verifyMemoryLimit();
console.log(`[MEM] Memory limit verified: ${memoryVerified ? 'yes' : 'no'}`);

// Register tsx loader for TypeScript imports (if available)
try {
  // Try to register tsx loader for TypeScript file support
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // tsx will be used if server is started with: tsx src/server.js
    // For nodemon/dev, ensure tsx is available
  }
} catch (error) {
  // tsx loader not available - TypeScript imports will fail at runtime
  console.warn('[Server] TypeScript loader not available. Some features may not work.');
}

// Log after loadEnv has run
Promise.resolve().then(() => {
  const vars = {
    NODE_ENV: process.env.NODE_ENV || '(not set)',
    dotenvLoaded: true,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY ? 'present' : 'missing',
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY ? 'present' : 'missing',
    GOOGLE_PLACES_API_KEY: !!process.env.GOOGLE_PLACES_API_KEY ? 'present' : 'missing',
    GUEST_MAX_DRAFTS: process.env.GUEST_MAX_DRAFTS != null ? 'set' : 'not set',
  };
  console.log('[env] generation-critical (post-loadEnv):', JSON.stringify(vars));
});
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { printRoutes, requestTap } from './utils/routeInspector.js';
import bodyParser from 'body-parser';
import aiRouter from './routes/ai.js';
import aiImagesRouter from './routes/aiImages.js';
import aiPromoRouter from './routes/aiPromoRoutes.js';
import studioRouter from './routes/studio.js';
import assetsRouter from './routes/assets.js';
import mediaVideoRouter from './routes/mediaVideo.js';
import mediaLogoRouter from './routes/mediaLogo.js';
import trendsRouter from './routes/trends.js';
import screensRoutes from './routes/screens.js';
import playlistsRoutes from './routes/playlists.js';
import playerRoutes from './routes/player.js';
import uploadRoutes from './routes/upload.js';
import homeRoutes from './routes/home.js';
import aiSSERouter from './ai/sse/router.js';
import metricsRouter from './ai/metrics/router.js';
import eventsRouter from './ai/events/router.js';
import suggestionsRouter from './ai/suggestions/router.js';
import workflowsRouter from './routes/workflows.js';
import realtimeRoutes, { openSseStream } from './realtime/sse.js';
import { initializeWebSocketServer, broadcastLog, broadcastEvent } from './realtime/websocket.js';
import { initializeDeviceWebSocketServer } from './realtime/deviceWebSocketHub.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestResponseStateMiddleware } from './middleware/requestResponseState.js';
import { latencyGuard } from './middleware/latencyGuard.js';
import compression from 'compression';
import pairRouter from './routes/pair.js';
import {
  corsOptions,
  CORS_API_ALLOWED_HEADERS_VALUE,
  resolvePreflightAllowHeaders,
  WHITELIST,
  isOriginAllowed,
} from './config/cors.js';
import healthRoutes from './routes/healthRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import { initializeDatabase, testDatabaseConnection, getPrismaClient } from './lib/prisma.js';
import { signalShutdown } from './lib/coreShutdown.js';
import { flushWriteQueue } from './lib/sqliteWriteQueue.js';
import { bootstrapSuperAdmin } from './lib/bootstrapSuperAdmin.js';
import { warnIfMigrationHistoryDirty } from './lib/migrationHealthCheck.js';
import { startHeartbeat, getStatus as getSchedulerStatus } from './scheduler/heartbeat.js';
import { isSseHealthy } from './realtime/sse.js';
import { getOAuthStatus } from './auth/providers.js';
import oauthRoutes from './routes/oauth.js';
import oauthSocialConnectRoutes from './routes/oauthSocialConnectRoutes.js';
import platformRoutes from './routes/platformRoutes.js';
import oauthExtendedPlatformRoutes from './routes/oauthExtendedPlatformRoutes.js';
import oauthGoogleRoutes from './routes/oauthGoogleRoutes.js';
import mcpRoutes from './routes/mcpRoutes.js';
import mcpServerRoutes from './routes/mcpServerRoutes.js';
import adminRoutes from './routes/admin.js';
import adminMediaRoutes from './routes/adminMedia.js';
import adminMetricsRoutes from './routes/adminMetrics.js';
import adminPipelineRoutes from './routes/admin/pipeline.js';
import adminEventsRoutes from './routes/admin/events.js';
import adminCaiRoutes from './routes/admin/cai.js';
import adminPlatformRoutes from './routes/admin/platformOverview.js';
import adminPlatformActivityRoutes from './routes/admin/platformActivityRoutes.js';
import adminPlatformSearchRoutes from './routes/admin/platformSearchRoutes.js';
import adminMultiAgentMonitoringRoutes from './routes/admin/multiAgentMonitoringRoutes.js';
import adminDeepseekDiagnosticRoutes from './routes/admin/deepseekDiagnosticRoutes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import adminAccountManagementRoutes from './routes/admin/accountManagementRoutes.js';
import adminStoreContentManagementRoutes from './routes/admin/storeContentManagementRoutes.js';
import languageRoutes from './routes/languageRoutes.js';
import mediaHealthRoutes from './routes/mediaHealth.js';
import {
  applyUploadsMediaHeaders,
  logMediaStaticResponse,
  resolveUploadContentType,
} from './lib/uploadsStatic.js';
import { startBackgroundWorkers, stopBackgroundWorkers } from './lib/backgroundWorkers.js';
import { startMemoryMonitor } from './lib/memoryMonitor.js';
import { getSseClientCount } from './realtime/simpleSse.js';
import { getPlatformActivityStreamClientCount } from './lib/platformActivity/platformActivityStore.js';
import debugRoutes from './routes/debug.js';
import { createDebugRoutesLite } from './routes/debugRoutesLite.js';
import assistantRouter from './routes/assistant.js';
import contentsRouter from './routes/contents.js';
import contentLibraryRoutes from './routes/contentLibraryRoutes.js';
import universalLibraryRoutes from './routes/universalLibraryRoutes.js';
import universalResourceIntelligenceRoutes from './routes/universalResourceIntelligenceRoutes.js';
import internalRoutes from './routes/internal.js';
import opsRoutes from './routes/opsRoutes.js';
import controlTowerRoutes from './routes/controlTowerRoutes.js';
import ragRoutes from './routes/rag.js';
import reportsRoutes from './routes/reports.js';
import insightsRoutes from './routes/insights.js';
import insightsFeedRoutes from './routes/insights.js';
import journeysRoutes from './routes/journeys.routes.js';
import { runwayLegacyGuard } from './middleware/runwayLegacyGuard.js';
import { intentRoutingStack } from './middleware/intentRoutingMiddleware.js';
import authRoutes, { patchCurrentUserProfile } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import mobileCompatAuthRouter from './routes/mobileCompatAuth.js';
import storesRoutes from './routes/stores.js';
import websiteEditingRoutes from './routes/websiteEditingRoutes.js';
import storeShowsRoutes from './routes/storeShowsRoutes.js';
import spacePostRoutes from './routes/spacePostRoutes.js';
import performerContentEditingBridgeRoutes from './routes/performerContentEditingBridgeRoutes.js';
import storefrontRoutes from './routes/storefrontRoutes.js';
import promosAuthRoutes from './routes/promosAuth.js';
import promosPublicRoutes from './routes/promosPublic.js';
import promotionsRoutes from './routes/promotionsRoutes.js';
import notificationsRoutes from './routes/notifications.js';
import businessRoutes from './routes/business.js';
import businessBrandRoutes from './routes/businessBrandRoutes.js';
import discoveryRoutes from './routes/discoveryRoutes.js';
import businessIngestionRoutes from './routes/businessIngestionRoutes.js';
import discoveryEngineRoutes from './routes/discoveryEngineRoutes.js';
import businessCandidateRoutes from './routes/businessCandidateRoutes.js';
import controlCenterRollbackRoutes from './routes/controlCenterRollbackRoutes.js';
import executiveGrowthRoutes from './routes/executiveGrowthRoutes.js';
import storeGrowthRoutes from './routes/storeGrowthRoutes.js';
import {
  createStoreReadinessRouter,
  createBusinessStudioReadinessRouter,
} from './routes/storeReadinessRoutes.js';
import activityMatrixRoutes from './routes/activityMatrixRoutes.js';
import controlCenterActivityMatrixRoutes from './routes/controlCenterActivityMatrixRoutes.js';
import { serviceCatalogPublicRoutes, quoteRequestOwnerRoutes } from './routes/serviceCatalogRoutes.js';
import {
  accountingDocumentsOwnerRoutes,
  accountingDocumentsPublicRoutes,
} from './routes/accountingDocumentsRoutes.js';
import { bookingOwnerRoutes } from './routes/bookingOwnerRoutes.js';
import { paymentRoutes, journeyPaymentRoutes, paymentOwnerRoutes } from './routes/paymentRoutes.js';
import { handleStripeWebhook } from './lib/payments/paymentWebhookService.js';
import claimBusinessPublicRoutes from './routes/claimBusinessPublicRoutes.js';
import activateBusinessPublicRoutes from './routes/activateBusinessPublicRoutes.js';
import exploreRoutes from './routes/exploreRoutes.js';
import passiveGenerationRoutes from './routes/passiveGenerationRoutes.js';
import automationRoutes from './routes/automation.js';
import productsRoutes from './routes/products.js';
import publicUsersRoutes from './routes/publicUsers.js';
import listingReportRoutes from './routes/listingReportRoutes.js';
import publicHeroPlaybackRoutes from './routes/publicHeroPlaybackRoutes.js';
import publicDiscoveryRoutes from './routes/publicDiscoveryRoutes.js';
import publicFeedRoutes from './routes/publicFeedRoutes.js';
import publicContentInteractionRoutes from './routes/publicContentInteractionRoutes.js';
import storeEngagementRoutes from './routes/storeEngagementRoutes.js';
import publicStoreRoutes from './routes/publicStoreRoutes.js';
import intentFeedRoutes from './routes/intentFeedRoutes.js';
import publicOfferPage from './routes/publicOfferPage.js';
import storefrontPrerenderRoutes from './routes/storefrontPrerenderRoutes.js';
import storefrontSitemapRoutes from './routes/storefrontSitemapRoutes.js';
import marketingVisitRoutes from './routes/public/marketingVisitRoutes.js';
import marketingOperationsRoutes from './routes/admin/marketingOperationsRoutes.js';
import marketIntentAdminRoutes from './routes/admin/marketIntentAdminRoutes.js';
import { Features } from './config/features.js';
import qRedirect from './routes/qRedirect.js';
import miToolsRoutes from './routes/miToolsRoutes.js';
import autoTranslateStoreRoutes from './routes/i18n/autoTranslateStore.js';
import creativeTemplatesRoutes from './routes/creativeTemplates.js';
import greetingCardsRoutes from './routes/greetingCards.js';
import creatorRoutes from './routes/creatorRoutes.js';
import artifactRoutes from './routes/artifactRoutes.js';
import smartDocumentRoutes from './routes/smartDocumentRoutes.js';
import skillSuitcaseRoutes from './routes/skillSuitcaseRoutes.js';
import suitcaseItemRoutes from './routes/suitcaseItemRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import cardRoutes from './routes/cardRoutes.js';
import orchestratorRoutes from './orchestrator/api/orchestratorRoutes.js';
import orchestratorFeedbackRoutes from './routes/orchestratorFeedbackRoutes.js';
import menuPhotoAssignRoutes from './routes/menuPhotoAssign.js';
import loyaltyRoutes from './routes/loyalty.js';
import loyaltyEngineRoutes from './routes/loyaltyRoutes.js';
import watcherRoutes from './routes/watcher.js';
import pilRoutes from './routes/pilRoutes.js';
import businessMemoryRoutes from './routes/businessMemoryRoutes.js';
import intelligenceRoutes from './routes/intelligenceRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import configRoutes from './routes/configRoutes.js';
import observationRoutes from './routes/observationRoutes.js';
import copilotRoutes from './routes/copilotRoutes.js';
import skillRoutes from './routes/skillRoutes.js';
import hookRoutes from './routes/hookRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import layoutRoutes from './routes/layoutRoutes.js';
import reliabilityRoutes from './routes/reliabilityRoutes.js';
import signalRoutes from './routes/signalRoutes.js';
import userMemoryRoutes from './routes/userMemoryRoutes.js';
import betaRoutes from './routes/betaRoutes.js';
import promoEngineRoutes from './routes/promoEngine.js';
import signageEngineRoutes from './routes/signageEngine.js';
import signageRoutes from './routes/signageRoutes.js';
import deviceEngineRoutes from './routes/deviceEngine.js';
import deviceDebugRoutes from './routes/deviceDebug.js';
import deviceAgentRoutes from './routes/deviceAgentRoutes.js';
import signageTestRoutes from './routes/signageTestRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import catalogRoutes from './routes/catalog.js';
import miRoutes from './routes/miRoutes.js';
import miIntentsRoutes from './routes/miIntentsRoutes.js';
import socialRoutes from './routes/socialRoutes.js';
import adminLlmRoutes from './routes/adminRoutes.js';
import draftStoreRoutes from './routes/draftStore.js';
import miniWebsiteRoutes from './routes/miniWebsiteRoutes.js';
import intentGraphRoutes from './routes/intentGraphRoutes.js';
import seedLibraryRoutes from './routes/seedLibrary.js';
import billingRoutes from './routes/billing.js';
import agentMessagesRoutes from './routes/agentMessagesRoutes.js';
import artifactsRoutes from './routes/artifactsRoutes.js';
import agentChatRoutes from './routes/agentChatRoutes.js';
import chatScopeRoutes from './routes/chatScopeRoutes.js';
import chatThreadsRoutes from './routes/chatThreadsRoutes.js';
import threadsRoutes from './routes/threadsRoutes.js';
import contactsSyncRoutes from './routes/contactsSyncRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import aiOperatorRoutes from './routes/aiOperatorRoutes.js';
import missionsRoutes from './routes/missionsRoutes.js';
import confirmationRoutes from './routes/confirmation.routes.js';
import executionRoutes from './routes/executionRoutes.js';
import telemetryRoutes from './routes/telemetryRoutes.js';
import selfHealingRoutes from './routes/selfHealingRoutes.js';
import selfAuditRoutes from './routes/selfAudit.routes.js';
import developmentRoutes from './routes/development.routes.js';
import brokerRoutes from './routes/brokerRoutes.js';
import performerRuntimeRoutes from './routes/performerRuntimeRoutes.js';
import performerDispatchRoutes from './routes/performerDispatchRoutes.js';
import agentsV1Routes from './routes/agentsV1Routes.js';
import researcherRoutes from './routes/researcherRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import campaignsCompatRoutes from './routes/campaignsCompatRoutes.js';
import devContentIngestRoutes from './routes/devContentIngest.js';
import devCreditsRoutes from './routes/devCredits.js';
import truthEnforcerRoutes from './routes/truthEnforcerRoutes.js';
import smartObjectsRoutes from './routes/smartObjects.js';
import qrRoutes from './routes/qr.js';
import miVideoTemplatesRoutes from './routes/miVideoTemplates.js';
import miMusicTracksRoutes from './routes/miMusicTracks.js';
import musicPixabayRoutes from './routes/musicPixabayRoutes.js';
import audioLibraryRoutes from './routes/audioLibraryRoutes.js';
import locationRoutes from './routes/locationRoutes.js';
import rewardRoutes from './routes/reward.js';
import performerRoutes from './routes/performer.js';
import performerTurnRoutes from './routes/performerTurnRoutes.js';
import performerIntakeRoutes from './routes/performerIntakeRoutes.js';
import toolsRoutes from './routes/toolsRoutes.js';
import businessOperationsRoutes from './routes/businessOperationsRoutes.js';
import performerIntakeV2Routes from './routes/performerIntakeV2Routes.js';
import learningRoutes from './lib/learning/learningRoutes.js';
import {
  liveMarketOwnerRoutes,
  liveMarketAdminRoutes,
  liveMarketPublicRoutes,
  liveMarketParticipantRoutes,
  liveMarketMeRoutes,
} from './lib/liveMarket/routes.js';
import {
  globalLiveEoiPublicRoutes,
  globalLiveEoiAdminRoutes,
  globalLiveEoiMeRoutes,
} from './lib/globalLiveEoi/routes.js';
import ctaEngineRoutes from './routes/ctaEngineRoutes.js';
import performerIngestDocumentRoutes from './routes/performerIngestDocumentRoutes.js'; // DANH: skill-round6-document
import visionIntakeRoutes from './routes/visionIntake.js';
import visionDiscoveryRoutes from './routes/visionDiscoveryRoutes.js';
import ghostStoreRoutes, {
  ghostClaimRouter,
  adminGhostRouter,
} from './routes/ghostStoreRoutes.js';
import performerProactiveStepRoutes from './routes/performerProactiveStepRoutes.js';
import runtimeMissionStepRoutes from './routes/runtimeMissionStepRoutes.js';
import runtimeMissionOrchestratorRoutes from './routes/runtimeMissionOrchestratorRoutes.js';
import runtimePrerequisiteRoutes from './routes/runtimePrerequisiteRoutes.js';
import runtimeTargetReadinessRoutes from './routes/runtimeTargetReadinessRoutes.js';
import runtimeSessionRoutes from './routes/runtimeSessionRoutes.js';
import runtimeCapabilitiesRoutes from './routes/runtimeCapabilitiesRoutes.js';
import runtimeDiagnosticsRoutes from './routes/runtimeDiagnosticsRoutes.js';
import diagnosticsRoutes from './routes/diagnosticsRoutes.js';
import systemObservationRoutes from './routes/systemObservationRoutes.js';
import { initRuntimeCapabilities } from './lib/runtime/runtimeCapabilitiesService.js';
import performerMissionsRoutes from './routes/performerMissionsRoutes.js';
import performerDesignRoutes from './routes/performerDesignRoutes.js';
import devApplyPatchRoutes from './routes/devApplyPatchRoutes.js';
import devSystemMissionsRoutes from './routes/devSystemMissions.js';
import devBrokerRuntimeProofRoutes from './routes/devBrokerRuntimeProofRoutes.js';
import { initializeToolsRegistry } from './orchestrator/toolsRegistry.js';
import { validateSystemStartup } from './lib/intake/systemStartupValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fromRoot = (...segments) => path.join(__dirname, ...segments);

console.log("[SERVER] SSE routes loaded");

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const nic of list || []) {
      if (nic && nic.family === 'IPv4' && !nic.internal) return nic.address;
    }
  }
  return '127.0.0.1';
}

const app = express();

// Trust proxy - required for Render and other reverse proxies
// This ensures req.protocol, req.hostname, etc. respect X-Forwarded-* headers
app.set('trust proxy', true);

// Runtime environment validation (ENV-001)
// Log explicit warnings when critical env vars are missing
function validateEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    const publicBase = process.env.PUBLIC_BASE_URL;
    if (!publicBase || publicBase.includes('localhost')) {
      console.warn(
        '[SERVER] WARNING: PUBLIC_BASE_URL is not set or points to localhost in production. QR codes and landing page URLs will be broken.'
      );
    } else {
      console.log('[SERVER] PUBLIC_BASE_URL:', publicBase);
    }

    if (!process.env.JWT_SECRET) {
      console.error('[env] JWT_SECRET is not set in production.');
    }

    logPublicWebBaseOnStartup();
    
    // CDN_BASE_URL optional; log info if missing but only if you expect it
    // (No warning - it's optional)
  }
}

// Validate environment on startup
validateEnvironment();


// SSE headers helper - only sets non-CORS headers
// CORS headers are handled by cors() middleware
function sseHeaders(req, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/** Long-lived SSE endpoints must skip compression and body parsers. */
function isLongLivedSseRequest(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (path.startsWith('/api/stream') || path.startsWith('/api/ai/stream')) return true;
  if (path === '/api/admin/platform/activity/stream') return true;
  if (/^\/api\/stores\/[^/]+\/activity\/stream$/.test(path)) return true;
  if (path.startsWith('/api/public/store-engagement/stream')) return true;
  return false;
}
// Global CORS middleware for all routes EXCEPT SSE routes
// SSE routes handle CORS manually to ensure proper headers for long-lived connections
app.use((req, res, next) => {
  // Skip CORS middleware for SSE routes - they handle CORS manually
  if (isLongLivedSseRequest(req)) {
    return next(); // Skip CORS middleware, let SSE handler set headers manually
  }

  // Static media: never run strict cors() (production whitelist can block LAN tablet origins like
  // 192.168.1.11 while the core API is on 192.168.1.12). ExoPlayer needs GET/HEAD + Range preflight.
  const pathNoQuery = req.originalUrl.split('?')[0];
  if (pathNoQuery.startsWith('/uploads')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    return next();
  }

  const origin = req.headers.origin;
  
  // Apply CORS middleware for all other routes
  return cors(corsOptions)(req, res, (err) => {
    if (err) {
      console.error('[CORS] Error:', err.message, 'Origin:', origin, 'Path:', req.originalUrl);
      // Don't block the request - set permissive CORS headers as fallback
    }
    
    // CRITICAL: Ensure Access-Control-Allow-Origin is ALWAYS set correctly
    // Remove any invalid values (like Referrer Policy values)
    const currentOrigin = res.getHeader('Access-Control-Allow-Origin');
    
    if (!currentOrigin || 
        currentOrigin === 'strict-origin-when-cross-origin' || 
        currentOrigin === 'no-referrer' ||
        currentOrigin === 'origin' ||
        currentOrigin === 'same-origin' ||
        currentOrigin === 'unsafe-url') {
      
      // In development: use * or specific origin
      // In production: use specific origin if allowed, otherwise *
      if (process.env.NODE_ENV !== 'production') {
        // Development: allow all origins
        // Note: Can't use * with credentials, so use the request origin if available
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
          res.setHeader('Access-Control-Allow-Origin', '*');
          // If using *, must set credentials to false
          res.setHeader('Access-Control-Allow-Credentials', 'false');
        }
      } else {
        // Production: use specific origin or *
        if (origin && isOriginAllowed(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Credentials', 'false');
        }
      }
    }
    
    // Ensure all required CORS headers are present
    if (!res.getHeader('Access-Control-Allow-Methods')) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (!res.getHeader('Access-Control-Allow-Headers')) {
      const allowHeaders = resolvePreflightAllowHeaders(req.get('Access-Control-Request-Headers'));
      res.setHeader('Access-Control-Allow-Headers', `${allowHeaders}, Range, If-Range`);
    }
    if (!res.getHeader('Access-Control-Allow-Credentials')) {
      // Only set to true if origin is not *
      const allowOrigin = res.getHeader('Access-Control-Allow-Origin');
      if (allowOrigin && allowOrigin !== '*') {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
    
    next(err);
  });
});

// Global OPTIONS preflight handler - ensures all routes respond correctly to OPTIONS requests
// CRITICAL: This must handle OPTIONS requests BEFORE route handlers for proper CORS preflight
app.options('*', (req, res) => {
  // Skip SSE routes - they handle CORS manually and MUST return 204 for OPTIONS
  if (req.originalUrl.startsWith('/api/stream') || req.originalUrl.startsWith('/api/ai/stream')) {
    return; // Let the route handler handle it
  }

  // Mirror /uploads CORS (Range must be allowed; this runs if anything above skips without ending)
  const optPath = req.originalUrl.split('?')[0];
  if (optPath.startsWith('/uploads')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  const origin = req.headers.origin;
  
  // Set CORS headers for preflight
  if (process.env.NODE_ENV !== 'production') {
    // Development: allow all origins
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  } else {
    // Production: check whitelist
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  const allowHeaders = resolvePreflightAllowHeaders(req.get('Access-Control-Request-Headers'));
  res.setHeader('Access-Control-Allow-Headers', `${allowHeaders}, Range, If-Range`);
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  
  // Return 204 No Content for preflight (CORS spec)
  res.status(204).end();
});
app.use((req, res, next) => {
  if (isLongLivedSseRequest(req)) {
    res.locals = res.locals || {};
    res.locals.skipCompression = true;
  }
  next();
});

// Compression middleware - skips SSE routes and /uploads (Range/206 streaming must not be gzipped)
app.use(compression({
  filter: (req, res) => (
    req.originalUrl.startsWith('/uploads')
      || isLongLivedSseRequest(req) || res?.locals?.skipCompression
      ? false
      : compression.filter(req, res)
  ),
}));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const LAN = getLanIp();

  // Normalize double slashes in URLs (defensive fix for APK bug)
  app.use((req, res, next) => {
    // Log original URL for debugging
    if (req.originalUrl.includes('//') && !req.originalUrl.match(/^https?:\/\//)) {
      console.warn('[URL_FIX] Double slash detected in URL:', req.originalUrl);
      
      // Normalize double slashes in path (preserve protocol)
      const normalized = req.originalUrl.replace(/([^:])\/\/+/g, '$1/');
      req.originalUrl = normalized;
      req.url = req.url.replace(/([^:])\/\/+/g, '$1/');
      console.log('[URL_FIX] Normalized to:', req.originalUrl);
    }
    
    console.log('[REQ]', req.method, req.originalUrl);
    next();
  });

app.use((err, req, res, next) => {
  if (err instanceof Error && (err.message.startsWith('Origin not allowed') || err.message.startsWith('CORS blocked origin'))) {
    console.warn('[CORS] 403 (origin rejected)', {
      path: req.originalUrl,
      method: req.method,
      origin: req.headers.origin || '(none)',
      referer: req.headers.referer || '(none)',
      host: req.headers.host || '(none)',
      message: err.message,
    });
    return res.status(403).json({ ok: false, error: 'origin_not_allowed', message: err.message });
  }
  return next(err);
});

// Baseline health routes (immediately after CORS preflight, before any other middleware)
// These routes are accessible before any other middleware to help diagnose connection issues
app.get('/__ping', (_req, res) => {
  console.log('[HEALTH] Ping request received');
  res.type('text').send('pong');
});
app.get('/__whoami', (_req, res) => {
  console.log('[HEALTH] Whoami request received');
  res.json({
    file: import.meta.url,
    cwd: process.cwd(),
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
    role: process.env.ROLE || 'api',
    startedAt: new Date().toISOString(),
    cors: {
      allowedOrigins: Array.from(WHITELIST || [])
    }
  });
});
// Simple health check (legacy) — prefer GET /api/health?full=true
app.get('/health', (_req, res) => {
  console.warn('[DEPRECATED] GET /health — use GET /api/health?full=true');
  res.status(200).json({ ok: true, deprecated: true, use: '/api/health?full=true' });
});

app.get('/robots.txt', (_req, res) => {
  const publicOrigin = publicCanonicalWebBase();
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /s/',
      'Allow: /p/',
      'Allow: /sitemap-stores.xml',
      'Disallow: /api/',
      'Disallow: /api/stream',
      'Disallow: /api/performer/',
      'Disallow: /api/missions/',
      'Allow: /api/health',
      '',
      'User-agent: PetalBot',
      'Disallow: /',
      '',
      `Sitemap: ${publicOrigin}/sitemap.xml`,
      `Sitemap: ${publicOrigin}/sitemap-stores.xml`,
    ].join('\n'),
  );
});

/*
 * MIDDLEWARE ORDER (all requests except health/SSE):
 * 1. CORS (per-route skip for /api/stream)
 * 2. cookieParser()                    <- cookies available for auth (OAuth) and optionalAuth
 * 3. Body: jsonParser / urlencoded     <- req.body available; no auth resolution here
 * 4. requestTap("SERVER")              <- logs /api/stream only; does not touch req.user
 * 5. Request logging (method, path)   <- does not touch req.user
 * 6. Static /uploads, /catalog-cutouts, /assets
 * 7. API route mounts (e.g. app.use('/api/campaign', campaignRoutes))
 *
 * Auth resolution: There is NO global auth middleware. Auth runs per-route via requireAuth
 * (and optionalAuth) when the request hits a route that uses them. For POST /api/campaign/create-from-plan,
 * the order is: campaignRoutes matched -> requireAuth runs (reads Authorization: Bearer, sets req.user) -> handler runs.
 * Ensure proxy forwards Authorization header so requireAuth can set req.user.
 */
app.use(cookieParser()); // Parse cookies for OAuth

// Stripe webhook — MUST use raw body (before express.json)
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return res.status(400).send('Missing stripe-signature header');
      }
      const result = await handleStripeWebhook(req.body, signature);
      return res.json(result);
    } catch (err) {
      if (err?.code === 'INVALID_SIGNATURE') {
        return res.status(400).send('Invalid signature');
      }
      console.error('[payments/webhook]', err?.message ?? err);
      return res.status(500).json({ ok: false, error: 'webhook_error' });
    }
  },
);

// Body parsing middleware - skip for SSE routes
// Increased limits to 50MB to handle large content payloads (designs with many elements, images, etc.)
const jsonParser = express.json({ limit: '50mb' });
const urlencodedParser = express.urlencoded({ limit: '50mb', extended: true });

app.use((req, _res, next) => {
  if (req.originalUrl.startsWith('/api/api/')) {
    req.url = req.url.replace(/^\/api\//, '/');
  }
  next();
});

app.use((req, res, next) => {
  try {
    // Log all requests to debug connection issues
    if (req.method === 'GET' && !req.path.startsWith('/uploads')) {
      console.log('[MIDDLEWARE] Before jsonParser:', req.method, req.path, req.url);
    }
    // Skip body parsing for SSE routes - use originalUrl to catch routes mounted at /api
    if (isLongLivedSseRequest(req)) {
      return next(); // Skip body parsing for SSE
    }
    jsonParser(req, res, (err) => {
      if (err) {
        console.error('[MIDDLEWARE] jsonParser error:', err);
        // Handle payload too large errors (413)
        if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
          return res.status(413).json({
            ok: false,
            error: 'payload_too_large',
            message: 'Request body exceeds maximum size limit (50MB). Please reduce image sizes or element count.',
          });
        }
      }
      next(err);
    });
  } catch (e) {
    console.error('[MIDDLEWARE] jsonParser wrapper error:', e);
    next(e);
  }
});

app.use((req, res, next) => {
  try {
    // Skip body parsing for SSE routes - use originalUrl to catch routes mounted at /api
    if (isLongLivedSseRequest(req)) {
      return next(); // Skip body parsing for SSE
    }
    urlencodedParser(req, res, (err) => {
      if (err) {
        console.error('[MIDDLEWARE] urlencodedParser error:', err);
        // Handle payload too large errors (413)
        if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
          return res.status(413).json({
            ok: false,
            error: 'payload_too_large',
            message: 'Request body exceeds maximum size limit (50MB). Please reduce image sizes or element count.',
          });
        }
      }
      next(err);
    });
  } catch (e) {
    console.error('[MIDDLEWARE] urlencodedParser wrapper error:', e);
    next(e);
  }
});

// Request ID + latency SLO guard (skips SSE/long-lived routes)
app.use(requestIdMiddleware);
app.use(requestResponseStateMiddleware);
app.use(latencyGuard);

// EARLY request logger with SSE tap
app.use(requestTap("SERVER"));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${req.url}`);
  next();
});

// Legacy runway usage warnings (non-blocking). See docs/RUNWAY_OWNERSHIP.md
app.use(runwayLegacyGuard);

// Intent routing classification (metadata only — does not intercept route handlers)
app.use(intentRoutingStack);

// Example: Broadcast log message (can be called from anywhere in the app)
// This demonstrates how to use the WebSocket broadcast functionality
// Example usage:
//   import { broadcastLog, broadcastEvent } from './realtime/websocket.js';
//   broadcastLog('info', 'Server started', { timestamp: Date.now() });
//   broadcastEvent('screen.updated', { screenId: '123', status: 'online' });

// Serve uploads reliably (before routes)
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// OPTIONS for /uploads is handled in the global CORS middleware (before app.options('*')) so Range is allowed

// Explicit video route (narrow) BEFORE express.static to ensure correct Range semantics in all browsers.
app.all(['/uploads/media/:filename', '/uploads/media/:filename/*'], (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end();
  }
  try {
    const mediaDir = path.join(uploadsDir, 'media');
    const relative = String(req.path || '')
      .replace(/^\/uploads\/media\/?/, '')
      .split('?')[0];
    const segments = relative
      .split('/')
      .filter(Boolean)
      .map((segment) => path.basename(segment));
    if (!segments.length) {
      return next();
    }
    const filePath = path.join(mediaDir, ...segments);
    const normalizedMediaDir = path.normalize(mediaDir + path.sep);
    const normalizedFilePath = path.normalize(filePath);
    if (
      normalizedFilePath !== path.normalize(mediaDir) &&
      !normalizedFilePath.startsWith(normalizedMediaDir)
    ) {
      return res.status(403).end();
    }

    const exists = fs.existsSync(filePath);
    let stat = null;
    try {
      if (exists) stat = fs.statSync(filePath);
    } catch {
      stat = null;
    }
    const size = stat?.isFile() ? stat.size : null;

    const range = req.headers.range ? String(req.headers.range) : null;
    console.log('[media-video] request', {
      file: segments.join('/'),
      exists,
      size,
      range,
    });

    if (!exists || !stat?.isFile() || !size) {
      console.log('[media-video] response', {
        status: 404,
        contentType: 'video/mp4',
        contentRange: null,
        contentLength: null,
      });
      return next();
    }

    // Always set the required CORS + Range headers for <video>.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Accept-Ranges', 'bytes');
    // Inline required for iOS Safari <video>; "attachment" breaks playsInline playback.
    res.setHeader('Content-Disposition', 'inline');

    const contentTypeInfo = resolveUploadContentType(filePath, req.path);
    res.setHeader('Content-Type', contentTypeInfo?.type || 'video/mp4');

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(size));
      console.log('[media-video] response', {
        status: 200,
        contentType: res.getHeader('Content-Type') ?? null,
        contentRange: null,
        contentLength: size,
      });
      return res.status(200).end();
    }

    if (range && range.startsWith('bytes=')) {
      const m = range.replace(/^bytes=/, '').match(/^(\d*)-(\d*)$/);
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : size - 1;
        const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
        const safeEnd = Number.isFinite(end) ? Math.min(size - 1, end) : size - 1;
        const chunkSize = safeEnd - safeStart + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${safeStart}-${safeEnd}/${size}`);
        res.setHeader('Content-Length', String(chunkSize));

        console.log('[media-video] response', {
          status: 206,
          contentType: res.getHeader('Content-Type') ?? null,
          contentRange: res.getHeader('Content-Range') ?? null,
          contentLength: chunkSize,
        });

        return fs
          .createReadStream(filePath, { start: safeStart, end: safeEnd })
          .pipe(res);
      }
    }

    res.setHeader('Content-Length', String(size));
    console.log('[media-video] response', {
      status: 200,
      contentType: res.getHeader('Content-Type') ?? null,
      contentRange: null,
      contentLength: size,
    });
    return fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.warn('[media-video] handler failed', e?.message || e);
    return next();
  }
});

app.use('/uploads', (req, res, next) => {
  res.locals.requestPath = req.path;
  res.on('finish', () => logMediaStaticResponse(req, res));
  next();
});

app.use('/uploads', express.static(uploadsDir, {
  fallthrough: true,
  etag: true,
  lastModified: true,
  immutable: true,
  maxAge: '365d',
  setHeaders(res, filePath, stat) {
    const cleanPath = filePath ? filePath.split('?')[0] : '';
    const ext = path.extname(cleanPath).toLowerCase();
    const contentTypeInfo = resolveUploadContentType(filePath, res.locals?.requestPath);

    if (!ext && stat?.isFile()) {
      console.warn('[server] No extension for static file:', cleanPath);
    }

    const contentType = contentTypeInfo?.type ?? null;
    applyUploadsMediaHeaders(res, contentType);

    if (!contentType && !res.getHeader('Content-Type')) {
      console.warn('[server] Unable to determine Content-Type for:', cleanPath);
    }
  },
}));

// Handle 404 for optimized videos - log but don't crash
app.use('/uploads/optimized', (req, res, next) => {
  // If file not found by static middleware, log it
  if (req.method === 'GET' || req.method === 'HEAD') {
    const filePath = path.join(uploadsDir, 'optimized', path.basename(req.path));
    if (!fs.existsSync(filePath)) {
      console.warn(`[UPLOADS] Optimized file not found: ${req.path} (Render ephemeral filesystem - file lost on redeploy)`);
      // Return 404 - device should fallback to original URL
      return res.status(404).json({ 
        error: 'file_not_found', 
        message: 'Optimized file not available (may have been lost on server restart)',
        path: req.path 
      });
    }
  }
  next();
});

// Serve static assets library (temporary local storage before S3)
const publicAssetsDir = path.join(process.cwd(), 'public', 'assets');
if (!fs.existsSync(publicAssetsDir)) fs.mkdirSync(publicAssetsDir, { recursive: true });

// Serve catalog cutouts directory
const catalogCutoutsDir = path.join(process.cwd(), 'public', 'catalog-cutouts');
if (!fs.existsSync(catalogCutoutsDir)) fs.mkdirSync(catalogCutoutsDir, { recursive: true });
app.use('/catalog-cutouts', express.static(catalogCutoutsDir, {
  fallthrough: true,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath && path.extname(filePath).toLowerCase() === '.png') {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

app.use('/assets', express.static(publicAssetsDir, {
  fallthrough: true,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // Basic long-lived caching for static library files
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Allow cross-origin reads for dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Ensure correct Content-Type for images
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.png') {
        res.setHeader('Content-Type', 'image/png');
      } else if (ext === '.jpg' || ext === '.jpeg') {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (ext === '.gif') {
        res.setHeader('Content-Type', 'image/gif');
      } else if (ext === '.webp') {
        res.setHeader('Content-Type', 'image/webp');
      } else if (ext === '.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
    }
  }
}));

// Cardbey Originals HOSTED video/audio under public/videos (same CORS as /assets)
const publicVideosDir = path.join(process.cwd(), 'public', 'videos');
if (!fs.existsSync(publicVideosDir)) fs.mkdirSync(publicVideosDir, { recursive: true });
app.use('/videos', express.static(publicVideosDir, {
  fallthrough: true,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      else if (ext === '.webm') res.setHeader('Content-Type', 'video/webm');
      else if (ext === '.mp3') res.setHeader('Content-Type', 'audio/mpeg');
      else if (ext === '.wav') res.setHeader('Content-Type', 'audio/wav');
    }
  },
}));

const autoLayoutToolPath = path.join(process.cwd(), 'public', 'auto-layout-tool.html');
app.get('/tools/auto-layout', (_req, res) => {
  if (fs.existsSync(autoLayoutToolPath)) {
    return res.sendFile(autoLayoutToolPath);
  }
  return res.status(404).json({ ok: false, error: 'auto_layout_tool_not_found' });
});

// SSE routes are handled by realtimeRoutes (mounted at /api)
// The fallback handler below is kept for compatibility but should not be needed
// since realtimeRoutes handles /api/stream

// MOUNT EARLY (before other routers and before any SPA fallback)
// Runway ownership map: docs/RUNWAY_OWNERSHIP.md
app.use('/api', realtimeRoutes);
app.use('/api', screensRoutes);
app.use('/api', healthRoutes); // Health endpoints: /api/health, /api/healthz, /api/readyz
// Also mount healthRoutes at root level for /healthz and /readyz (single source of truth)
app.use(healthRoutes); // Makes /healthz and /readyz available at root level
// Mobile compat auth at root: POST /users, POST /oauth/login, GET /oauth/me, POST /password/request, POST /password/reset, POST /auth/google|facebook (501)
app.use(mobileCompatAuthRouter);
app.use('/api/auth', authRoutes); // Authentication routes: /api/auth/register, /api/auth/login, /api/auth/me
app.patch('/api/users/me', requireAuth, patchCurrentUserProfile); // Alias for PATCH /api/auth/profile (personal profile Phase 1)
app.patch('/api/users/me/profile', requireAuth, patchCurrentUserProfile);
// Performer intake: mount before any `app.use('/api', …)` stack so POST /api/performer/intake is never swallowed (404) or mis-logged.
app.use('/api/performer/intake', performerIntakeRoutes);
app.use('/api/performer', performerDispatchRoutes);
app.use('/api/performer/runtime', performerRuntimeRoutes); // Phase 1.5: stream + state
app.use('/api/tools', toolsRoutes);
app.use('/api/business-operations', businessOperationsRoutes);
// Mount before broad /api routers and /api/assistant so POST /api/missions/* (e.g. extract-card) hits this stack first.
// Mount before /api/missions so unified execution checkpoint API is registered first.
app.use('/api/execution', executionRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api', confirmationRoutes);
app.use('/api/performer/intake/v2', performerIntakeV2Routes);
app.use('/api/cta', ctaEngineRoutes); // CTA Engine Phase 2: evaluate / dismiss / events
app.use('/api/learning', learningRoutes);
app.use('/api/performer', performerIngestDocumentRoutes); // DANH: skill-round6-document — POST /ingest-document
app.use('/api/vision', visionIntakeRoutes);
app.use('/api/vision', visionDiscoveryRoutes);
app.use('/api/ghost-stores', ghostStoreRoutes);
app.use('/api/stores', ghostClaimRouter);
app.use('/api', userMemoryRoutes);
app.use('/api', betaRoutes);
app.use('/api/performer/proactive-step', performerProactiveStepRoutes);
app.use('/api/runtime/missions', runtimeMissionStepRoutes);
app.use('/api/runtime/missions', runtimeMissionOrchestratorRoutes);
app.use('/api/runtime/missions', runtimePrerequisiteRoutes);
app.use('/api/runtime/target', runtimeTargetReadinessRoutes);
app.use('/api/runtime/session', runtimeSessionRoutes);
app.use('/api/runtime/capabilities', runtimeCapabilitiesRoutes);
app.use('/api/runtime', runtimeDiagnosticsRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/system-observation', systemObservationRoutes);
initRuntimeCapabilities();
app.use('/api/performer/missions', performerMissionsRoutes);
app.use('/api/performer/design', performerDesignRoutes);
app.use('/api/dev', devApplyPatchRoutes);
app.use('/api/dev', devSystemMissionsRoutes);
// Dev-only proof endpoints: never mount in production.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev/broker', devBrokerRuntimeProofRoutes);
}
app.use('/api/performer', performerTurnRoutes); // Canonical POST /turn (reason-only; before other performer routes)
app.use('/api/performer/content-editing-bridge', performerContentEditingBridgeRoutes); // Phase 2 bridge (flag-gated)
app.use('/api/performer', performerRoutes); // Performer app routes (lastSession, share, etc.)
app.use('/api/stores', websiteEditingRoutes); // Phase 0 Website Editing context (before :storeId catch-alls)
app.use('/api/stores', storeShowsRoutes); // Phase 1 Shows / Featured Content management
app.use('/api/stores', spacePostRoutes); // Space Post V1: POST /:storeId/space-updates
app.use('/api/stores', storesRoutes); // Store management routes: /api/stores, /api/stores/:storeId/promos
app.use('/api/stores', liveMarketOwnerRoutes); // Live Market owner sessions (flag-gated)
app.use('/api/live-market', liveMarketParticipantRoutes); // Live Market participant registration (flag-gated)
app.use('/api/me/live-market', liveMarketMeRoutes); // Live Market my registrations (flag-gated)
app.use('/api/me/global-live', globalLiveEoiMeRoutes); // Global Live EOI applicant applications (flag-gated)
app.use('/api/notifications', notificationsRoutes); // GET /api/notifications, POST /api/notifications/:id/read
app.use('/api/store', storesRoutes); // Store context routes: /api/store/context, /api/store/:id/context
app.use('/api/storefront', storefrontRoutes); // Published store feed: GET /api/storefront/frontscreen (no draft dependency)
app.use('/api/promos', promosAuthRoutes); // Auth: POST, GET ?storeId=, PATCH /:id
app.use('/api/public/promos', promosPublicRoutes); // Public: GET /:slug, POST /:slug/scan
app.use('/api/promotions', promotionsRoutes); // Public: GET /public/:publicId; slots resolve; optional POSTs
app.use('/api/business', businessRoutes); // Business Builder routes: /api/business/create
app.use('/api/business', businessBrandRoutes); // GET/PATCH /api/business/:storeId/brand
app.use('/api/discovery', discoveryRoutes); // Business Discovery/Ingestion: search/import/claim/generate-channel
app.use('/api/business-ingestion', businessIngestionRoutes); // Bulk factual business ingestion pipeline
app.use('/api/discovery-engine', discoveryEngineRoutes); // Discovery Engine V1 — candidates → seeds
app.use('/api/business-candidates', businessCandidateRoutes); // Performer-first BusinessCandidate pilot
app.use('/api/control-center/rollback', controlCenterRollbackRoutes); // Discovery rollback (admin)
app.use('/api/executive/growth', executiveGrowthRoutes); // Executive Growth Command Center (platform admin)
app.use('/api/stores/:storeId/growth', storeGrowthRoutes); // Store-scoped Business Growth Center (owner only)
app.use('/api/stores/:storeId/readiness', createStoreReadinessRouter()); // Store Readiness V1 (owner; ENABLE_STORE_READINESS_V1)
app.use('/api/business-studio/stores/:storeId/readiness', createBusinessStudioReadinessRouter());
app.use('/api/business/insights', activityMatrixRoutes); // User Activity Matrix (store owner)
app.use('/api/control-center/activity-matrix', controlCenterActivityMatrixRoutes); // Platform-wide matrix (admin)
app.use('/api/stores/:storeId/quote-requests', quoteRequestOwnerRoutes); // Owner quote request management
app.use('/api/stores/:storeId/accounting', accountingDocumentsOwnerRoutes); // Accounting Documents V1
app.use('/api/public', accountingDocumentsPublicRoutes); // Opaque share tokens for Quote/Invoice
app.use('/api/stores/:storeId/bookings', bookingOwnerRoutes); // Owner bookings + payment status
app.use('/api/stores/:storeId/payments', paymentOwnerRoutes); // Owner payment list
app.use('/claim-business', claimBusinessPublicRoutes); // Public claim preview for ingestion seeds
app.use('/api/claim-business', claimBusinessPublicRoutes); // Dev proxy alias (/api → core)
app.use('/activate-business', activateBusinessPublicRoutes);
app.use('/api/activate-business', activateBusinessPublicRoutes);
app.use('/api/explore', exploreRoutes); // Featured explore videos: GET/POST/PATCH/DELETE /api/explore/videos
app.use('/api/passive-generation', passiveGenerationRoutes); // Passive intent-to-artifact pipeline (foundation)
app.use('/api/automation', automationRoutes); // Headless automation: /api/automation/store-from-input
app.use('/api', autoTranslateStoreRoutes); // Auto-translate routes: /api/stores/:storeId/translate
app.use('/api/products', productsRoutes); // Product management routes: /api/products
app.use('/api/creative-templates', creativeTemplatesRoutes); // Creative template routes: /api/creative-templates
app.use('/api/greeting-cards', greetingCardsRoutes); // Greeting card routes: /api/greeting-cards
app.use('/api/artifacts', artifactRoutes);
app.use('/api', creatorRoutes); // Creator Foundation: /api/creators, /api/creator/*
app.use('/api/loyalty', loyaltyRoutes); // Loyalty program routes: /api/loyalty/programs, /api/loyalty/stamp/*
app.use('/api/loyalty', loyaltyEngineRoutes); // Loyalty engine routes: /api/loyalty/program, /api/loyalty/assets, etc.
app.use('/api/watcher', watcherRoutes); // System watcher routes: /api/watcher/event, /api/watcher/insights, /api/watcher/chat
app.use('/api/pil', pilRoutes); // PIL intelligence events: POST /api/pil/events, /api/pil/events/batch
app.use('/api/pil/business-memory', businessMemoryRoutes); // Phase 4: observation → outcome memory
app.use('/api/intelligence', intelligenceRoutes); // Foundation: /health, /memory, /express, /metrics (requires jsonParser above)
if (process.env.USE_UNIFIED_MEMORY !== 'false') {
  app.use('/api/memory', memoryRoutes); // Unified memory facade: /bundle, /invalidate
  app.use('/api/config', configRoutes);
  app.use('/api/observations', observationRoutes); // Runtime observation bus read API
  app.use('/api/signals', signalRoutes); // Signal configuration: /status, /preferences
}
app.use('/api/copilot', copilotRoutes); // Proactive copilot suggestions (governed handoff)
app.use('/api/skills', skillRoutes); // Composable skills registry + execution
app.use('/api/hooks', hookRoutes); // Lifecycle hooks registry + test
app.use('/api/agents', agentRoutes); // Sub-agent registry, orchestration, message bus
app.use('/api/layout', layoutRoutes); // General layout engine: POST /apply, GET /types
app.use('/api/reliability', reliabilityRoutes); // P6: auto-heal, rate limits, bulkhead, SLO, alerts
app.use('/api/conversations', conversationRoutes); // Phase 0 — continuous Performer conversation sessions
app.use('/api/promo/engine', promoEngineRoutes); // Promo engine routes: /api/promo/engine/preview, /api/promo/engine/apply, etc.
app.use('/api/signage/engine', signageEngineRoutes); // Signage engine routes: /api/signage/engine/build-playlist, /api/signage/engine/apply-schedule, etc.
app.use('/api', signageRoutes); // Signage REST API routes: /api/signage-assets, /api/signage-playlists, etc.
app.use('/api/signage', signageTestRoutes); // Signage test routes (dev-only): /api/signage/test-playlist
// Production-critical: mission events + intents (GET /api/mi/missions/:id/events, POST intents, run). Required for live mission execution.
app.use('/api/mi', miIntentsRoutes); // M1.5 Mission Inbox: /api/mi/missions/:missionId/intents, GET .../events (must be before miRoutes)
app.use('/api/mi', miRoutes); // MI orchestrator routes: /api/mi/orchestrator/signage-playlists/:playlistId/suggestions
app.use('/api/social', socialRoutes); // Placeholder: POST /api/social/connect/:provider (mock only)
app.use('/api/admin', adminLlmRoutes); // Admin: GET /api/admin/llm/health (requireAuth + requireAdmin)
app.use('/api/mi/video-templates', miVideoTemplatesRoutes); // MI video template routes: /api/mi/video-templates
app.use('/api/mi/music-tracks', miMusicTracksRoutes); // MI music track routes: /api/mi/music-tracks
app.use('/api/music', musicPixabayRoutes); // Pixabay music: /api/music/pixabay/search|select
app.use('/api/audio', audioLibraryRoutes); // Cardbey Audio Library: /api/audio/search|download|library
app.use('/api/location', locationRoutes); // OSM geocode: /api/location/geocode, /api/location/reverse-geocode
app.use('/api/device', deviceEngineRoutes); // Device engine routes: /api/device/list, /api/device/request-pairing, etc.
if (process.env.NODE_ENV !== 'test') {
  console.log(
    '[CORE] Device pairing: POST /api/device/request-pairing | POST /api/device/pair-request | ' +
      'POST /api/device/complete-pairing | legacy TV shim POST /api/screens/pair/initiate'
  );
}
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/device/debug', deviceDebugRoutes); // Device debug routes (dev only): /api/device/debug/list-all
}
app.use('/api/devices', deviceAgentRoutes); // Device agent routes: /api/devices/register, /api/devices/:deviceId/heartbeat, etc.
app.use('/api/menu', menuRoutes); // Menu engine routes: /api/menu/configure-from-photo
app.use('/api/catalog', catalogRoutes); // Catalog SAM-3 processing routes: /api/catalog/process, /api/catalog/reprocess-all
app.use('/api/public/store', publicStoreRoutes); // Draft alias: GET /api/public/store/:storeId/draft (before /api/public)
app.use('/api/public/stores', intentFeedRoutes); // Intent feed: GET /api/public/stores/:storeId/intent-feed (no auth)
app.use('/api/public/stores', serviceCatalogPublicRoutes); // Service catalog + quote requests (public)
app.use('/api/public/stores', journeyPaymentRoutes); // Journey submit + payment prepare
app.use('/api/payments', paymentRoutes); // Stripe PaymentIntent, checkout, status
app.use('/api/public/content-interactions', publicContentInteractionRoutes);
app.use('/api/public/store-engagement', storeEngagementRoutes);
app.use('/api/public-feed', publicFeedRoutes); // GET /api/public-feed/sidebar
app.use('/api/public', publicDiscoveryRoutes); // GET /api/public/discovery/businesses
app.use('/api/public', publicHeroPlaybackRoutes); // GET /api/public/media/hero-playback/:token
app.use('/api/public', listingReportRoutes); // POST /api/public/listings/:slug/report
app.use('/api/public', publicUsersRoutes); // /api/public/users/:handle, /api/public/stores/:slug, /api/public/profile/:slug
app.use('/api/public/live-market', liveMarketPublicRoutes); // Live Market public session read (flag-gated)
app.use('/api/public/global-live', globalLiveEoiPublicRoutes); // Global Live pilot EOI (flag-gated; default OFF)
if (Features.marketingOperator.v1) {
  app.use('/api/public/marketing', marketingVisitRoutes); // POST /api/public/marketing/visits
  console.log('[CORE] mounted /api/public/marketing (visit attribution; ENABLE_MARKETING_OPERATOR_V1)');
}

// MI Tool Contract v1 (additive; does not touch store creation/draft/publish)
const miOpenApiPath = fromRoot('..', 'openapi', 'mi-tools.v1.yaml');
app.get('/mi/openapi.yaml', (req, res) => {
  if (!fs.existsSync(miOpenApiPath)) {
    return res.status(404).type('text/plain').send('OpenAPI spec not found');
  }
  res.type('text/yaml').send(fs.readFileSync(miOpenApiPath, 'utf8'));
});
app.use('/mi/v1', miToolsRoutes);
app.use('/api/orchestrator', orchestratorRoutes); // Orchestrator routes: /api/orchestrator/run
app.use('/api/orchestrator-runs', orchestratorFeedbackRoutes); // Feedback: POST /api/orchestrator-runs/:id/feedback (requireAuth)
app.use('/api', menuPhotoAssignRoutes); // Menu photo assignment routes: /api/menu-photo-assign
app.use('/api/system', systemRoutes); // System routes: /api/system/metrics, /api/system/diagnose, /api/system/events/recent, /api/system/repair/*
console.log('[CORE] Routes: /health, /healthz, /readyz, /api/ping, /api/health, /api/stream, /api/screens/*, /api/playlists/*');
app.use('/api/ai', aiRouter);
app.use('/api/ai', aiPromoRouter);
app.use('/api/ai/images', aiImagesRouter);
app.use('/api/studio', studioRouter);
// Production-critical: store mission Phase 0 create/summary/generate. Same DB for create and read (single DATABASE_URL).
app.use('/api/draft-store', draftStoreRoutes); // Canonical store draft runway — POST /, GET /:draftId/summary, generate, commit
app.use('/api/store-draft', draftStoreRoutes); // LEGACY alias (same router); runwayLegacyGuard logs — prefer /api/draft-store
app.use('/api/journeys', journeysRoutes); // Journey templates, instances, planner, analytics (was unmounted — smoke: GET /templates)
app.use('/api/mini-website', miniWebsiteRoutes); // POST /publish/cardbey (same as store publish), custom-domain stub
app.use('/api/intent-graph', intentGraphRoutes); // Intent Graph v1: POST /build, GET /suggestions?draftId=|storeId=
app.use('/api', seedLibraryRoutes); // Seed Library: GET /api/seed-library/placeholder?vertical=&categoryKey=&orientation=
app.use('/api/billing', billingRoutes); // Billing: GET /api/billing/balance (requireAuth)
app.use('/api', agentMessagesRoutes); // Agent messages: POST/GET /api/agent-messages (requireAuth)
app.use('/api/artifacts', artifactsRoutes); // Artifact signed URL refresh: POST /api/artifacts/:artifactId/refresh-url (requireAuth)
app.use('/api/agent-chat', agentChatRoutes); // Agent chat: POST /api/agent-chat/attachments/ocr (requireAuth)
app.use('/api/chat', chatScopeRoutes); // Resolve scope first: POST /api/chat/resolve-scope (requireAuth)
app.use('/api/chat', chatThreadsRoutes); // Chat threads: POST/GET /api/chat/threads (requireAuth)
app.use('/api/threads', threadsRoutes); // Conversation threads: GET/POST /api/threads, GET /api/threads/:id (requireAuth)
if (process.env.ENABLE_CONTACT_SYNC === 'true') {
  app.use('/api', contactsSyncRoutes); // Contact Sync (Phase 1 MVP)
}
app.use('/api', connectionRoutes); // User↔user connections (Phase B)
app.use('/api/ai-operator', aiOperatorRoutes); // AI Operator: POST/GET /api/ai-operator/missions/:missionId/start, /status (requireAuth)
app.use('/api/telemetry', telemetryRoutes); // Mission Console: GET /api/telemetry/summary (requireAuth; in-memory + DB sample)
app.use('/api/self-healing', selfHealingRoutes); // admin_tool_discovery → governed code_fix proposals (super_admin)
app.use('/api/self-audit', selfAuditRoutes); // Self-audit: status, run, fix proposals (admin)
app.use('/api', developmentRoutes); // Development Runtime: /api/development/*
console.log('[CORE] mounted /api/telemetry (GET /summary, POST /code-fix-proposal)');
console.log('[CORE] mounted /api/self-healing (GET /discovery-gaps, POST /propose-from-discovery)');
console.log('[CORE] mounted /api/self-audit (GET /status, POST /run, POST /fix/:issueId)');
app.use('/api/broker', brokerRoutes); // Broker Phase 1: GET /api/broker/actions, /agent-capabilities
// missionsRoutes mounted earlier (after /api/tools) so /api/missions/* is not swallowed by other /api stacks.
// Second stack: POST /api/missions/:missionId/spawn (OpenClaw child) when not defined on missionsRoutes
app.use('/api/missions', agentsV1Routes);
app.use('/api/agents/researcher', researcherRoutes); // Researcher agent: POST /api/agents/researcher (optionalAuth)
app.use('/api/campaign', campaignRoutes); // Campaign Phase A: POST /api/campaign/validate-scope (requireAuth)
app.use('/api/smart-objects', smartObjectsRoutes); // Smart Object: create, get by id/publicCode, set active-promo
app.use('/api/qr', qrRoutes); // Dynamic QR v0: POST create, GET :code/resolve, PATCH :code
app.use('/q', qRedirect); // GET /q/:code — 302 redirect, record ScanEvent + IntentSignal (no auth)
app.use('/p', publicOfferPage); // GET /p/:storeSlug/offers/:offerSlug — public offer page (no auth)
// Store bot prerender is mounted immediately before SPA catch-all (see below).
app.use(storefrontSitemapRoutes); // GET /sitemap-stores.xml — published store URLs
app.use('/api/docs', smartDocumentRoutes); // Smart documents + suitcase list: GET/POST /api/docs
app.use('/api/suitcase', skillSuitcaseRoutes); // DANH: suitcase-skill-output — skill reports + mission history
app.use('/api/suitcase', suitcaseItemRoutes); // Phase 10 — account knowledge vault items CRUD
app.use('/api/cards', cardRoutes); // Digital cards (buildCard): GET /api/cards, visitor chat, etc.
app.use('/api/contents', contentsRouter); // Content Studio CRUD routes
app.use('/api/content-library', contentLibraryRoutes); // Logo / brand kit library (SVGRepo + Brandfetch)
app.use('/api/universal-library', universalLibraryRoutes); // Universal Library catalogue + population
app.use('/api/resource-intelligence', universalResourceIntelligenceRoutes); // URI reuse / federation
app.use('/api/assets', assetsRouter);
app.use('/api/media', mediaVideoRouter); // Multi-source video search: GET /api/media/video/search (Pexels, Pixabay, Coverr, Mixkit)
app.use('/api/media', mediaLogoRouter); // Logo search + generation: GET /api/media/logo/search, POST /api/media/logo/generate
app.use('/api/trends', trendsRouter); // Trend profiles for AI Design Assistant
app.use('/api/playlists', playlistsRoutes); // Playlist management
app.use('/api/player', playerRoutes); // Player configuration
app.use('/api/upload', uploadRoutes); // File uploads
app.use('/api/uploads', uploadRoutes); // Alias for uploads (plural) to match frontend expectations
app.use('/api/reward', rewardRoutes); // CAI balance and rewards
app.use('/api', homeRoutes); // Includes /v2/home/sections and /v2/flags
app.use('/api', aiSSERouter); // AI SSE stream (with heartbeat)
app.use('/api/ai', metricsRouter); // AI Orchestration metrics
app.use('/api/ai', suggestionsRouter); // AI Orchestration logs & apply
app.use('/api', eventsRouter); // AI Orchestration event intake
// LEGACY: Deprecated pairing routes - kept for backward compatibility only
// These routes are deprecated and will be removed in a future version.
// Use /api/screens/pair/* endpoints instead.
// app.use('/api/pair', pairRouter); // Commented out - use /api/screens/pair/* instead
app.use('/api/oauth', oauthRoutes); // OAuth provider status and configuration
app.use('/api/oauth', oauthSocialConnectRoutes); // Facebook Page connect callback (Method B)
app.use('/api/oauth', oauthExtendedPlatformRoutes); // Twitter, LinkedIn, Reddit, Mastodon, Pinterest stubs
app.use('/api/platforms', platformRoutes); // Social + LLM platform connection dashboard
app.use('/api/oauth', oauthGoogleRoutes); // Google OAuth (Calendar / future Gmail)
// MCP server — external AI tool integration (read-only, token-scoped)
app.use('/mcp', mcpRoutes);
app.use('/mcp', mcpServerRoutes);
console.log('[CORE] MCP server mounted at /mcp (SSE: /mcp/sse, Messages: /mcp/message, Info: /mcp/info)');
app.use('/api/campaigns', campaignsCompatRoutes); // Legacy dashboard list: GET /api/campaigns?limit=
app.use(workflowsRouter);
app.use('/api/assistant', assistantRouter); // Assistant chatbot endpoints
app.use('/api/rag', ragRoutes); // RAG (Retrieval-Augmented Generation) endpoints
app.use('/api', reportsRoutes); // Reports endpoints
app.use('/api', insightsRoutes); // Insights endpoints
console.log('[CORE] Assistant routes mounted at /api/assistant');

// Admin routes (requireAuth + requireAdmin applied in admin.js)
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminGhostRouter);
app.use('/api/admin', adminMetricsRoutes);
app.use('/api/admin', adminPipelineRoutes);
app.use('/api/admin', adminEventsRoutes);
app.use('/api/admin', adminCaiRoutes);
app.use('/api/admin', adminPlatformRoutes);
app.use('/api/admin', adminPlatformActivityRoutes);
app.use('/api/admin', adminPlatformSearchRoutes);
app.use('/api/admin', adminMultiAgentMonitoringRoutes);
app.use('/api/admin', adminDeepseekDiagnosticRoutes); // Admin: GET /api/admin/deepseek-diagnostic
app.use('/api/admin', adminAccountManagementRoutes);
app.use('/api/admin', adminStoreContentManagementRoutes);
if (Features.marketingOperator.v1) {
  app.use('/api/admin', marketingOperationsRoutes); // Marketing ops + attribution admin (flag-gated)
  console.log('[CORE] mounted /api/admin/marketing/* (ENABLE_MARKETING_OPERATOR_V1)');
}
app.use('/api/admin/market-intent', marketIntentAdminRoutes); // Market Intent admin test API (flag-gated in route)
app.use('/api/monitoring', monitoringRoutes);

app.get('/metrics', async (_req, res) => {
  if (process.env.MONITORING_ENABLED === 'false') {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('# monitoring disabled\n');
  }
  try {
    const mod = await import('./multiAgent/monitoring/index.ts');
    const { metricsStore } = mod.initMultiAgentMonitoring();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(metricsStore.getPrometheusMetrics());
  } catch (error) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send(`# monitoring error: ${error?.message || 'unknown'}\n`);
  }
});

app.use('/api/language', languageRoutes);
app.use('/api/admin/media', adminMediaRoutes);
app.use('/api/admin/media', mediaHealthRoutes);
app.use('/api/admin/live-market', liveMarketAdminRoutes); // Admin: Live Market pilot (flag-gated)
app.use('/api/admin/global-live', globalLiveEoiAdminRoutes); // Admin: Global Live pilot EOI (flag-gated)

// Internal API routes (for Lambda callbacks, workers, etc.)
app.use('/api/internal', internalRoutes);
// Ops read-only API (status, audit-trail) — requireAuth + requireAdmin
app.use('/api/ops', opsRoutes);
app.use('/api/control-tower', controlTowerRoutes);
console.log('[CORE] Admin routes mounted at /api/admin');

// Debug routes (⚠️ FOR LOCAL/DEV ONLY - NOT FOR PRODUCTION)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/debug', debugRoutes);
  app.use('/api/debug', createDebugRoutesLite(app));
  app.use('/api/dev', devContentIngestRoutes); // GET /api/dev/content-ingest/export (gated by ENABLE_CONTENT_INGEST_LOGS)
  app.use('/api/dev/credits', devCreditsRoutes); // POST /api/dev/credits/add (add credits for testing top-up)
  truthEnforcerRoutes(app); // GET /api/dev/truth-violations, POST /api/dev/truth-fix
  console.log('[CORE] Debug routes enabled: /api/debug/pairing-stats, /api/debug/routes, POST /api/dev/credits/add, /api/dev/truth-violations');
}

// ── Store bot prerender — MUST be before SPA catch-all / JSON 404 ───────
// Serves crawlable HTML + JSON-LD to Googlebot / Perplexitybot / etc.
// Browser + missing-store requests call next() and fall through.
app.use('/s', storefrontPrerenderRoutes);
console.log('[CORE] mounted /s/:slug storefront bot prerender (SKP + JSON-LD)');

// Static file hosting for production builds
const cfgPath = fromRoot('..', 'core.config.json');
if (fs.existsSync(cfgPath)) {
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const staticDirs = config.staticDirs || [];
  
  for (const dir of staticDirs) {
    const absPath = fromRoot(dir);
    if (fs.existsSync(absPath)) {
      app.use(express.static(absPath));
      console.log(`✅ Serving static files from ${dir}`);
    }
  }
  
  // SPA fallback (last static dir gets priority)
  const spaFallbackDir = config.spaFallback || staticDirs.at(-1);
  if (spaFallbackDir) {
    const root = fromRoot(spaFallbackDir);
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) {
      app.get('*', (req, res, next) => {
        // Don't SPA-fallback for API routes, OAuth routes, diagnostics, or store prerender path
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith('/oauth') ||
          req.path.startsWith('/health') ||
          req.path.startsWith('/__ping') ||
          req.path.startsWith('/__whoami') ||
          req.path.startsWith('/device') ||
          req.path.startsWith('/s/') ||
          req.path === '/s' ||
          req.path.startsWith('/sitemap-stores')
        ) {
          return next();
        }
        res.sendFile(index);
      });
      console.log(`✅ SPA fallback: ${spaFallbackDir}/index.html`);
    }
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Export app for testing or programmatic use
export default app;

const isTestEnv = (process.env.NODE_ENV || '').toLowerCase() === 'test' || Boolean(process.env.VITEST);

// Initialize database and start scheduler heartbeat
(async () => {
  try {
    // Initialize database connection
    await initializeDatabase();

    // Operational sanity: log row counts so wrong DATABASE_URL (e.g. empty dev.db) is obvious
    if (process.env.NODE_ENV !== 'test') {
      try {
        const prisma = getPrismaClient();
        const [deviceCount, mediaCount, playlistItemCount] = await Promise.all([
          prisma.device.count(),
          prisma.media.count(),
          prisma.playlistItem.count(),
        ]);
        console.log('[DB startup check]', {
          deviceCount,
          mediaCount,
          playlistItemCount,
          dbUrl: process.env.DATABASE_URL,
        });
        if (deviceCount > 0 && mediaCount === 0) {
          console.warn(
            '[DB] WARNING: Devices exist but no Media rows found. Check DATABASE_URL points to the correct database file.',
          );
        }
      } catch (dbCheckErr) {
        console.warn('[DB startup check] skipped:', dbCheckErr?.message || dbCheckErr);
      }
    }

    // Initialize tools registry (register all engine tools)
    try {
      await initializeToolsRegistry();
    } catch (error) {
      console.error('[CORE] Failed to initialize tools registry:', error);
    }

    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      try {
        await validateSystemStartup();
      } catch (startupErr) {
        console.warn('[STARTUP] Validation failed (non-blocking):', startupErr?.message ?? startupErr);
      }
    }
    
    // Start scheduler heartbeat (only for API server, not worker). Skip under Vitest — integration tests import this module
    // without a real HTTP server; timers + Prisma shutdown ordering can trigger Rust/N-API panics on exit.
    // NOTE: Keep this pre-listen (lightweight) but ensure heavier workers start after port bind (see listen callback).
    if (process.env.ROLE !== 'worker' && process.env.VITEST !== 'true') {
      startHeartbeat(30000); // 30s interval
      initReliabilityLayer();
      if (process.env.MONITORING_ENABLED !== 'false') {
        import('./multiAgent/monitoring/index.ts')
          .then((mod) => mod.initMultiAgentMonitoring())
          .catch((err) => {
            console.warn('[MultiAgentMonitoring] init failed (non-blocking):', err?.message ?? err);
          });
      }
      if (process.env.SELF_AUDIT_ENABLED !== 'false') {
        import('./selfAudit/scheduler.ts')
          .then((mod) => mod.initSelfAuditScheduler())
          .catch((err) => {
            console.warn('[SelfAudit] scheduler init failed (non-blocking):', err?.message ?? err);
          });
      }
    }
    if (process.env.ROLE === 'api') {
      startApiHttpServer();
    }
  } catch (error) {
    console.error('[Server] Failed to initialize:', error);
    const msg = error?.message || '';
    if (
      msg.includes('Prisma client is missing campaign models') ||
      msg.includes('[schemaDoctor]')
    ) {
      process.exit(1);
    }
  }
})();

function logMemoryUsage(scope, extra = {}) {
  const heapUsedMb = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
  console.log('[MEM]', heapUsedMb, 'MB', scope, extra);
}

// Start server when running as API (ROLE=api). Deferred until DB + schema verification complete.
function startApiHttpServer() {
  console.log("[SERVER] SSE routes mounted at /api/stream");
  printRoutes(app, "SERVER");

  if (process.env.NODE_ENV !== 'production') {
    console.log('[db] DATABASE_URL', process.env.DATABASE_URL ?? '(not set)');
  }

  const protocol = process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true'
    ? 'https'
    : 'http';
  const baseUrl = `${protocol}://localhost:${PORT}`;
  const lanUrl = `${protocol}://${LAN}:${PORT}`;

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CORE] Listening at http://localhost:${PORT}`);
    logMemoryUsage('server_start', { port: PORT, role: process.env.ROLE || null });
    // Production-critical: verify these mounts in Render logs. 404 on /api/mi/... or /api/draft-store/... means deploy may be stale.
    console.log('[CORE] Production-critical routes: /api/mi (missions/intents/events), /api/draft-store (create/summary/generate), /api/missions');
    console.log('[CORE] DATABASE_URL:', process.env.DATABASE_URL ? 'set (single DB for draft create/read)' : 'not set');
    console.log(`
╔══════════════════════════════════════════════╗
║  🚀 Cardbey Core API                        ║
╚══════════════════════════════════════════════╝

✅ Local: ${baseUrl}
🌐 LAN:   ${lanUrl} ← use this on tablets/TVs

✅ Health: ${baseUrl}/health
✅ API:    ${baseUrl}/api/health
✅ Healthz: ${baseUrl}/healthz
✅ Readyz: ${baseUrl}/readyz
✅ WebSocket: ws://${LAN}:${PORT}/api/stream?key=<API_KEY>
`);
    
    // Dev-only: bootstrap super_admin from SUPER_ADMIN_EMAIL (never in production)
    bootstrapSuperAdmin(getPrismaClient()).catch(() => {});
    warnIfMigrationHistoryDirty().catch(() => {});

    // Initialize WebSocket server after HTTP server is listening
    try {
      initializeWebSocketServer(server);
      console.log('[CORE] WebSocket server initialized on /api/stream');
      
      // Initialize device-specific WebSocket server
      initializeDeviceWebSocketServer(server);
      console.log('[CORE] Device WebSocket server initialized on /api/devices/:deviceId/realtime');
    } catch (error) {
      console.error('[CORE] Failed to initialize WebSocket server:', error);
    }

    // Start background workers AFTER the port is bound so Render health checks succeed even if workers fail.
    if (process.env.ROLE !== 'worker') {
      startBackgroundWorkers({ prisma: getPrismaClient() });
    }

    if (process.env.NODE_ENV !== 'production' && process.env.VITEST !== 'true') {
      startMemoryMonitor(30_000);
    }
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use!\n`);
      console.error('To fix this, try one of the following:');
      console.error(`1. Kill the process using port ${PORT}:`);
      console.error(`   netstat -ano | findstr :${PORT}`);
      console.error(`   taskkill /PID <PID> /F`);
      console.error(`\n2. Or use a different port:`);
      console.error(`   $env:PORT=3002`);
      console.error(`   npm run dev\n`);
      process.exit(1);
    } else {
      console.error('[CORE] Server error:', err);
      process.exit(1);
    }
  });
  if (server && typeof server.keepAliveTimeout === 'number') {
    server.keepAliveTimeout = 60_000;
  }
  if (server && typeof server.headersTimeout === 'number') {
    server.headersTimeout = 65_000;
  }
  
  // Graceful shutdown: abort in-flight OpenAI (etc.) then close HTTP; force-exit if something never yields
  const SHUTDOWN_FORCE_MS = Number(process.env.CORE_SHUTDOWN_FORCE_MS || 12000);
  process.on('SIGTERM', () => {
    console.log('[CORE] SIGTERM received, shutting down gracefully...');
    signalShutdown();
    stopBackgroundWorkers();
    const forceTimer = setTimeout(() => {
      console.warn('[CORE] Shutdown timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_FORCE_MS);
    server.close(async () => {
      try {
        await flushWriteQueue();
      } catch {
        /* non-fatal */
      }
      clearTimeout(forceTimer);
      console.log('[CORE] HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[CORE] SIGINT received, shutting down gracefully...');
    signalShutdown();
    stopBackgroundWorkers();
    const forceTimer = setTimeout(() => {
      console.warn('[CORE] Shutdown timeout — forcing exit');
      process.exit(1);
    }, SHUTDOWN_FORCE_MS);
    server.close(async () => {
      try {
        await flushWriteQueue();
      } catch {
        /* non-fatal */
      }
      clearTimeout(forceTimer);
      console.log('[CORE] HTTP server closed');
      process.exit(0);
    });
  });
}

if (process.env.ROLE !== 'api') {
  console.log('⚠️  Skipping app.listen() (ROLE is not "api"; set ROLE=api to start the HTTP server)');
}
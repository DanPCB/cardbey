/**
 * Shared Express application composition for Cardbey Core.
 *
 * INTEGRATION TRUTH: `pnpm run dev` / `dev:server` → `src/server.js` uses this module (single dev entry).
 *
 * Historical note: a second `dev-server.ts` entry on ~3099 existed for legacy scripts; it was removed so
 * there is only one Core HTTP surface in dev (see package `dev` / `dev:server` scripts).
 *
 * This file is the single place those mounts are defined. Entrypoints only differ by listen/port.
 */

import { config as loadEnv } from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerPerformerAtomicContentRoute } from './registerPerformerAtomicOnApp.js';
import healthRouter from './routes/healthRoutes.js';
import billingRouter from './routes/billing.js';
import sseRouter from './routes/sse.routes.js';
import agentsV1Routes from './routes/agentsV1Routes.js';
import mcpRoutes from './routes/mcpRoutes.js';
import mcpServerRoutes from './routes/mcpServerRoutes.js';
import storefrontRouter from './routes/storefrontRoutes.js';
import publicUsersRouter from './routes/publicUsers.js';
import performerIntakeRoutes from './routes/performerIntakeRoutes.js';
import performerIntakeV2Routes from './routes/performerIntakeV2Routes.js';
import performerProactiveStepRoutes from './routes/performerProactiveStepRoutes.js';
import performerMissionsRoutes from './routes/performerMissionsRoutes.js';
import performerDesignRoutes from './routes/performerDesignRoutes.js';
import devApplyPatchRoutes from './routes/devApplyPatchRoutes.js';
import devSystemMissionsRoutes from './routes/devSystemMissions.js';
import telemetryHealthRoutes from './routes/telemetryHealthRoutes.js';
import cardRoutes from './routes/cardRoutes.js';
import smartDocumentRoutes from './routes/smartDocumentRoutes.js';
import { startScheduler } from './lib/smartDocument/messageScheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load monorepo root `.env` then package-local override (same order as legacy server.js). */
export function loadCardbeyCoreEnv() {
  loadEnv({ path: resolve(__dirname, '../../../..', '.env') });
  loadEnv({ path: resolve(__dirname, '..', '.env'), override: true });
}

/** Log active DB target at startup (password redacted for postgres URLs). SQLite file: paths unchanged. */
export function redactDatabaseUrlForLog(url) {
  if (url == null || typeof url !== 'string' || url === '') return '(unset)';
  if (url.startsWith('file:')) return url;
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return String(url).replace(/:([^:@/]+)@/, ':***@');
  }
}

/**
 * @param {import('express').Express} app
 * @param {string} importPath
 * @param {string} mountPath
 */
export async function tryMountRouter(app, importPath, mountPath) {
  try {
    const mod = await import(importPath);
    const handler = mod.default ?? mod.router;
    if (!handler) {
      console.warn(`[cardbey-core/createApp] optional ${mountPath}: no default export`);
      return;
    }
    app.use(mountPath, handler);
    console.log(`[cardbey-core/createApp] mounted ${mountPath}`);
  } catch (err) {
    const code = err && err.code;
    const msg = err && err.message;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || /Cannot find (package|module)/i.test(msg)) {
      console.warn(
        `[cardbey-core/createApp] optional ${importPath} -> ${mountPath} skipped (missing dependency). ` +
          `From repo root: pnpm install — ensure @cardbey/core has deps (openai, cors, node-fetch, zod, etc.).`
      );
      console.warn(`[cardbey-core/createApp] detail:`, msg || err);
      return;
    }
    console.warn(`[cardbey-core/createApp] optional ${importPath} -> ${mountPath} failed:`, msg || err);
  }
}

/**
 * Log AI/provider env status once when the HTTP server starts listening.
 * `pnpm run dev:server` uses `server.js`.
 */
export function logDevProviderEnvHints() {
  if (process.env.NODE_ENV === 'production') return;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    console.log(`[cardbey-core] OPENAI_API_KEY: configured (${key.length} chars)`);
  } else {
    console.warn(
      '[cardbey-core] OPENAI_API_KEY: missing — AI generation / store jobs may return PROVIDER_ERROR or fallbacks. ' +
        'Set in repo .env or apps/core/cardbey-core/.env and restart dev:server.'
    );
  }
  if (process.env.USE_LLM_GATEWAY === 'true') {
    console.log('[cardbey-core] USE_LLM_GATEWAY=true (llmGateway enabled)');
  }
}

/**
 * Builds the full Cardbey API Express app (no listen).
 * @returns {Promise<import('express').Express>}
 */
export async function createCardbeyApp() {
  console.log('[cardbey-core/createApp] DATABASE_URL=', redactDatabaseUrlForLog(process.env.DATABASE_URL));

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Canonicalize /api/store/* → /api/stores/* (single mount below). Prevents Express from
  // matching /api/store as a prefix of /api/stores and mis-routing GET /api/stores/temp/draft.
  // Do not touch /api/storefront or /api/stores.
  app.use((req, res, next) => {
    const u = req.url || '';
    if (u.startsWith('/api/stores')) return next();
    if (u.startsWith('/api/store/') || u === '/api/store' || /^\/api\/store(\?|$)/.test(u)) {
      req.url = u.replace(/^\/api\/store/, '/api/stores');
    }
    next();
  });

  // Compatibility: GET /api/stores/draft?generationRunId= → GET /api/stores/temp/draft?...
  // After the rule above, GET /api/store/draft becomes /api/stores/draft (missing /temp/), which
  // does not match stores router /:storeId/draft (needs .../temp/draft). Dashboard apiPaths uses
  // /api/stores/temp/draft; older callers and manual checks against /api/store/draft hit this path.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const u = req.url || '';
    const q = u.indexOf('?');
    const pathOnly = q >= 0 ? u.slice(0, q) : u;
    const qs = q >= 0 ? u.slice(q) : '';
    if (pathOnly === '/api/stores/draft') {
      req.url = '/api/stores/temp/draft' + qs;
    }
    next();
  });

  // Before any `app.use('/api', …)` router — ensures POST /api/performer/intake is not lost to a generic /api stack.
  app.use('/api/performer/intake', performerIntakeRoutes);
  console.log('[cardbey-core/createApp] mounted /api/performer/intake (performerIntakeRoutes)');
  app.use('/api/performer/intake/v2', performerIntakeV2Routes);
  console.log('[cardbey-core/createApp] mounted /api/performer/intake/v2 (performerIntakeV2Routes)');
  app.use('/api/performer/proactive-step', performerProactiveStepRoutes);
  console.log('[cardbey-core/createApp] mounted /api/performer/proactive-step (performerProactiveStepRoutes)');
  app.use('/api/performer/missions', performerMissionsRoutes);
  console.log('[cardbey-core/createApp] mounted /api/performer/missions (performerMissionsRoutes)');
  app.use('/api/performer/design', performerDesignRoutes);
  console.log('[cardbey-core/createApp] mounted /api/performer/design (performerDesignRoutes)');
  app.use('/api/dev', devApplyPatchRoutes);
  console.log('[cardbey-core/createApp] mounted /api/dev (devApplyPatchRoutes)');
  app.use('/api/dev', devSystemMissionsRoutes);
  console.log('[cardbey-core/createApp] mounted /api/dev (devSystemMissionsRoutes)');
  app.use('/api/telemetry', telemetryHealthRoutes);
  console.log('[cardbey-core/createApp] mounted /api/telemetry (telemetryHealthRoutes)');
  app.use('/api/cards', cardRoutes);
  console.log('[cardbey-core/createApp] mounted /api/cards (cardRoutes)');
  app.use('/api/docs', smartDocumentRoutes);
  console.log('[cardbey-core/createApp] mounted /api/docs (smartDocumentRoutes)');

  // Start the SmartDocument message scheduler (fire-and-forget, unref'd timer)
  startScheduler();

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      package: '@cardbey/core',
      variant: 'full-api-dev',
      performer: ['intake', 'plan', 'eye', 'atomic-content'],
    });
  });

  // ----------------------------
  // Phase 0: Agent Card + MCP Discovery (read-only)
  // ----------------------------
  app.get('/.well-known/agent-card.json', (_req, res) => {
    res.json({
      name: 'Cardbey Agent Platform',
      description: 'Agentic AI for missions, marketing, and store operations on Cardbey.',
      version: '1.0.0-phase0',
      capabilities: ['mission-spawn', 'mission-blackboard-read', 'mcp-readonly-products'],
      endpoints: {
        agentsV1Base: '/api/agents/v1',
        spawn: '/api/agents/v1/missions/{missionId}/spawn',
        blackboard: '/api/agents/v1/missions/{missionId}/blackboard',
        blackboardStream: '/api/agents/v1/missions/{missionId}/blackboard/stream',
        event: '/api/agents/v1/missions/{missionId}/events/{eventId}',
        mcpBase: '/mcp',
        mcpDiscovery: '/.well-known/mcp.json',
        mcpProducts: '/mcp/resources/products',
      },
      auth: {
        type: 'bearer_jwt',
        tokenQueryParam: 'token',
      },
    });
  });

  app.get('/.well-known/mcp.json', (_req, res) => {
    res.json({
      name: 'Cardbey MCP',
      version: '1.0.0',
      resources: [
        {
          uri: '/mcp/resources/products',
          description: 'Read-only product catalog resources (published products only).',
        },
      ],
    });
  });

  app.use('/mcp', mcpRoutes);
  app.use('/mcp', mcpServerRoutes);
  console.log('[cardbey-core/createApp] mounted /mcp (mcpServerRoutes: /sse, /message, /info, /tokens)');

  // Serve OpenAPI spec for the headless Agents API (v1).
  app.get('/api/agents/v1/openapi.yaml', (_req, res) => {
    try {
      const specPath = resolve(__dirname, '../openapi/agents-v1.yaml');
      const content = fs.readFileSync(specPath, 'utf8');
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      return res.status(200).send(content);
    } catch {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'OpenAPI spec not found' });
    }
  });

  app.use('/api', healthRouter);
  console.log('[cardbey-core/createApp] mounted /api (healthRoutes: /health, /dashboard/*, /oauth/providers, …)');
  app.use('/api', sseRouter);
  console.log('[cardbey-core/createApp] mounted /api (sse.routes: GET /stream, /stream/health, …)');
  app.use('/api/agents/v1', agentsV1Routes);
  console.log('[cardbey-core/createApp] mounted /api/agents/v1 (headless agents v1 routes)');
  app.use('/api/billing', billingRouter);
  console.log('[cardbey-core/createApp] mounted /api/billing');
  app.use('/api/storefront', storefrontRouter);
  console.log('[cardbey-core/createApp] mounted /api/storefront');
  app.use('/api/public', publicUsersRouter);
  console.log('[cardbey-core/createApp] mounted /api/public');

  await tryMountRouter(app, './routes/performerPlanRoutes.js', '/api/performer/plan');
  await tryMountRouter(app, './routes/performerEyeRoutes.js', '/api/performer/eye');
  // Must mount before miRoutes: same /api/mi prefix — reasoning-log + mission events for Performer blackboard.
  await tryMountRouter(app, './routes/miIntentsRoutes.js', '/api/mi');
  await tryMountRouter(app, './routes/miRoutes.js', '/api/mi');
  await tryMountRouter(app, './routes/miDistributionRoutes.ts', '/api/mi');
  await tryMountRouter(app, './routes/auth.js', '/api/auth');
  await tryMountRouter(app, './routes/agentRoutes.js', '/api/agent');
  await tryMountRouter(app, './routes/telemetryRoutes.js', '/api/telemetry');
  await tryMountRouter(app, './routes/missionsRoutes.js', '/api/missions');
  await tryMountRouter(app, './routes/toolsRoutes.js', '/api/tools');
  // Same as server.js: POST /api/missions/:missionId/spawn (OpenClaw child) after missions stack
  app.use('/api/missions', agentsV1Routes);
  console.log('[cardbey-core/createApp] mounted /api/missions (agentsV1: spawn, blackboard/stream, …)');
  await tryMountRouter(app, './routes/localDesktopRoutes.js', '/api');
  await tryMountRouter(app, './routes/stores.js', '/api/stores');
  await tryMountRouter(app, './routes/businessBrandRoutes.js', '/api/business');
  await tryMountRouter(app, './routes/draftStoreRoutes.js', '/api/draft-store');
  await tryMountRouter(app, './routes/home.js', '/api');
  await tryMountRouter(app, './routes/campaignRoutes.js', '/api/campaign');
  await tryMountRouter(app, './routes/intentGraphRoutes.js', '/api/intent-graph');
  await tryMountRouter(app, './routes/controlTowerRoutes.js', '/api/control-tower');

  await registerPerformerAtomicContentRoute(app);

  return app;
}

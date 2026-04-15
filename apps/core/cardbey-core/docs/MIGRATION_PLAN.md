# 🏗️ Backend Consolidation: Migration Plan to Single `cardbey-core` Backend

## Executive Summary

**Goal:** Consolidate all Express servers into `cardbey-core` as the single source of truth for all API endpoints, serving all frontends (web, marketing-dashboard) from one backend.

**Current State:**
- ❌ **3 servers running** (cardbey-core:3001, marketing-dashboard:3001, web:3000)
- ❌ Duplicate routes (OAuth, SSE, uploads, etc.)
- ❌ Conflicting port usage
- ❌ Confusing deployment architecture

**Target State:**
- ✅ **1 backend server** (cardbey-core:3001)
- ✅ **1 background worker** (cardbey-core worker process, no port)
- ✅ **2 frontends** (web:3000, marketing:5174) - dev mode with Vite proxy
- ✅ Static builds served from core for production

---

## 📊 Server Audit Results

### 1️⃣ **Cardbey Core** (C:\Users\desig\Desktop\cardbey-core)
**Port:** 3001  
**Status:** ✅ **PRIMARY** - Keep and extend

**Current Routes:**
```
POST   /api/auth/register, /api/auth/login
GET    /api/auth/me
POST   /api/demands
GET    /api/oauth/status
GET    /oauth/facebook/start, /oauth/facebook/callback
GET    /oauth/tiktok/start, /oauth/tiktok/callback
POST   /api/assistant/guest, /api/assistant/chat, /api/assistant/action
GET    /api/assistant/summary
GET    /api/journeys/templates, /api/journeys/templates/:slug
POST   /api/journeys/start
GET    /api/journeys/instances, /api/journeys/instances/:id
PATCH  /api/journeys/instances/:id
POST   /api/journeys/instances/:id/steps/:stepId/action
GET    /api/journeys/planner, /api/journeys/suggestions
GET    /api/stream (SSE)
GET    /api/ai/stream (AI SSE with heartbeat)
GET    /api/v2/flags, /api/v2/home/sections
POST   /api/events (AI intake)
GET    /api/ai/logs, /api/ai/metrics
POST   /api/ai/apply
```

**Background Jobs:**
- ✅ Planner runner (60s polling)
- ✅ Notification sender (5min interval)

---

### 2️⃣ **Marketing Dashboard Server** (C:\Users\desig\Desktop\cardbey-marketing-dashboard\server)
**Port:** 3001 (CONFLICT!)  
**Status:** ❌ **MIGRATE TO CORE**

**Current Routes (36 total):**
```
POST   /api/chat (AI chat - OpenAI)
POST   /api/auth/login, /api/auth/logout
GET    /api/auth/me
POST   /api/campaigns (CRUD)
GET    /api/metrics (analytics)
POST   /api/performer (performer AI)
POST   /api/performer/stream (streaming AI)
GET    /api/events (SSE per-store)
POST   /api/rewards (behavior/rewards)
POST   /api/agents (agent orchestration)
POST   /api/share (share/export)
GET    /api/feeds (store feed public)
POST   /api/cai (CAI credits/points)
POST   /api/cnet (C-Net registry/player)
POST   /api/uploads (media upload/library)
POST   /api/upload/playlist-media
GET    /api/insights (insights dashboard)
GET    /api/dashboard (dashboard overview)
GET    /api/dashboard/insights (AI insights)
GET    /api/health
GET    /api/integrations/status (OAuth integrations)
GET    /api/devices, POST /api/device/heartbeat
GET    /api/screens, /api/playlists
GET    /events, /api/stream (enhanced streaming)
GET    /oauth/facebook/start, /oauth/facebook/callback
GET    /oauth/tiktok/start, /oauth/tiktok/callback
```

**Static Files:**
```
/uploads/* → uploads folder (media fallback when S3 not configured)
/player/* → player/player.html (C-Net Player app)
/player.html → legacy C-Net player route
```

**Background Jobs:**
```
- Scheduler (cron jobs)
- Agent scheduler
- Device watcher (5min polling)
- Share queue worker
- SSE event bus
```

---

### 3️⃣ **Cardbey Web Server** (C:\Users\desig\Desktop\Cardbey-web-latest)
**Port:** 3000  
**Status:** ❌ **REMOVE** - Replace with Vite proxy

**Current Routes:**
```
/api/v2/* → local stub routes (SSE preflight, etc.)
/api/* → proxy to http://localhost:3001
/oauth/* → proxy to http://localhost:3001
/* → serve build/index.html (SPA fallback)
/frontscreen → serve public/frontscreen/index.html
```

**Purpose:**  
- Development proxy (not needed with Vite proxy)
- Static file serving (move to core)

---

## 🎯 Migration Strategy

### Phase 1: Create Worker Entry Point (No Port Conflicts)
**Goal:** Separate API server from background workers to avoid port conflicts.

**Files to Create:**
```
cardbey-core/
├── src/
│   ├── server.js       ← HTTP server (existing)
│   └── worker.js       ← NEW: Background jobs only (no port)
└── package.json        ← Update scripts
```

**Implementation:**

#### `src/worker.js` (NEW)
```javascript
/**
 * Cardbey Core Worker Process
 * Runs background jobs without binding to any port
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('🔧 Starting Cardbey Core Worker...');

// Import background services
import { startPlannerRunner, sendUpcomingNotifications } from './services/planner-runner.js';

// Import marketing-dashboard background jobs (to be migrated)
// import { startScheduler } from './scheduler/index.js';
// import { startAgentScheduler } from './scheduler/agentScheduler.js';
// import { startDeviceWatcher } from './scheduler/deviceWatcher.js';
// import { shareQueue } from './worker/shareQueue.js';

async function startWorker() {
  console.log('✅ Cardbey Core Worker started');
  
  // Journeys planner (existing)
  startPlannerRunner(60000); // Check every minute
  setInterval(() => {
    sendUpcomingNotifications().catch(err => {
      console.error('[Planner] Notification error:', err);
    });
  }, 5 * 60 * 1000);
  
  // TODO: Add marketing-dashboard workers here after migration
  // startScheduler();
  // startAgentScheduler();
  // startDeviceWatcher();
  // shareQueue.start();
  
  console.log('✅ All background workers initialized');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Worker shutting down...');
  // Add cleanup logic here
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Worker shutting down (SIGINT)...');
  process.exit(0);
});

// Start the worker
startWorker().catch(err => {
  console.error('❌ Worker startup failed:', err);
  process.exit(1);
});
```

#### Update `src/server.js`
```javascript
// Guard app.listen() to prevent worker from binding port
if (process.env.ROLE !== 'worker') {
  app.listen(PORT, () => {
    console.log(/* ... banner ... */);
  });
} else {
  console.log('⚠️ ROLE=worker detected, skipping app.listen()');
}

// Move background job startup to worker.js
// Remove or guard these:
// - startPlannerRunner(60000)
// - setInterval(sendUpcomingNotifications, ...)
```

#### Update `package.json`
```json
{
  "scripts": {
    "dev:api": "cross-env ROLE=api nodemon src/server.js",
    "dev:worker": "cross-env ROLE=worker nodemon src/worker.js",
    "dev": "npm-run-all --parallel dev:api dev:worker",
    "build": "tsc -p .",
    "start:api": "cross-env ROLE=api node src/server.js",
    "start:worker": "cross-env ROLE=worker node src/worker.js",
    "start": "npm-run-all --parallel start:api start:worker"
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "npm-run-all": "^4.1.5",
    "nodemon": "^3.0.1"
  }
}
```

---

### Phase 2: Static Hosting from Core
**Goal:** Serve all frontend builds from cardbey-core in production.

#### `core.config.json` (NEW)
```json
{
  "staticDirs": [
    "../Cardbey-web-latest/build",
    "../cardbey-marketing-dashboard/dist"
  ],
  "spaFallback": "../cardbey-marketing-dashboard/dist"
}
```

#### Update `src/server.js` (after routes, before 404)
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static hosting for built frontends
const cfgPath = path.resolve(__dirname, '../core.config.json');
const staticDirs = fs.existsSync(cfgPath) 
  ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')).staticDirs 
  : [];

for (const dir of staticDirs) {
  const absPath = path.resolve(__dirname, dir);
  if (fs.existsSync(absPath)) {
    app.use(express.static(absPath));
    console.log(`✅ Serving static files from ${dir}`);
  }
}

// SPA fallback (last static dir gets priority)
const config = fs.existsSync(cfgPath) 
  ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) 
  : {};
const spaFallbackDir = config.spaFallback || staticDirs.at(-1);

if (spaFallbackDir) {
  const root = path.resolve(__dirname, spaFallbackDir);
  const index = path.join(root, 'index.html');
  if (fs.existsSync(index)) {
    app.get('*', (req, res) => {
      // Don't SPA-fallback for API routes
      if (req.path.startsWith('/api') || req.path.startsWith('/oauth')) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.sendFile(index);
    });
    console.log(`✅ SPA fallback: ${spaFallbackDir}/index.html`);
  }
}
```

---

### Phase 3: Route Migration from Marketing Dashboard
**Goal:** Move all marketing-dashboard routes into `cardbey-core/src/routes/`.

#### Routes to Migrate:
```
cardbey-marketing-dashboard/server/routes/ → cardbey-core/src/routes/

ai.js             → routes/ai.js (OpenAI chat)
campaigns.js      → routes/campaigns.js
metrics.js        → routes/metrics.js (merge with ai/metrics)
performer.js      → routes/performer.js
performerStream.js → routes/performer-stream.js
events.js         → routes/events.js (SSE per-store, merge with sse.routes.js)
rewards.js        → routes/rewards.js
agents.js         → routes/agents.js
share.js          → routes/share.js
feeds.js          → routes/feeds.js
cai.js            → routes/cai.js
cnet.js           → routes/cnet.js
uploads.js        → routes/uploads.js
upload.routes.js  → routes/upload.routes.js
insights.js       → routes/insights.js
insights.routes.js → routes/insights-ai.js
dashboard.routes.js → routes/dashboard.js
health.routes.js  → routes/health.js (merge with existing /health)
integrations.routes.js → routes/integrations.js
device.routes.js  → routes/devices.js
screens.routes.js → routes/screens.js
stream.js         → routes/stream.js (merge with sse)
observability.js  → routes/observability.js
marketing.js      → routes/marketing.js
schedules.js      → routes/schedules.js
```

#### Update `src/server.js` to mount new routes:
```javascript
// Existing routes
import authRoutes from './routes/auth.js';
import demandRoutes from './routes/demands.js';
import oauthRoutes from './routes/oauth.js';
// ... existing imports ...

// NEW: Marketing dashboard routes
import aiRoutes from './routes/ai.js';
import campaignsRouter from './routes/campaigns.js';
import metricsRouter from './routes/metrics.js';
import performerRouter from './routes/performer.js';
import performerStreamRouter from './routes/performer-stream.js';
import eventsRouter from './routes/events.js';
import rewardsRouter from './routes/rewards.js';
import agentsRouter from './routes/agents.js';
import shareRouter from './routes/share.js';
import feedsRouter from './routes/feeds.js';
import caiRouter from './routes/cai.js';
import cnetRouter from './routes/cnet.js';
import uploadsRouter from './routes/uploads.js';
import uploadRouter from './routes/upload.routes.js';
import insightsRouter from './routes/insights.js';
import dashboardRouter from './routes/dashboard.js';
import healthRouter from './routes/health.js';
import insightsRouterAI from './routes/insights-ai.js';
import integrationsRouter from './routes/integrations.js';
import deviceRouter from './routes/devices.js';
import screensRouter from './routes/screens.js';
import streamRouter from './routes/stream.js';
import schedulesRoutes from './routes/schedules.js';
import marketingRouter from './routes/marketing.js';
import observabilityRoutes from './routes/observability.js';

// Mount routes
app.use('/api/chat', aiRoutes);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/performer', performerRouter);
app.use('/api/performer', performerStreamRouter);
app.use('/api/events', eventsRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/share', shareRouter);
app.use('/api/feeds', feedsRouter);
app.use('/api/cai', caiRouter);
app.use('/api/cnet', cnetRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api', uploadRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dashboard', insightsRouterAI);
app.use('/api', healthRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api', deviceRouter);
app.use('/api', screensRouter);
app.use(streamRouter);
app.use('/api/schedules', schedulesRoutes);
app.use('/api', marketingRouter);
app.use('/api', observabilityRoutes);

// Static file serving
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/player', express.static(path.join(process.cwd(), 'player')));
app.get('/player.html', (req, res) => {
  res.sendFile('cnet-player.html', { root: './public' });
});
```

---

### Phase 4: Vite Proxy Setup (Dev Mode)
**Goal:** Remove custom Express servers in frontends, use Vite's proxy instead.

#### `Cardbey-web-latest/vite.config.js` (UPDATED)
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/oauth': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/events/, '/api/stream')
      }
    }
  }
});
```

#### `cardbey-marketing-dashboard/vite.config.js` (UPDATED)
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/oauth': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/events': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/events/, '/api/stream')
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/player': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
```

#### **Remove:**
- `Cardbey-web-latest/server.js`
- `Cardbey-web-latest/server.cjs`
- `Cardbey-web-latest/server.mjs`
- `cardbey-marketing-dashboard/server/` (after migration)

---

### Phase 5: Environment Variables Consolidation

#### `cardbey-core/.env.example`
```env
# Server
NODE_ENV=development
PORT=3001
ROLE=api

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174
COOKIE_DOMAIN=localhost

# Session
SESSION_SECRET=change-me-in-production

# OpenAI
OPENAI_API_KEY=

# OAuth
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=
OAUTH_REDIRECT_BASE=http://localhost:3001

# Storage
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Database
DATABASE_URL=file:./dev.db

# Feature Flags
DEV_ROUTES=1
```

---

### Phase 6: PM2 Production Config

#### `cardbey-core/ecosystem.config.js` (NEW)
```javascript
module.exports = {
  apps: [
    {
      name: 'cardbey-api',
      script: 'src/server.js',
      env: {
        ROLE: 'api',
        PORT: 3001,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'cluster'
    },
    {
      name: 'cardbey-worker',
      script: 'src/worker.js',
      env: {
        ROLE: 'worker',
        NODE_ENV: 'production'
      },
      instances: 1
    }
  ]
};
```

**Usage:**
```bash
npm run build
pm2 start ecosystem.config.js
pm2 logs
pm2 stop all
```

---

### Phase 7: Smoke Tests

#### `cardbey-core/scripts/smoke.js` (NEW)
```javascript
/**
 * Smoke test for Cardbey Core API
 * Validates critical endpoints
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function runSmokeTests() {
  console.log('🧪 Running Cardbey Core Smoke Tests...\n');
  
  const tests = [
    { name: 'Health Check', url: `${API_BASE}/health`, method: 'GET' },
    { name: 'Journey Templates', url: `${API_BASE}/api/journeys/templates`, method: 'GET' },
    { name: 'Guest Assistant', url: `${API_BASE}/api/assistant/guest`, method: 'POST', body: {} },
    { name: 'AI Metrics', url: `${API_BASE}/api/ai/metrics`, method: 'GET' },
    { name: 'Flags', url: `${API_BASE}/api/v2/flags`, method: 'GET' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const response = await fetch(test.url, {
        method: test.method,
        headers: { 'Content-Type': 'application/json' },
        body: test.body ? JSON.stringify(test.body) : undefined
      });
      
      if (response.ok) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name} (${response.status})`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${test.name} (${err.message})`);
      failed++;
    }
  }
  
  // SSE test
  console.log('\n🔄 Testing SSE...');
  try {
    const response = await fetch(`${API_BASE}/api/stream`);
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('✅ SSE endpoint responding');
      passed++;
    } else {
      console.log('❌ SSE endpoint not streaming');
      failed++;
    }
  } catch (err) {
    console.log(`❌ SSE test failed (${err.message})`);
    failed++;
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runSmokeTests();
```

**Package.json:**
```json
{
  "scripts": {
    "smoke": "node scripts/smoke.js",
    "smoke:dev": "API_BASE=http://localhost:3001 node scripts/smoke.js"
  }
}
```

---

## 📋 Final Verification Checklist

### ✅ Infrastructure
- [ ] Only `cardbey-core` listens on port 3001
- [ ] Worker process runs without binding a port
- [ ] No port conflicts between services

### ✅ Development Experience
- [ ] `npm run dev` in cardbey-core starts API + Worker
- [ ] `npm run dev` in web proxies to :3001
- [ ] `npm run dev` in marketing-dashboard proxies to :3001
- [ ] All UIs call `/api/*` (relative paths, no hardcoded URLs)

### ✅ Production Readiness
- [ ] `npm run build` in web/marketing generates static builds
- [ ] Static builds are served from core at `/`
- [ ] PM2 config runs API + Worker as separate processes
- [ ] Smoke tests pass (`npm run smoke:dev`)

### ✅ Features
- [ ] SSE `/api/stream` reachable from all UIs
- [ ] OAuth callbacks hit core and work correctly
- [ ] All routes from marketing-dashboard migrated
- [ ] Static uploads/player files served from core
- [ ] Background workers (scheduler, device watcher, etc.) running in worker process

---

## 🚀 Migration Execution Order

1. **✅ Phase 1:** Create worker entry point (`src/worker.js`)
2. **Phase 2:** Add static hosting to core
3. **Phase 3:** Migrate marketing-dashboard routes (1 by 1, test each)
4. **Phase 4:** Update Vite configs with proxy
5. **Phase 5:** Consolidate `.env` files
6. **Phase 6:** Create PM2 config
7. **Phase 7:** Write smoke tests
8. **Phase 8:** Delete legacy servers
9. **Phase 9:** Update documentation
10. **Phase 10:** Deploy to production

---

## 📝 Next Steps

**Ready to proceed?**

1. Start with Phase 1 (worker entry point) to eliminate port conflicts immediately
2. Then systematically migrate routes
3. Test each phase before moving forward

**Shall I begin implementing Phase 1?**







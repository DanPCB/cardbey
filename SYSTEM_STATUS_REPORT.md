# System Status Report: Orchestra, CRON, and MI Analysis

**Generated:** 2026-01-01  
**Scope:** Cardbey Core System Components

---

## 1. Orchestra (Orchestrator) Status

### ✅ **Status: OPERATIONAL** (Partial Implementation)

### Overview
The Orchestrator is a unified AI orchestration system that handles automated tasks across devices, campaigns, and content studio. It provides a single entry point for executing various AI-powered workflows.

### Implementation Status

#### ✅ **Fully Implemented Entry Points:**
1. **`loyalty_from_card`** - ✅ Working
   - Service: `loyaltyFromCardService.js
   - Handles loyalty card processing

2. **`menu_from_photo`** - ✅ Working
   - Service: `menuFromPhotoService.js`
   - Processes menu images via OCR/Vision

3. **`content_studio`** - ✅ Working
   - Service: `sam3DesignTaskService.js`
   - Handles design tasks in Content Studio

4. **`system_watcher`** - ✅ Working
   - Service: `systemWatcher.js` (TypeScript)
   - System monitoring and health checks

#### ⚠️ **Not Yet Implemented:**
1. **`shopfront_signage`** - ❌ TODO
   - Status: Throws error "shopfront_signage not yet implemented in unified orchestrator"
   - Location: `src/orchestrator/index.js:57`

2. **`creative_ideas`** - ❌ TODO
   - Status: Throws error "creative_ideas not yet implemented in unified orchestrator"
   - Location: `src/orchestrator/index.js:61`

### Architecture

**File Structure:**
```
src/orchestrator/
├── index.js                    # Main entry point (✅ Implemented)
├── api/
│   ├── orchestratorRoutes.js  # Express routes (✅ Implemented)
│   └── insightsOrchestrator.js # Insight handlers (✅ Implemented)
├── handlers/                   # Domain-specific handlers
│   ├── deviceHandlers.ts       # Device-related (✅ Scaffolded)
│   ├── campaignHandlers.ts     # Campaign-related (✅ Scaffolded)
│   └── studioHandlers.ts       # Studio/content (✅ Scaffolded)
└── services/                   # Business services
    ├── loyaltyFromCardService.js  (✅ Working)
    ├── menuFromPhotoService.js     (✅ Working)
    └── sam3DesignTaskService.js    (✅ Working)
```

### API Endpoints

**Main Endpoint:**
- `POST /api/orchestrator/run` - Execute orchestrator task
- `POST /api/orchestrator/insights/execute` - Execute insight action

**Status:** ✅ Routes registered in `server.js:579`

### Key Features

1. **Unified Entry Point:** Single `runOrchestrator(entryPoint, input, ctx)` function
2. **Error Handling:** Comprehensive error logging with duration tracking
3. **Type Safety:** TypeScript types defined in `insightTypes.ts`
4. **Context Support:** Execution context with tenantId, userId, source tracking

### Known Issues / Limitations

1. **Incomplete Entry Points:** 2 out of 6 entry points not implemented
2. **Scaffolding:** Some handler files are placeholders (empty implementations)
3. **No Retry Logic:** Errors are logged but not automatically retried

### Recommendations

1. **Priority:** Implement `shopfront_signage` and `creative_ideas` entry points
2. **Enhancement:** Add retry mechanism for transient failures
3. **Monitoring:** Add metrics/telemetry for orchestrator performance

---

## 2. CRON (Scheduler) Status

### ✅ **Status: OPERATIONAL** (Conditional - Requires Env Var)

### Overview
The CRON scheduler handles automated scheduled tasks, primarily for report generation. Uses `node-cron` library for reliable scheduling.

### Implementation Status

#### ✅ **Report Scheduler** - Implemented
**Location:** `src/scheduler/reportScheduler.js`

**Features:**
- Daily reports: Runs at 01:00 UTC every day (`0 1 * * *`)
- Weekly reports: Runs on Monday at 02:00 UTC (`0 2 * * 1`)
- Idempotency checks to prevent duplicate reports
- Stats tracking (created, skipped, errors)

**Initialization:**
- ✅ Registered in `server.js:753`
- ⚠️ **Requires:** `REPORT_SCHEDULER_ENABLED=true` environment variable
- If disabled, logs: "Disabled (REPORT_SCHEDULER_ENABLED != true)"

**Status Check:**
```javascript
// In server.js
if (process.env.REPORT_SCHEDULER_ENABLED === 'true') {
  initReportScheduler();
}
```

#### ✅ **Task Worker Cron** - Implemented
**Location:** `server/jobs/task-worker.js` (Dashboard package)

**Features:**
- Runs every 30 seconds (`*/30 * * * * *`)
- Processes queued tasks (PENDING → RUNNING → SUCCEEDED/FAILED)
- Handles task lifecycle events
- Retry mechanism with exponential backoff

**Status:** ✅ Active (runs automatically in server)

### CRON Jobs Summary

| Job | Schedule | Status | Location |
|----|----------|--------|----------|
| Daily Reports | `0 1 * * *` (01:00 UTC) | ✅ Active* | `reportScheduler.js` |
| Weekly Reports | `0 2 * * 1` (Mon 02:00 UTC) | ✅ Active* | `reportScheduler.js` |
| Task Worker | `*/30 * * * * *` (Every 30s) | ✅ Active | `server/jobs/task-worker.js` |

*Requires `REPORT_SCHEDULER_ENABLED=true`

### Dependencies

- ✅ `node-cron@^3.0.3` - Installed and working
- ✅ Timezone support - UTC (configurable)

### Known Issues / Limitations

1. **Environment Variable Required:** Report scheduler disabled by default
2. **No UI Control:** Cannot enable/disable via dashboard (env var only)
3. **Single Timezone:** All jobs run in UTC (not configurable per tenant)

### Recommendations

1. **Enable Scheduler:** Set `REPORT_SCHEDULER_ENABLED=true` in production
2. **Monitoring:** Add health check endpoint for scheduler status
3. **UI Control:** Add admin UI to enable/disable schedulers
4. **Timezone Support:** Add per-tenant timezone configuration

---

## 3. MI (Merged Intelligence) Analysis Status

### ✅ **Status: FULLY OPERATIONAL**

### Overview
MI (Merged Intelligence) is a system-wide intelligence layer that attaches "mini-brains" (MIEntity records) to all creative products, insights reports, and device screen items. It provides intent inference, behavior evaluation, and render hints.

### Implementation Status

#### ✅ **Core Components - All Implemented**

1. **MIEntity Model** - ✅ Complete
   - Prisma schema: `MIEntity` model with full structure
   - Links to: CreativeAssets, Reports, ScreenItems, Templates
   - MI Brain JSON field storing full intelligence metadata

2. **MI Service** - ✅ Complete
   - Location: `src/services/miService.ts`
   - Methods:
     - `registerOrUpdateEntity()` - ✅ Working
     - `getEntityById()` - ✅ Working
     - `getEntityByProductId()` - ✅ Working
     - `getEntityByLink()` - ✅ Working
     - `getEntitiesByContext()` - ✅ Working
     - `deleteEntity()` - ✅ Working

3. **MI Runtime** - ✅ Complete
   - Location: `src/mi/miRuntime.ts`
   - `resolveMI()` - Main resolver function
   - Intent inference via AI
   - Behavior evaluation
   - Render hints generation

4. **MI Intent Analysis** - ✅ Complete
   - Location: `src/mi/miIntent.ts`
   - `inferIntent()` - AI-powered intent analysis
   - Supports: sell, convert, inform, retain, support, navigate, announce
   - Target actions: order, book, scan, claim, chat, follow, subscribe, share

5. **MI Generation** - ✅ Complete
   - Location: `src/services/miGeneration.ts`
   - Handles URL → Smart Business job pipeline
   - Supports: form, url, ocr, voice source types
   - Stale job detection and cleanup
   - Progress tracking via SSE events

### Integration Points

#### ✅ **Creative Engine Integration**
- Signage Asset Upload → MIEntity created
- Menu Asset Generation → MIEntity attached
- Template Generation → MIEntity linked

#### ✅ **Device Engine Integration**
- Screen Items → MIEntity linked via `screenItemId`
- Playlist Items → MIEntity attached

#### ✅ **Reports Integration**
- Tenant Reports → MIEntity linked via `reportId`

### API Endpoints

**MI Routes:** `POST /api/mi/*`
- ✅ `/api/mi/orchestrator/*` - MI orchestrator endpoints
- ✅ `/api/mi/job/*` - MI generation job endpoints
- ✅ `/api/mi/promotion/*` - MI promotion generation

**Status:** ✅ Routes registered in `server.js:558`

### Key Features

1. **Intent Inference:** AI-powered analysis of object intent
2. **Behavior Evaluation:** Context-aware behavior rules
3. **Render Hints:** CTA text, URLs, styling suggestions
4. **Conversion Tracking:** Metrics and attribution
5. **Chat Support:** `chatMI()` function for interactive MI
6. **Caching:** MI cache for performance (`miCache.ts`)

### MI Generation Pipeline

**Status:** ✅ Fully Operational

**Supported Sources:**
- ✅ Form input
- ✅ URL/Website scraping
- ✅ OCR (image processing)
- ✅ Voice input

**Job Lifecycle:**
1. `queued` → Job created
2. `running` → Processing started
3. `completed` → Store generated successfully
4. `failed` → Error occurred

**Features:**
- Stale job detection (30s threshold)
- Progress tracking via SSE
- Automatic store creation
- Catalog synthesis for empty stores

### Known Issues / Limitations

1. **None Identified** - System appears fully operational

### Recommendations

1. **Monitoring:** Add metrics for MI resolution performance
2. **Caching:** Optimize MI cache hit rates
3. **Analytics:** Track MI entity usage patterns

---

## Summary Table

| Component | Status | Implementation | Notes |
|-----------|--------|----------------|-------|
| **Orchestrator** | 🟡 Partial | 4/6 entry points | 2 TODOs remaining |
| **CRON Scheduler** | 🟡 Conditional | Fully implemented | Requires env var |
| **MI Analysis** | ✅ Complete | Fully operational | No known issues |

---

## Quick Status Checks

### Check Orchestrator Status
```bash
# Check if orchestrator routes are registered
grep -r "orchestratorRoutes" apps/core/cardbey-core/src/server.js
# Should show: app.use('/api/orchestrator', orchestratorRoutes);
```

### Check CRON Status
```bash
# Check if scheduler is enabled
echo $REPORT_SCHEDULER_ENABLED
# Should be: true (for reports to run)

# Check if cron is installed
npm list node-cron
# Should show: node-cron@^3.0.3
```

### Check MI Status
```bash
# Check if MI routes are registered
grep -r "miRoutes" apps/core/cardbey-core/src/server.js
# Should show: app.use('/api/mi', miRoutes);

# Check Prisma schema for MIEntity
grep -A 20 "model MIEntity" apps/core/cardbey-core/prisma/schema.prisma
# Should show full model definition
```

---

## Recommendations Priority

### High Priority
1. **Enable Report Scheduler:** Set `REPORT_SCHEDULER_ENABLED=true` in production
2. **Complete Orchestrator:** Implement `shopfront_signage` and `creative_ideas` entry points

### Medium Priority
3. **Add Monitoring:** Health check endpoints for all three systems
4. **Add UI Controls:** Dashboard to enable/disable schedulers

### Low Priority
5. **Enhancement:** Add retry logic to orchestrator
6. **Optimization:** Improve MI cache performance

---

**Report Generated:** 2026-01-01  
**Next Review:** When implementing missing orchestrator entry points or enabling report scheduler



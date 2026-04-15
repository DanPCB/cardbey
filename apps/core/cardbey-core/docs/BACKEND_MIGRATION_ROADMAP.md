# Backend Migration Roadmap: B + A → C (cardbey-core)

**Date:** 2025-01-25  
**Goal:** Consolidate all backend functionality into cardbey-core (C) as the single source of truth, migrating routes from B's server and A's legacy API.

---

## Section 1: Current Core Domains Snapshot

### 1.1 Auth & Users

**Status:** ✅ **Ready for production** (with minor gaps)

**Current Endpoints:**
- `POST /api/auth/register` - User registration ✅
- `POST /api/auth/login` - User login ✅
- `GET /api/auth/me` - Get current user ✅
- `POST /api/auth/dev/seed-admin` - Dev-only admin seed ✅

**Missing:**
- ❌ Profile update endpoint (`PUT /api/auth/profile`)
- ❌ Password change endpoint (`PUT /api/auth/password`)
- ❌ Password reset flow (`POST /api/auth/reset`, `POST /api/auth/reset/confirm`)
- ❌ Email verification

**Model:** `User` (Prisma) ✅  
**Middleware:** `requireAuth`, `requireUserOrGuest` ✅

---

### 1.2 Screens/Devices + Pairing

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `GET /api/screens` - List screens (with stats, search, pagination) ✅
- `GET /api/screens/:id` - Get screen details ✅
- `GET /api/screens/:id/playlist` - Get screen's playlist ✅
- `GET /api/screens/:id/playlist/full` - Full playlist with media URLs ✅
- `PUT /api/screens/:id/playlist` - Assign playlist ✅
- `POST /api/screens/:id/heartbeat` - Device heartbeat ✅
- `DELETE /api/screens/:id` - Delete screen (soft delete) ✅
- `POST /api/screens/pair/initiate` - Start pairing ✅
- `POST /api/screens/pair/complete` - Complete pairing ✅
- `GET /api/screens/pair/peek/:code` - Check pairing code ✅
- `GET /api/screens/pair/active` - List active sessions ✅

**Model:** `Screen`, `PairingSession`, `PairCode` (Prisma) ✅  
**Real-time:** SSE broadcasts for pairing events ✅

**Missing:**
- ⚠️ C-Net registry endpoints (exists in B's server)

---

### 1.3 Playlists + Media Upload

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `GET /api/playlists` - List playlists ✅
- `GET /api/playlists/:id` - Get playlist details ✅
- `POST /api/playlists` - Create playlist ✅
- `PATCH /api/playlists/:id` - Update playlist ✅
- `DELETE /api/playlists/:id` - Delete playlist ✅
- `POST /api/upload/playlist-media` - Upload media (multipart) ✅
- `POST /api/uploads/create` - Upload media (JSON base64) ✅

**Models:** `Playlist`, `PlaylistItem`, `Media` (Prisma) ✅  
**Storage:** S3 + local fallback ✅  
**Optimization:** Video optimization queue ✅

**Notes:**
- Playlist validation includes `mediaId` requirements ✅
- Media cleanup and health checks exist ✅

---

### 1.4 Content Studio (Designs)

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `GET /api/contents` - List designs ✅
- `GET /api/contents/:id` - Load design ✅
- `POST /api/contents` - Save design ✅
- `PUT /api/contents/:id` - Update design ✅
- `DELETE /api/contents/:id` - Delete design ✅

**Model:** `Content` (Prisma) ✅  
**Features:**
- Thumbnail support ✅
- Optimistic locking (`version` field) ✅
- Default values for missing fields ✅

---

### 1.5 AI (Text/Image/Layout/Design Orchestration)

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `POST /api/ai/create` - Generate design from prompt ✅
- `POST /api/ai/layout` - Generate layout suggestions ✅
- `POST /api/ai/caption` - Generate captions ✅
- `POST /api/ai/palette` - Generate color palette ✅
- `POST /api/ai/plan-design` - Plan design workflow ✅
- `POST /api/ai/generate-design` - Full design generation ✅
- `POST /api/ai/text` - Generate text content ✅
- `POST /api/ai/image` - Generate images ✅
- `POST /api/ai/images/background` - Generate background images ✅
- `POST /api/studio/suggestions` - Get design suggestions ✅
- `GET /api/ai/stream` - AI SSE stream ✅
- `GET /api/trends` - List trend profiles ✅
- `GET /api/trends/:idOrSlug` - Get trend profile ✅

**Models:** `TrendProfile` (Prisma) ✅  
**Features:**
- Trend-aware generation ✅
- AI orchestration with metrics ✅

---

### 1.6 Journeys

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `GET /api/journeys/templates` - List journey templates ✅
- `GET /api/journeys/templates/:slug` - Get template ✅
- `POST /api/journeys/start` - Start journey instance ✅
- `GET /api/journeys/instances` - List instances ✅
- `GET /api/journeys/instances/:id` - Get instance ✅
- `PATCH /api/journeys/instances/:id` - Update instance ✅
- `POST /api/journeys/instances/:id/steps/:stepId/action` - Execute step ✅
- `GET /api/journeys/planner` - Get planner tasks ✅
- `GET /api/journeys/suggestions` - Get suggestions ✅
- `GET /api/journeys/analytics/funnel/:templateId` - Funnel analytics ✅
- `GET /api/journeys/analytics/metrics` - System metrics ✅

**Models:** `JourneyTemplate`, `JourneyInstance`, `JourneyStep`, `PlannerTask` (Prisma) ✅  
**Background Jobs:** Planner runner (60s polling) ✅

---

### 1.7 Assistant

**Status:** ✅ **Ready for production**

**Current Endpoints:**
- `POST /api/assistant/guest` - Create guest session ✅
- `POST /api/assistant/chat` - Chat with assistant ✅
- `POST /api/assistant/action` - Execute assistant action ✅
- `GET /api/assistant/summary` - Get conversation summary ✅

**Features:**
- Context-aware responses ✅
- Journey intent detection ✅
- Guest and authenticated user support ✅

**Missing:**
- ⚠️ OpenAI integration incomplete (uses mock responses)
- ⚠️ No conversation history storage

---

### 1.8 Debug/Admin Tools

**Status:** ⚠️ **Experimental/Development Only**

**Current Endpoints:**
- `GET /api/debug/pairing-stats` - Debug pairing statistics (dev only) ✅
- `POST /api/admin/scan-missing-media` - Scan for missing media ✅
- `GET /api/admin/media-stats` - Media statistics ✅
- `GET /api/admin/missing-media` - List missing media ✅
- `POST /api/admin/s3-cleanup` - S3 cleanup ✅
- `POST /api/admin/media/cleanup/orphans` - Cleanup orphaned media ✅
- `POST /api/admin/media/cleanup/originals` - Cleanup original files ✅
- `GET /api/admin/media/health` - Media health check ✅

**Notes:**
- Admin routes exist but lack proper auth middleware (`requireAdmin`)
- Debug routes only enabled in development

---

## Section 2: Backend Gaps for "New Main Product V1"

### 2.1 Campaigns: Full CRUD + Analytics

**Current State in C:**
- ✅ `Campaign` model exists in Prisma schema
- ⚠️ Only `GET /api/campaigns/:id` exists (`/api/workflows/:id/execute` creates campaign)
- ❌ No list, create, update, delete endpoints

**Current State in B:**
- ✅ Full CRUD routes exist in `cardbey-marketing-dashboard/server/routes/campaigns.js`
- ✅ Working implementation

**Migration Strategy:**
- **Action:** Migrate routes from B's server
- **Reference:** `cardbey-marketing-dashboard/server/routes/campaigns.js`
- **Model:** Use existing `Campaign` model
- **Endpoints Needed:**
  - `GET /api/campaigns` - List campaigns (with filters, pagination)
  - `POST /api/campaigns` - Create campaign
  - `GET /api/campaigns/:id` - Get campaign (exists via workflows, needs standalone)
  - `PUT /api/campaigns/:id` - Update campaign
  - `DELETE /api/campaigns/:id` - Delete campaign
  - `PATCH /api/campaigns/:id/status` - Update status (DRAFT/SCHEDULED/RUNNING/DONE)
  - `GET /api/campaigns/:id/analytics` - Campaign analytics

**Priority:** P0 (Critical)

---

### 2.2 Insights/Metrics: Dashboard + Screen/Campaign Performance

**Current State in C:**
- ✅ Basic screen stats: `GET /api/screens?stats=1`
- ✅ Journey funnel analytics: `GET /api/journeys/analytics/*`
- ✅ AI orchestration metrics: `GET /api/ai/metrics`
- ❌ No dashboard overview endpoint
- ❌ No comprehensive insights endpoint
- ❌ No campaign performance metrics

**Current State in B:**
- ✅ `GET /api/metrics` - General metrics
- ✅ `GET /api/insights` - Insights dashboard
- ✅ `GET /api/dashboard` - Dashboard overview
- ✅ `GET /api/dashboard/insights` - AI insights

**Migration Strategy:**
- **Action:** Migrate and consolidate from B's server
- **Reference:** `cardbey-marketing-dashboard/server/routes/metrics.js`, `insights.js`, `dashboard.routes.js`
- **Endpoints Needed:**
  - `GET /api/dashboard` - Dashboard overview (screen counts, playlist stats, recent activity)
  - `GET /api/dashboard/insights` - AI-powered insights
  - `GET /api/metrics` - General system metrics
  - `GET /api/insights` - Insights dashboard
  - `GET /api/analytics/screens` - Screen performance analytics
  - `GET /api/analytics/campaigns` - Campaign performance analytics
  - `GET /api/analytics/playlists` - Playlist analytics

**Priority:** P0 (Critical)

---

### 2.3 Business/Store CRUD

**Current State in C:**
- ✅ `Business` model exists in Prisma schema
- ❌ No CRUD endpoints
- ✅ `CREATE_STORE` action exists in `src/services/actions.js` (for journeys)

**Current State in B:**
- ❓ Unknown if B has business routes

**Current State in A:**
- ❓ May have store endpoints in legacy API

**Migration Strategy:**
- **Action:** Implement from scratch using C's patterns
- **Reference:** Use `CREATE_STORE` action as reference, `Business` model structure
- **Endpoints Needed:**
  - `GET /api/business` - Get user's business
  - `POST /api/business` - Create business
  - `PUT /api/business/:id` - Update business
  - `GET /api/business/:slug` - Get business by slug (public, for store pages)
  - `DELETE /api/business/:id` - Delete business (soft delete)

**Priority:** P0 (Critical for public store pages)

---

### 2.4 User Profile Updates & Password Change

**Current State in C:**
- ✅ `GET /api/auth/me` exists (read-only)
- ❌ No update endpoints

**Migration Strategy:**
- **Action:** Implement from scratch using C's patterns
- **Endpoints Needed:**
  - `GET /api/auth/profile` - Get full profile (with business)
  - `PUT /api/auth/profile` - Update profile (displayName, email, etc.)
  - `PUT /api/auth/password` - Change password

**Priority:** P0 (Critical for user account management)

---

### 2.5 Notifications: SSE + Optional Persistence

**Current State in C:**
- ✅ SSE stream exists: `GET /api/stream`
- ✅ SSE broadcasts for pairing events
- ❌ No notification model/storage
- ❌ No notification history
- ❌ No notification preferences

**Current State in B:**
- ✅ Enhanced SSE: `GET /api/events` (SSE per-store)
- ✅ SSE event bus (background job)

**Migration Strategy:**
- **Action:** Enhance existing SSE, add notification model
- **Reference:** Use existing SSE infrastructure in C
- **Endpoints Needed:**
  - `GET /api/notifications` - List notifications (with filters)
  - `GET /api/notifications/unread` - Count unread notifications
  - `PATCH /api/notifications/:id/read` - Mark as read
  - `PATCH /api/notifications/read-all` - Mark all as read
  - `GET /api/notifications/preferences` - Get notification preferences
  - `PUT /api/notifications/preferences` - Update preferences

**Model Needed:** `Notification` (Prisma) - new model

**Priority:** P1 (Important, but can use SSE without persistence initially)

---

### 2.6 C-Net Registry/Player Metadata

**Current State in C:**
- ✅ Screen pairing and management exists
- ✅ Device heartbeat exists
- ❌ No C-Net registry endpoints
- ❌ No player configuration metadata

**Current State in B:**
- ✅ `POST /api/cnet` - C-Net registry/player endpoints
- ✅ Player configuration

**Migration Strategy:**
- **Action:** Migrate from B's server
- **Reference:** `cardbey-marketing-dashboard/server/routes/cnet.js`
- **Endpoints Needed:**
  - `POST /api/cnet/register` - Register player
  - `GET /api/cnet/players` - List players
  - `POST /api/cnet/heartbeat` - Player heartbeat
  - `GET /api/cnet/config` - Get player configuration
  - `PUT /api/cnet/config` - Update player configuration

**Priority:** P1 (Important for device management dashboard)

---

### 2.7 Universal Search

**Current State in C:**
- ❌ No search endpoints
- ✅ Screen search: `GET /api/screens?q=...`
- ✅ Playlist search: `GET /api/playlists?q=...`

**Current State in A:**
- ❓ May have search endpoints in legacy API

**Migration Strategy:**
- **Action:** Implement from scratch
- **Endpoints Needed:**
  - `GET /api/search?q=...&type=product|service|store|media` - Universal search
  - `GET /api/search/suggestions?q=...` - Search autocomplete

**Models:** Search across `Business`, `Media`, `Content` (and future `Product`, `Service` models)

**Priority:** P1 (Important for public catalog pages)

---

### 2.8 Products/Services Models

**Current State in C:**
- ❌ No `Product` or `Service` models
- ⚠️ Can use `Media` with metadata for now

**Current State in A:**
- ❓ May have product/service models in legacy API

**Migration Strategy:**
- **Option 1 (Quick):** Use `Media` with JSON metadata to store product/service info
- **Option 2 (Proper):** Create `Product` and `Service` models, link to `Business`
- **Recommendation:** Start with Option 1, migrate to Option 2 in Phase 2

**Models Needed (Option 2):**
- `Product` (id, businessId, name, description, price, imageUrl, category, tags, ...)
- `Service` (id, businessId, name, description, price, duration, category, tags, ...)

**Priority:** P1 (Important for store pages, but can start with Media metadata)

---

## Section 3: Migration Phases

### Phase 1: Required for B+C to Replace A's Core Feel

**Timeline:** Week 1-2

**Goal:** Essential backend features for basic product functionality

**Domains to Touch:**

1. **Auth & Users** (`src/routes/auth.js`)
   - **Action:** Extend existing auth routes
   - **Tasks:**
     - Add `PUT /api/auth/profile` - Update profile
     - Add `PUT /api/auth/password` - Change password
   - **Strategy:** Implement from scratch using C's patterns
   - **Risk:** Low - straightforward extension
   - **Mitigation:** Test thoroughly with existing auth flow

2. **Business/Store CRUD** (`src/routes/business.js` - new)
   - **Action:** Implement from scratch
   - **Tasks:**
     - Create `src/routes/business.js`
     - Implement full CRUD endpoints
     - Add slug-based public lookup
   - **Strategy:** Use `Business` model, follow C's route patterns
   - **Reference:** `src/services/actions.js` (`CREATE_STORE` action)
   - **Risk:** Low - model exists, straightforward CRUD
   - **Mitigation:** Validate slug uniqueness, handle soft deletes

3. **Campaigns CRUD** (`src/routes/campaigns.js` - new)
   - **Action:** Migrate from B's server
   - **Tasks:**
     - Copy `cardbey-marketing-dashboard/server/routes/campaigns.js`
     - Adapt to C's structure (Prisma, middleware, error handling)
     - Mount in `src/server.js`
   - **Strategy:** Migrate code, adapt patterns
   - **Reference:** `cardbey-marketing-dashboard/server/routes/campaigns.js`
   - **Risk:** Medium - need to ensure Prisma compatibility
   - **Mitigation:** Test each endpoint, verify Campaign model relationships

4. **Basic Insights/Metrics** (`src/routes/dashboard.js`, `src/routes/metrics.js` - new)
   - **Action:** Migrate from B's server, consolidate
   - **Tasks:**
     - Migrate `GET /api/dashboard` - Overview
     - Migrate `GET /api/metrics` - Basic metrics
     - Consolidate with existing screen stats
   - **Strategy:** Migrate code, merge with existing endpoints
   - **Reference:** `cardbey-marketing-dashboard/server/routes/dashboard.routes.js`, `metrics.js`
   - **Risk:** Medium - need to merge with existing stats
   - **Mitigation:** Use feature flags, test incrementally

5. **Screen + Playlist Integration Stability**
   - **Action:** Verify and enhance existing endpoints
   - **Tasks:**
     - Verify playlist assignment works correctly
     - Test playlist retrieval with media URLs
     - Ensure file existence checks work
   - **Strategy:** Testing and bug fixes only
   - **Risk:** Low - mostly verification
   - **Mitigation:** Comprehensive testing

**Deliverables:**
- ✅ User can update profile and change password
- ✅ User can create/manage their business/store
- ✅ User can create/manage campaigns
- ✅ Dashboard shows basic metrics and insights
- ✅ Screens and playlists work reliably

---

### Phase 2: Productisation

**Timeline:** Week 3-4

**Goal:** Rich features for production-ready product

**Domains to Touch:**

1. **Rich Insights/Metrics** (`src/routes/insights.js`, `src/routes/analytics.js` - new)
   - **Action:** Migrate from B's server, enhance
   - **Tasks:**
     - Migrate `GET /api/insights` - Insights dashboard
     - Migrate `GET /api/dashboard/insights` - AI insights
     - Create `GET /api/analytics/screens` - Screen analytics
     - Create `GET /api/analytics/campaigns` - Campaign analytics
   - **Strategy:** Migrate and enhance
   - **Risk:** Medium - complex analytics logic
   - **Mitigation:** Feature flags, gradual rollout

2. **Notifications** (`src/routes/notifications.js` - new, `Notification` model - new)
   - **Action:** Implement from scratch
   - **Tasks:**
     - Create `Notification` Prisma model
     - Create notification CRUD endpoints
     - Enhance SSE to persist notifications
     - Add notification preferences
   - **Strategy:** Implement from scratch using C's patterns
   - **Reference:** Use existing SSE infrastructure
   - **Risk:** Medium - need to integrate with SSE
   - **Mitigation:** Start with basic notifications, enhance incrementally

3. **C-Net Registry Enhancements** (`src/routes/cnet.js` - new)
   - **Action:** Migrate from B's server
   - **Tasks:**
     - Migrate C-Net registry endpoints
     - Integrate with existing screen management
     - Add player configuration endpoints
   - **Strategy:** Migrate code, integrate with existing screens
   - **Reference:** `cardbey-marketing-dashboard/server/routes/cnet.js`
   - **Risk:** Low - mostly migration
   - **Mitigation:** Test device registration flow

4. **Assistant/Journey Deeper Integrations**
   - **Action:** Enhance existing endpoints
   - **Tasks:**
     - Add conversation history storage
     - Complete OpenAI integration (replace mocks)
     - Add journey completion tracking
   - **Strategy:** Enhance existing code
   - **Risk:** Low - incremental improvements
   - **Mitigation:** Feature flags for OpenAI integration

5. **Universal Search** (`src/routes/search.js` - new)
   - **Action:** Implement from scratch
   - **Tasks:**
     - Create universal search endpoint
     - Create search suggestions endpoint
     - Index Business, Media, Content
   - **Strategy:** Implement from scratch
   - **Risk:** Medium - search complexity
   - **Mitigation:** Start with simple text search, enhance later

**Deliverables:**
- ✅ Rich analytics and insights available
- ✅ Notifications system with persistence
- ✅ C-Net registry integrated
- ✅ Search across all content types
- ✅ Enhanced assistant with conversation history

---

### Phase 3: Legacy Commerce/Booking/POS

**Timeline:** Week 5+ (Future)

**Goal:** Decide on legacy features - migrate vs. redesign vs. drop

**Decision Framework:**

**Option A: Migrate (If A has working commerce/booking/POS)**
- Wrap as separate modules in C
- Create `src/routes/commerce/`, `src/routes/bookings/`, `src/routes/pos/`
- Keep legacy API semantics for compatibility
- Gradually refactor to modern patterns

**Option B: Redesign (If A has outdated implementation)**
- Design new commerce/booking models in Prisma
- Implement modern RESTful APIs
- Migrate data from legacy system
- Create migration scripts

**Option C: Drop (If not needed for MVP)**
- Document what's being dropped
- Provide alternative solutions
- Focus on core digital signage features

**Recommended Approach:**
1. **Audit A's legacy API** to identify:
   - What commerce/booking/POS endpoints exist
   - Which are actively used
   - Data models and relationships
   - Business logic complexity

2. **Evaluate Necessity:**
   - Are these features critical for "New Main Product V1"?
   - Can they be replaced with simpler solutions?
   - What's the maintenance burden?

3. **Decision:**
   - **If critical:** Migrate (Option A or B)
   - **If not critical:** Drop (Option C) or defer to Phase 4

**Potential Legacy Modules:**
- Commerce (products, cart, checkout, orders)
- Bookings (appointments, scheduling, availability)
- POS (point-of-sale, payments, receipts)

**Risk:** High - depends on A's implementation complexity  
**Mitigation:** Thorough audit first, then decide on strategy

---

## Section 4: Backend Tickets

### P0 (Launch - Critical)

#### Ticket 1: Implement /api/business CRUD in cardbey-core
**Scope:** Create full CRUD endpoints for Business model. Endpoints: `GET /api/business` (user's business), `POST /api/business` (create), `PUT /api/business/:id` (update), `GET /api/business/:slug` (public lookup by slug), `DELETE /api/business/:id` (soft delete).  
**Reference Code:**
- `src/services/actions.js` (`CREATE_STORE` action)
- `prisma/schema.prisma` (`Business` model)
- Existing route patterns in `src/routes/auth.js`, `src/routes/contents.js`

**Acceptance Criteria:**
- User can create a business/store
- User can view their business
- User can update business info (name, description, logo, region)
- Public endpoint returns business by slug (for store pages)
- Soft delete preserves data but marks as inactive

**Files to Create/Modify:**
- `src/routes/business.js` (new)
- `src/server.js` (mount route)
- `src/middleware/auth.js` (add `requireBusiness` if needed)

---

#### Ticket 2: Migrate /api/campaigns CRUD from B server to C
**Scope:** Migrate full campaigns CRUD from B's server to C. Endpoints: `GET /api/campaigns` (list), `POST /api/campaigns` (create), `GET /api/campaigns/:id` (get), `PUT /api/campaigns/:id` (update), `DELETE /api/campaigns/:id` (delete), `PATCH /api/campaigns/:id/status` (update status). Use existing `Campaign` Prisma model.  
**Reference Code:**
- `cardbey-marketing-dashboard/server/routes/campaigns.js` (source)
- `src/routes/workflows.js` (existing campaign creation pattern)
- `prisma/schema.prisma` (`Campaign` model)

**Acceptance Criteria:**
- All CRUD operations work
- Campaign status transitions work (DRAFT → SCHEDULED → RUNNING → DONE)
- Campaigns are linked to users/businesses correctly
- Campaign analytics endpoint returns basic metrics

**Files to Create/Modify:**
- `src/routes/campaigns.js` (new)
- `src/server.js` (mount route)

---

#### Ticket 3: Migrate /api/dashboard and /api/metrics from B server to C
**Scope:** Migrate dashboard overview and metrics endpoints from B's server. Endpoints: `GET /api/dashboard` (overview with screen counts, playlist stats, recent activity), `GET /api/metrics` (general system metrics). Consolidate with existing screen stats.  
**Reference Code:**
- `cardbey-marketing-dashboard/server/routes/dashboard.routes.js` (source)
- `cardbey-marketing-dashboard/server/routes/metrics.js` (source)
- `src/routes/screens.js` (existing stats: `GET /api/screens?stats=1`)

**Acceptance Criteria:**
- Dashboard endpoint returns overview data
- Metrics endpoint returns system-wide metrics
- Existing screen stats still work
- Data is aggregated correctly

**Files to Create/Modify:**
- `src/routes/dashboard.js` (new)
- `src/routes/metrics.js` (new)
- `src/server.js` (mount routes)

---

#### Ticket 4: Add /api/auth/profile (update) + /api/auth/password/change
**Scope:** Extend auth routes to support profile updates and password changes. Endpoints: `GET /api/auth/profile` (get full profile with business), `PUT /api/auth/profile` (update profile), `PUT /api/auth/password` (change password).  
**Reference Code:**
- `src/routes/auth.js` (existing auth routes)
- `prisma/schema.prisma` (`User` model)

**Acceptance Criteria:**
- User can update displayName, email (if email update is allowed)
- User can change password (with current password verification)
- Profile endpoint returns full user data including business
- Password changes invalidate existing sessions (if needed)

**Files to Create/Modify:**
- `src/routes/auth.js` (extend existing)

---

### P1 (Post-Launch - Important)

#### Ticket 5: Migrate /api/insights and /api/dashboard/insights to C
**Scope:** Migrate insights endpoints from B's server. Endpoints: `GET /api/insights` (insights dashboard), `GET /api/dashboard/insights` (AI-powered insights).  
**Reference Code:**
- `cardbey-marketing-dashboard/server/routes/insights.js` (source)
- `cardbey-marketing-dashboard/server/routes/insights.routes.js` (source)
- `src/routes/ai/metrics/router.js` (existing AI metrics)

**Acceptance Criteria:**
- Insights dashboard returns relevant insights
- AI insights integrate with existing AI orchestration
- Insights are user/business-scoped

**Files to Create/Modify:**
- `src/routes/insights.js` (new)
- `src/server.js` (mount route)

---

#### Ticket 6: Migrate C-Net registry endpoints from B server to C
**Scope:** Migrate C-Net player registry endpoints from B's server. Endpoints: `POST /api/cnet/register` (register player), `GET /api/cnet/players` (list players), `POST /api/cnet/heartbeat` (player heartbeat), `GET /api/cnet/config` (get config), `PUT /api/cnet/config` (update config). Integrate with existing screen management.  
**Reference Code:**
- `cardbey-marketing-dashboard/server/routes/cnet.js` (source)
- `src/routes/screens.js` (existing screen management)
- `src/routes/player.js` (existing player config)

**Acceptance Criteria:**
- Player registration works
- Player list shows all registered players
- Player heartbeat integrates with screen heartbeat
- Player configuration is stored and retrievable

**Files to Create/Modify:**
- `src/routes/cnet.js` (new)
- `src/routes/screens.js` (integrate with C-Net)
- `src/server.js` (mount route)

---

#### Ticket 7: Implement universal search endpoint
**Scope:** Create universal search endpoint that searches across Business, Media, Content, and future Product/Service models. Endpoints: `GET /api/search?q=...&type=product|service|store|media` (search), `GET /api/search/suggestions?q=...` (autocomplete).  
**Reference Code:**
- `src/routes/screens.js` (existing search: `GET /api/screens?q=...`)
- `src/routes/playlists.js` (existing search: `GET /api/playlists?q=...`)
- Search patterns from other routes

**Acceptance Criteria:**
- Search works across all content types
- Type filter narrows results correctly
- Search suggestions return relevant autocomplete options
- Search is case-insensitive and handles typos (basic)

**Files to Create/Modify:**
- `src/routes/search.js` (new)
- `src/server.js` (mount route)

---

#### Ticket 8: Create Notification model and basic notification endpoints
**Scope:** Create `Notification` Prisma model and basic CRUD endpoints. Endpoints: `GET /api/notifications` (list), `GET /api/notifications/unread` (count unread), `PATCH /api/notifications/:id/read` (mark as read), `PATCH /api/notifications/read-all` (mark all as read).  
**Reference Code:**
- Existing Prisma models for structure
- SSE infrastructure for real-time notifications

**Acceptance Criteria:**
- Notification model created and migrated
- Users can list their notifications
- Users can mark notifications as read
- Unread count works correctly

**Files to Create/Modify:**
- `prisma/schema.prisma` (add `Notification` model)
- `src/routes/notifications.js` (new)
- `src/server.js` (mount route)
- Migration file

---

#### Ticket 9: Migrate /api/analytics/screens and /api/analytics/campaigns
**Scope:** Create analytics endpoints for screens and campaigns. Endpoints: `GET /api/analytics/screens` (screen performance), `GET /api/analytics/campaigns` (campaign performance).  
**Reference Code:**
- `cardbey-marketing-dashboard/server/routes/metrics.js` (if has analytics)
- `src/routes/screens.js` (existing screen data)
- `src/routes/campaigns.js` (existing campaign data)

**Acceptance Criteria:**
- Screen analytics return performance metrics
- Campaign analytics return campaign metrics
- Analytics are aggregated over time periods

**Files to Create/Modify:**
- `src/routes/analytics.js` (new)
- `src/server.js` (mount route)

---

### P2 (Later - Future Enhancements)

#### Ticket 10: Design commerce/booking/POS integration strategy
**Scope:** Audit A's legacy API to identify commerce/booking/POS endpoints. Evaluate necessity and decide: migrate vs. redesign vs. drop. Document decision and create implementation plan if migrating.  
**Reference Code:**
- A's legacy API (needs audit)
- A's database schema (if available)

**Acceptance Criteria:**
- Decision document created (migrate/redesign/drop)
- If migrating: implementation plan created
- If redesigning: new schema design created
- If dropping: alternative solutions documented

**Files to Create:**
- `docs/LEGACY_API_AUDIT.md` (new)
- `docs/COMMERCE_MIGRATION_PLAN.md` (if migrating)

---

## Summary

**Total Backend Tickets:** 10  
**P0 (Launch):** 4 tickets  
**P1 (Post-Launch):** 5 tickets  
**P2 (Later):** 1 ticket

**Estimated Timeline:**
- **Phase 1 (P0):** Week 1-2
- **Phase 2 (P1):** Week 3-4
- **Phase 3 (P2):** Week 5+ (future)

**Key Deliverables:**
- ✅ Single backend (C) serving all frontends
- ✅ All B's routes migrated to C
- ✅ Essential features for B+C to replace A
- ✅ Foundation for future enhancements

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-25  
**Status:** Ready for Implementation



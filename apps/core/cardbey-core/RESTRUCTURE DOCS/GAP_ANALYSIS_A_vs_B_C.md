# Gap Analysis: cardbey-web-latest (A) vs Marketing Dashboard + Core (B+C)

**Date:** 2025-01-25  
**Purpose:** Identify all features, pages, and technical gaps that must be addressed for B+C to fully replace A as the Cardbey website.

---

## 1. Feature Coverage Matrix

| Feature/Domain | Implemented in A? | Implemented in B? | Supported by Core (C)? | Notes |
|---|---|---|---|---|
| **Authentication & Users** | ✔ | ✔ | ✔ | B uses C's auth endpoints |
| Email/Password Login | ✔ | ✔ | ✔ | `/api/auth/login` |
| User Registration | ✔ | ❓ | ✔ | `/api/auth/register` |
| User Profile Management | ❓ | ❓ | ⚠️ Partial | Only `/api/auth/me`, no update endpoints |
| OAuth (Facebook/TikTok) | ❓ | ❓ | ✔ | Routes exist, may need frontend integration |
| Password Reset | ❓ | ❓ | ❌ | Not implemented |
| **Onboarding** | ❓ | ❓ | ⚠️ Partial | Journey system exists, may not match A's onboarding |
| Onboarding Flow | ❓ | ❓ | ⚠️ Partial | Journey templates, but no dedicated onboarding endpoint |
| Onboarding Progress Tracking | ❓ | ❓ | ⚠️ Partial | `User.onboarding` JSON field exists |
| **Screens/Devices** | ✔ | ✔ | ✔ | Fully implemented |
| Screen Management (CRUD) | ✔ | ✔ | ✔ | `/api/screens` |
| Screen Pairing | ✔ | ✔ | ✔ | `/api/screens/pair/*` |
| Screen Status Monitoring | ✔ | ✔ | ✔ | Heartbeat + SSE |
| Screen Playlist Assignment | ✔ | ✔ | ✔ | `/api/screens/:id/playlist` |
| C-Net Player Integration | ✔ | ✔ | ⚠️ Partial | Player routes exist in B's server, needs migration |
| **Playlists** | ✔ | ✔ | ✔ | Fully implemented |
| Playlist CRUD | ✔ | ✔ | ✔ | `/api/playlists` |
| Playlist Items Management | ✔ | ✔ | ✔ | Part of playlist endpoints |
| Media Upload for Playlists | ✔ | ✔ | ✔ | `/api/uploads/create` |
| **Content Studio** | ❓ | ✔ | ✔ | B has it, A may not |
| Design Creation/Editing | ❓ | ✔ | ✔ | `/api/contents` CRUD |
| Design Library | ❓ | ✔ | ✔ | List + preview |
| Design Export/Render | ❓ | ✔ | ⚠️ Partial | `renderSlide` field, but no export endpoint |
| **AI Design Assistant** | ❓ | ✔ | ✔ | Multiple AI endpoints |
| AI Text Generation | ❓ | ✔ | ✔ | `/api/ai/text` |
| AI Image Generation | ❓ | ✔ | ✔ | `/api/ai/image`, `/api/ai/images/background` |
| AI Layout Suggestions | ❓ | ✔ | ✔ | `/api/ai/layout` |
| AI Color Palette | ❓ | ✔ | ✔ | `/api/ai/palette` |
| AI Design Orchestration | ❓ | ✔ | ✔ | `/api/ai/create`, `/api/ai/generate-design` |
| Trend Profiles | ❓ | ✔ | ✔ | `/api/trends` |
| **Campaigns** | ❓ | ✔ | ⚠️ Partial | Model exists, but limited endpoints (only GET by ID) |
| Campaign CRUD | ❓ | ⚠️ Partial | ⚠️ Partial | B has `/api/campaigns`, C only has GET |
| Campaign Management | ❓ | ✔ | ❌ | B's server has full CRUD, needs migration |
| Campaign Analytics | ❓ | ⚠️ Partial | ❌ | B has `/api/metrics`, needs migration |
| **Performer Tasks/AI** | ❓ | ✔ | ❌ | B has `/api/performer`, `/api/performer/stream` |
| Performer AI Orchestration | ❓ | ✔ | ❌ | B's server, needs migration to C |
| Performer Streaming | ❓ | ✔ | ❌ | B's SSE implementation, needs migration |
| **Rewards/Behavior** | ❓ | ✔ | ❌ | B has `/api/rewards`, not in C |
| Rewards System | ❓ | ✔ | ❌ | B's server, needs migration |
| **Agents/Orchestration** | ❓ | ✔ | ❌ | B has `/api/agents`, C has different orchestration |
| Agent Management | ❓ | ✔ | ❌ | B's server, needs migration |
| **Share/Export** | ❓ | ✔ | ❌ | B has `/api/share`, not in C |
| Content Sharing | ❓ | ✔ | ❌ | B's server, needs migration |
| **Feeds** | ❓ | ✔ | ❌ | B has `/api/feeds` (public store feed), not in C |
| Public Store Feeds | ❓ | ✔ | ❌ | B's server, needs migration |
| **CAI Credits/Points** | ❓ | ✔ | ❌ | B has `/api/cai`, not in C |
| Credits System | ❓ | ✔ | ❌ | B's server, needs migration |
| **C-Net Registry** | ❓ | ✔ | ❌ | B has `/api/cnet`, C has pairing but not registry |
| C-Net Player Registry | ❓ | ✔ | ❌ | B's server, needs migration |
| **Journeys** | ❓ | ❓ | ✔ | Multi-step playbooks system |
| Journey Templates | ❓ | ❓ | ✔ | `/api/journeys/templates` |
| Journey Instances | ❓ | ❓ | ✔ | `/api/journeys/instances` |
| Journey Planner | ❓ | ❓ | ✔ | `/api/journeys/planner` |
| **Assistant Chatbot** | ❓ | ❓ | ✔ | `/api/assistant/*` |
| Guest Chat | ❓ | ❓ | ✔ | `/api/assistant/guest` |
| Context-Aware Chat | ❓ | ❓ | ✔ | `/api/assistant/chat` |
| Action Execution | ❓ | ❓ | ✔ | `/api/assistant/action` |
| **Workflows** | ❓ | ❓ | ⚠️ Partial | `/api/workflows/from-prompt`, limited |
| Workflow Creation | ❓ | ❓ | ⚠️ Partial | Prompt-based only |
| Workflow Execution | ❓ | ❓ | ⚠️ Partial | `/api/workflows/:id/execute` |
| **Insights/Analytics** | ❓ | ✔ | ⚠️ Partial | B has `/api/insights`, `/api/dashboard/insights` |
| Dashboard Analytics | ❓ | ✔ | ❌ | B's server, needs migration |
| AI Insights | ❓ | ✔ | ⚠️ Partial | B has enhanced insights, C has basic |
| Screen Analytics | ❓ | ❓ | ⚠️ Partial | Screen stats in `/api/screens?stats=1` |
| Journey Analytics | ❓ | ❓ | ✔ | `/api/journeys/analytics/*` |
| **Integrations** | ❓ | ✔ | ⚠️ Partial | B has `/api/integrations/status`, C has `/api/oauth/status` |
| OAuth Integration Status | ❓ | ✔ | ✔ | Both have status endpoints |
| Integration Management | ❓ | ✔ | ❌ | B may have more, needs audit |
| **Schedules** | ❓ | ❓ | ❌ | No scheduling system in C |
| Content Scheduling | ❓ | ❓ | ❌ | Not implemented |
| Playlist Scheduling | ❓ | ❓ | ❌ | Not implemented |
| **Billing/Credits** | ❓ | ❓ | ❌ | No billing system |
| Subscription Management | ❓ | ❓ | ❌ | Not implemented |
| Credit System | ❓ | ⚠️ Partial | ❌ | B has `/api/cai` (credits), but no full billing |
| Payment Processing | ❓ | ❓ | ❌ | Not implemented |
| **Business/Store Management** | ❓ | ❓ | ⚠️ Partial | Model exists in schema, no CRUD endpoints |
| Business Profile | ❓ | ❓ | ⚠️ Partial | `Business` model exists, no endpoints |
| Store Management | ❓ | ❓ | ❌ | Not implemented |
| **Demands (User Intent)** | ❓ | ❓ | ✔ | `/api/demands` - analytics/tracking |
| Intent Tracking | ❓ | ❓ | ✔ | Available but may not be used |
| **Real-time/SSE** | ✔ | ✔ | ✔ | `/api/stream` SSE implementation |
| SSE Stream | ✔ | ✔ | ✔ | Both A and B use it |
| WebSocket Support | ❓ | ❓ | ✔ | Available in C |
| **Admin Tools** | ❓ | ❓ | ⚠️ Partial | `/api/admin/*` exists but limited |
| Media Cleanup | ❓ | ❓ | ✔ | `/api/admin/media/*` |
| System Diagnostics | ❓ | ❓ | ✔ | `/api/debug/*`, `/api/health` |
| **Assets Library** | ❓ | ✔ | ⚠️ Partial | `/api/assets/search`, but limited |
| Asset Search | ❓ | ✔ | ✔ | Available |
| Template Library | ❓ | ❓ | ⚠️ Partial | Journey templates, but no design templates |

**Legend:**
- ✔ = Fully implemented
- ⚠️ = Partially implemented or needs enhancement
- ❌ = Not implemented
- ❓ = Unknown (needs audit of A)

---

## 2. Missing Pieces for B+C to Replace A

### 2.1 Backend Support Already Exists (Only UI Missing)

1. **User Profile Management**
   - **Status:** Backend has `/api/auth/me` (read-only)
   - **Missing:** Update profile endpoints, password change
   - **Action:** Create `/api/auth/profile` update endpoint

2. **Business/Store CRUD**
   - **Status:** `Business` model exists in schema
   - **Missing:** CRUD endpoints (`/api/business` or `/api/stores`)
   - **Action:** Create business management routes

3. **Campaign Full CRUD**
   - **Status:** `Campaign` model exists, but only GET by ID
   - **Missing:** List, create, update, delete endpoints
   - **Action:** Create `/api/campaigns` CRUD routes (migrate from B's server)

4. **Journey System UI**
   - **Status:** Full backend implementation
   - **Missing:** Frontend UI for journey templates and instances
   - **Action:** Build journey UI in B

5. **Assistant Chatbot UI**
   - **Status:** Backend routes exist and mounted
   - **Missing:** Frontend chatbot component/widget
   - **Action:** Build assistant UI component (floating chat widget)

### 2.2 Backend Partially Exists (Needs Extension)

1. **Campaigns Management**
   - **Current:** Only `GET /api/campaigns/:id` exists
   - **Needs:** Full CRUD (list, create, update, delete)
   - **Source:** Migrate from B's `/api/campaigns` routes
   - **Priority:** HIGH

2. **Analytics/Insights**
   - **Current:** Basic screen stats, journey funnel analytics
   - **Needs:** Dashboard analytics, AI insights, screen performance
   - **Source:** Migrate from B's `/api/insights`, `/api/dashboard/insights`, `/api/metrics`
   - **Priority:** HIGH

3. **C-Net Player Integration**
   - **Current:** Pairing and device management
   - **Needs:** Player registry, player configuration endpoints
   - **Source:** Migrate from B's `/api/cnet` routes
   - **Priority:** MEDIUM

4. **Workflows**
   - **Current:** Prompt-based workflow creation only
   - **Needs:** Full workflow CRUD, workflow templates, scheduling
   - **Priority:** MEDIUM

5. **Assets Library**
   - **Current:** Basic search endpoint
   - **Needs:** Upload assets, organize into libraries, template marketplace
   - **Priority:** MEDIUM

### 2.3 Backend Exists Only in A (Must Migrate to C)

Based on MIGRATION_PLAN.md, these routes exist in B's server and need migration to C:

#### High Priority Migrations

1. **Campaigns CRUD** (`/api/campaigns`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/campaigns.js`
   - **Action:** Migrate to `src/routes/campaigns.js`
   - **Priority:** HIGH

2. **Analytics/Metrics** (`/api/metrics`, `/api/insights`, `/api/dashboard`)
   - **Location:** Multiple route files in B's server
   - **Action:** Consolidate and migrate to C
   - **Priority:** HIGH

3. **Performer AI** (`/api/performer`, `/api/performer/stream`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/performer.js`
   - **Action:** Migrate to `src/routes/performer.js`
   - **Priority:** HIGH (if B uses it)

4. **C-Net Registry** (`/api/cnet`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/cnet.js`
   - **Action:** Migrate to `src/routes/cnet.js`
   - **Priority:** MEDIUM

#### Medium Priority Migrations

5. **Rewards System** (`/api/rewards`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/rewards.js`
   - **Action:** Migrate to `src/routes/rewards.js`
   - **Priority:** MEDIUM

6. **Agent Orchestration** (`/api/agents`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/agents.js`
   - **Action:** Migrate to `src/routes/agents.js`
   - **Priority:** MEDIUM

7. **Share/Export** (`/api/share`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/share.js`
   - **Action:** Migrate to `src/routes/share.js`
   - **Priority:** MEDIUM

8. **Public Feeds** (`/api/feeds`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/feeds.js`
   - **Action:** Migrate to `src/routes/feeds.js`
   - **Priority:** LOW (if public-facing)

9. **CAI Credits** (`/api/cai`)
   - **Location:** `cardbey-marketing-dashboard/server/routes/cai.js`
   - **Action:** Migrate to `src/routes/cai.js` or integrate into billing system
   - **Priority:** MEDIUM

10. **Integrations Status** (`/api/integrations/status`)
    - **Location:** `cardbey-marketing-dashboard/server/routes/integrations.routes.js`
    - **Action:** Merge with C's `/api/oauth/status`
    - **Priority:** LOW

11. **Schedules** (`/api/schedules`)
    - **Location:** `cardbey-marketing-dashboard/server/routes/schedules.js`
    - **Action:** Migrate to `src/routes/schedules.js`
    - **Priority:** MEDIUM

12. **Enhanced SSE/Events** (`/api/events`, `/events`)
    - **Location:** `cardbey-marketing-dashboard/server/routes/events.js`
    - **Action:** Merge with C's `/api/stream` SSE implementation
    - **Priority:** MEDIUM

---

## 3. UI Gaps

### 3.1 Missing Public Site Pages

Based on typical SaaS websites and core.config.json structure, A likely has these pages that B may not:

1. **Hero/Landing Page** (`/`)
   - **Status:** ❓ Unknown if B has landing page
   - **Action:** Create or verify landing page exists in B
   - **Priority:** HIGH

2. **Pricing Page** (`/pricing`)
   - **Status:** ❌ Not found in documentation
   - **Action:** Create pricing page
   - **Priority:** HIGH (if A has it)

3. **About Page** (`/about`)
   - **Status:** ❓ Unknown
   - **Action:** Create or verify
   - **Priority:** MEDIUM

4. **"What is Cardbey" / Features** (`/features` or `/what-is-cardbey`)
   - **Status:** ❓ Unknown
   - **Action:** Create product features page
   - **Priority:** HIGH

5. **Documentation/Help** (`/docs` or `/help`)
   - **Status:** ❓ Unknown
   - **Action:** Create documentation pages
   - **Priority:** MEDIUM

6. **Blog/Resources** (`/blog`)
   - **Status:** ❓ Unknown
   - **Action:** Create if A has it
   - **Priority:** LOW

7. **Contact/Support** (`/contact`)
   - **Status:** ❓ Unknown
   - **Action:** Create contact page
   - **Priority:** MEDIUM

8. **Terms of Service** (`/terms`)
   - **Status:** ❓ Unknown
   - **Action:** Create legal pages
   - **Priority:** MEDIUM

9. **Privacy Policy** (`/privacy`)
   - **Status:** ❓ Unknown
   - **Action:** Create legal pages
   - **Priority:** MEDIUM

10. **Public Frontscreen Page** (`/frontscreen`)
    - **Status:** ⚠️ A serves `/frontscreen` static HTML
    - **Action:** Migrate frontscreen page to B or serve from C
    - **Priority:** MEDIUM

### 3.2 Missing Account-Level Pages

1. **User Profile Settings** (`/settings` or `/profile`)
   - **Status:** ⚠️ Backend has `/api/auth/me` but no update endpoint
   - **Action:** Create profile settings page + backend endpoint
   - **Priority:** HIGH

2. **Billing/Subscription** (`/billing` or `/subscription`)
   - **Status:** ❌ No billing system exists
   - **Action:** Create billing pages (if A has them)
   - **Priority:** HIGH (if A has billing)

3. **Workspace/Team Selection** (`/workspace` or `/team`)
   - **Status:** ❓ Unknown if multi-tenant
   - **Action:** Create workspace selection if multi-tenant
   - **Priority:** MEDIUM

4. **Account Settings** (`/settings/account`)
   - **Status:** ❓ Unknown
   - **Action:** Create account settings page
   - **Priority:** HIGH

5. **Notifications Settings** (`/settings/notifications`)
   - **Status:** ❌ No notification system
   - **Action:** Create if A has it
   - **Priority:** MEDIUM

6. **Integrations Settings** (`/settings/integrations`)
   - **Status:** ⚠️ OAuth exists, but no settings UI documented
   - **Action:** Create integrations management page
   - **Priority:** MEDIUM

7. **API Keys/Settings** (`/settings/api`)
   - **Status:** ❓ Unknown
   - **Action:** Create if A has API keys
   - **Priority:** LOW

### 3.3 Missing Dashboard Pages

1. **Campaigns Management** (`/campaigns`)
   - **Status:** ⚠️ Backend partially exists, B may have UI
   - **Action:** Verify and complete if needed
   - **Priority:** HIGH

2. **Analytics Dashboard** (`/analytics` or `/insights`)
   - **Status:** ⚠️ Backend partially exists
   - **Action:** Create or verify analytics dashboard
   - **Priority:** HIGH

3. **Journey Templates Browser** (`/journeys` or `/templates`)
   - **Status:** ⚠️ Backend fully implemented
   - **Action:** Create journey UI pages
   - **Priority:** MEDIUM

4. **Journey Instances** (`/journeys/my-journeys`)
   - **Status:** ⚠️ Backend fully implemented
   - **Action:** Create journey instances page
   - **Priority:** MEDIUM

5. **Performer Tasks** (`/performer` or `/tasks`)
   - **Status:** ❌ Backend in B's server, needs migration
   - **Action:** Create performer UI after backend migration
   - **Priority:** MEDIUM

6. **Schedules** (`/schedules`)
   - **Status:** ❌ Backend in B's server, needs migration
   - **Action:** Create schedules UI after backend migration
   - **Priority:** MEDIUM

---

## 4. Technical Integration Gaps

### 4.1 Global App Shell

**Issue:** B may not have a unified app shell that handles:
- Public routes (landing, pricing, etc.)
- Authenticated routes (dashboard)
- Shared navigation/header
- Auth state management

**Action:**
- Create root layout component with route-based rendering
- Implement public vs. authenticated layout separation
- Shared header/footer components

**Priority:** HIGH

### 4.2 Shared API Client

**Issue:** B may have fragmented API clients for different features

**Action:**
- Create unified API client (`src/api/client.ts`)
- Centralized error handling
- Auth token injection
- Request/response interceptors

**Priority:** HIGH

### 4.3 Auth/Session Handling

**Issue:** Mismatch between A and B's auth flow

**Current State:**
- C uses JWT tokens (`Bearer <token>`)
- C has `/api/auth/me` for session validation
- B uses C's auth endpoints (based on recent fixes)

**Actions Needed:**
- Verify B uses C's auth endpoints consistently
- Ensure token storage (localStorage/sessionStorage) matches A's pattern
- Implement token refresh if needed
- Handle auth redirects (login → dashboard)

**Priority:** HIGH

### 4.4 SSE/WebSocket Integration

**Current State:**
- C has `/api/stream` SSE endpoint
- Both A and B use SSE
- B may have enhanced SSE (`/api/events`) that needs migration

**Actions Needed:**
- Verify B uses C's `/api/stream` endpoint
- Migrate B's enhanced SSE features to C if needed
- Ensure SSE reconnection logic works
- Test SSE in both public and authenticated contexts

**Priority:** MEDIUM

### 4.5 Route Configuration

**Issue:** A uses different route structure than B

**Actions Needed:**
- Audit A's route structure (e.g., `/frontscreen`, public routes)
- Ensure B can handle all A's routes (or create redirects)
- Implement 404 fallback to SPA correctly

**Priority:** MEDIUM

### 4.6 Static Asset Serving

**Current State:**
- C serves static assets at `/uploads/*`, `/assets/*`
- A's server serves build files
- `core.config.json` configures static dirs

**Actions Needed:**
- Verify static asset paths match between A and B
- Ensure C serves B's build files correctly in production
- Handle asset versioning/caching

**Priority:** MEDIUM

---

## 5. Priority List

### 5.1 Must-Have for B+C to be a Full Website

#### Backend (Core C)

1. **Migrate Campaigns CRUD** from B's server
   - **Effort:** Medium
   - **Impact:** HIGH
   - **Dependencies:** None

2. **Migrate Analytics/Insights** from B's server
   - **Effort:** High
   - **Impact:** HIGH
   - **Dependencies:** None

3. **Create Campaign Full CRUD** endpoints in C
   - **Effort:** Medium
   - **Impact:** HIGH
   - **Dependencies:** Campaign model already exists

4. **Create Business/Store CRUD** endpoints
   - **Effort:** Low
   - **Impact:** MEDIUM
   - **Dependencies:** Business model exists

5. **Migrate Performer AI** if B uses it heavily
   - **Effort:** Medium
   - **Impact:** HIGH (if used)
   - **Dependencies:** None

#### Frontend (Dashboard B)

6. **Create/Verify Landing Page**
   - **Effort:** Medium
   - **Impact:** HIGH
   - **Dependencies:** None

7. **Create Pricing Page** (if A has it)
   - **Effort:** Medium
   - **Impact:** HIGH
   - **Dependencies:** Billing backend (if pricing is dynamic)

8. **Create User Profile/Settings Page**
   - **Effort:** Low
   - **Impact:** HIGH
   - **Dependencies:** Backend profile update endpoint

9. **Create Global App Shell** (public + authenticated layouts)
   - **Effort:** Medium
   - **Impact:** HIGH
   - **Dependencies:** None

10. **Create Unified API Client**
    - **Effort:** Low
    - **Impact:** HIGH
    - **Dependencies:** None

#### Technical

11. **Verify Auth Flow** matches A's behavior
    - **Effort:** Low
    - **Impact:** HIGH
    - **Dependencies:** None

12. **Migrate C-Net Registry** if needed
    - **Effort:** Medium
    - **Impact:** MEDIUM
    - **Dependencies:** None

---

### 5.2 Nice-to-Have but Not Required for First Merged Version

#### Backend

1. **Migrate Rewards System** (`/api/rewards`)
   - **Effort:** Medium
   - **Impact:** LOW
   - **Note:** May not be critical for MVP

2. **Migrate Agent Orchestration** (`/api/agents`)
   - **Effort:** High
   - **Impact:** MEDIUM
   - **Note:** Can consolidate with existing orchestration

3. **Migrate Share/Export** (`/api/share`)
   - **Effort:** Low
   - **Impact:** LOW
   - **Note:** Nice feature but not critical

4. **Migrate Public Feeds** (`/api/feeds`)
   - **Effort:** Medium
   - **Impact:** LOW
   - **Note:** Only if public-facing features needed

5. **Migrate CAI Credits** (`/api/cai`)
   - **Effort:** Medium
   - **Impact:** MEDIUM
   - **Note:** May integrate into billing system later

6. **Create Scheduling System**
   - **Effort:** High
   - **Impact:** MEDIUM
   - **Note:** Can add in Phase 2

7. **Create Billing/Subscription System**
   - **Effort:** Very High
   - **Impact:** HIGH (but not required for MVP)
   - **Note:** Major feature, can be Phase 2

#### Frontend

8. **Create Journey UI Pages**
   - **Effort:** Medium
   - **Impact:** MEDIUM
   - **Note:** Backend ready, just needs UI

9. **Create Assistant Chatbot Widget**
   - **Effort:** Medium
   - **Impact:** MEDIUM
   - **Note:** Backend ready, nice UX addition

10. **Create About/Features Pages**
    - **Effort:** Low
    - **Impact:** LOW
    - **Note:** Marketing pages, not critical for functionality

11. **Create Documentation Pages**
    - **Effort:** High
    - **Impact:** MEDIUM
    - **Note:** Can link to external docs initially

12. **Create Blog/Resources**
    - **Effort:** Medium
    - **Impact:** LOW
    - **Note:** Marketing feature, not critical

---

## 6. Implementation Roadmap

### Phase 1: Core Backend Migration (Week 1-2)

1. ✅ Migrate Campaigns CRUD from B's server to C
2. ✅ Migrate Analytics/Insights from B's server to C
3. ✅ Create Business/Store CRUD endpoints
4. ✅ Migrate C-Net Registry endpoints
5. ✅ Migrate Performer AI (if used)

### Phase 2: Essential Frontend Pages (Week 2-3)

1. ✅ Create/verify Landing Page
2. ✅ Create Pricing Page (if needed)
3. ✅ Create Global App Shell
4. ✅ Create User Profile/Settings page
5. ✅ Create Unified API Client

### Phase 3: Integration & Polish (Week 3-4)

1. ✅ Verify Auth flow matches A
2. ✅ Test SSE integration
3. ✅ Verify static asset serving
4. ✅ Handle route migration/redirects
5. ✅ End-to-end testing

### Phase 4: Nice-to-Haves (Ongoing)

1. ⏳ Journey UI pages
2. ⏳ Assistant Chatbot widget
3. ⏳ Additional marketing pages
4. ⏳ Scheduling system
5. ⏳ Billing system (if needed)

---

## 7. Critical Dependencies

### Must Audit First

1. **Audit cardbey-web-latest (A)** to identify:
   - All public pages and routes
   - Auth flow and session handling
   - Which features are actually used
   - Billing/subscription implementation (if any)

2. **Audit Marketing Dashboard (B)** to identify:
   - Which of B's server routes are actively used
   - Which UI pages already exist
   - What can be removed vs. migrated

### Blocking Issues

- **Cannot proceed with full migration** until A and B are audited
- **Unknown:** Whether A has billing (affects pricing page priority)
- **Unknown:** Whether B uses Performer AI (affects migration priority)

---

## 8. Summary

**Total Features in Matrix:** 50+  
**Fully Implemented in B+C:** ~30  
**Partially Implemented:** ~10  
**Missing:** ~10  

**Critical Gaps:**
1. Campaigns CRUD (backend migration needed)
2. Analytics/Insights (backend migration needed)
3. Public pages (landing, pricing) - frontend needed
4. User profile management (backend + frontend)
5. Global app shell (frontend architecture)

**Estimated Effort:**
- **Must-Have Items:** 2-3 weeks
- **Nice-to-Have Items:** 1-2 months
- **Total Migration:** 1-2 months (phased)

**Next Steps:**
1. Audit cardbey-web-latest (A) to verify assumptions
2. Audit Marketing Dashboard (B) to confirm what's used
3. Start with Phase 1 backend migrations
4. Parallel frontend work on essential pages


# Top-Priority Implementation Plan: A → B+C

**Date:** 2025-01-25  
**Goal:** Extract critical features from cardbey-web-latest (A) and create a focused implementation plan for Marketing Dashboard + Core (B+C)

---

## 🎯 Executive Summary

Based on the gap analysis, these are the **must-have features** that B+C needs to fully replace A:

1. **Backend Consolidation** - Migrate all routes from B's server to C
2. **Public Website Pages** - Landing, Pricing, Features
3. **Unified Architecture** - Global app shell, unified API client
4. **Core Features** - Campaigns, Analytics, User Management

**Estimated Timeline:** 3-4 weeks for must-haves

---

## 🔥 Priority 1: Critical Backend Migrations (Week 1)

These features exist in B's server but must be in C for consolidation:

### 1.1 Campaigns CRUD Migration ⚠️ HIGH PRIORITY

**Current State:**
- ❌ Only `GET /api/campaigns/:id` exists in C
- ✅ Full CRUD exists in B's server (`/api/campaigns`)
- ✅ Campaign model exists in Prisma schema

**Actions:**
1. **Migrate from B's server:**
   - Copy `cardbey-marketing-dashboard/server/routes/campaigns.js`
   - Adapt to C's structure: `src/routes/campaigns.js`
   - Mount in `src/server.js`: `app.use('/api/campaigns', campaignsRouter)`

2. **Expected Endpoints:**
   - `GET /api/campaigns` - List campaigns
   - `POST /api/campaigns` - Create campaign
   - `GET /api/campaigns/:id` - Get campaign (already exists)
   - `PUT /api/campaigns/:id` - Update campaign
   - `DELETE /api/campaigns/:id` - Delete campaign
   - `PATCH /api/campaigns/:id/status` - Update status (DRAFT/SCHEDULED/RUNNING/DONE)

3. **Prisma Integration:**
   - Use existing `Campaign` model
   - Link to `Workflow` model if needed
   - Add tenant/user filtering

**Estimated Effort:** 4-6 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/routes/campaigns.js` (new)
- `src/server.js` (mount route)

---

### 1.2 Analytics & Insights Migration ⚠️ HIGH PRIORITY

**Current State:**
- ⚠️ Basic screen stats in C (`/api/screens?stats=1`)
- ✅ Enhanced analytics in B's server (`/api/metrics`, `/api/insights`, `/api/dashboard/insights`)

**Actions:**
1. **Migrate Analytics Routes:**
   - `GET /api/metrics` - General metrics
   - `GET /api/insights` - Insights dashboard
   - `GET /api/dashboard/insights` - AI-powered insights
   - `GET /api/dashboard` - Dashboard overview

2. **Consolidate with Existing:**
   - Merge with C's existing screen stats
   - Use journey analytics (`/api/journeys/analytics/*`) as base
   - Enhance with B's analytics logic

3. **Data Sources:**
   - Screen status and statistics
   - Playlist performance
   - Campaign metrics (once campaigns are migrated)
   - User activity tracking

**Estimated Effort:** 8-12 hours  
**Dependencies:** Campaigns migration (for campaign analytics)  
**Files to Create/Modify:**
- `src/routes/metrics.js` (new)
- `src/routes/insights.js` (new)
- `src/routes/dashboard.js` (new)
- `src/server.js` (mount routes)

---

### 1.3 C-Net Registry Migration ⚠️ MEDIUM PRIORITY

**Current State:**
- ✅ Screen pairing exists in C (`/api/screens/pair/*`)
- ✅ Device management exists (`/api/screens`)
- ❌ Player registry missing (exists in B's `/api/cnet`)

**Actions:**
1. **Migrate C-Net Routes:**
   - `POST /api/cnet/register` - Register player
   - `GET /api/cnet/players` - List players
   - `POST /api/cnet/heartbeat` - Player heartbeat
   - `GET /api/cnet/config` - Player configuration

2. **Integrate with Existing:**
   - Link to existing Screen model
   - Use existing pairing flow
   - Enhance device heartbeat

**Estimated Effort:** 4-6 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/routes/cnet.js` (new)
- `src/server.js` (mount route)

---

### 1.4 User Profile Management ⚠️ HIGH PRIORITY

**Current State:**
- ✅ `GET /api/auth/me` exists (read-only)
- ❌ No update/profile endpoints

**Actions:**
1. **Create Profile Endpoints:**
   - `GET /api/auth/profile` - Get full profile (with business)
   - `PUT /api/auth/profile` - Update profile
   - `PATCH /api/auth/profile` - Partial update
   - `PUT /api/auth/password` - Change password

2. **Business Profile (if exists):**
   - `GET /api/business` - Get user's business
   - `POST /api/business` - Create business
   - `PUT /api/business` - Update business

**Estimated Effort:** 3-4 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/routes/auth.js` (extend existing)
- Or create `src/routes/profile.js` (new)

---

## 🌐 Priority 2: Public Website Pages (Week 1-2)

These are the public-facing pages that A likely has:

### 2.1 Landing/Hero Page ⚠️ CRITICAL

**Route:** `/`

**Requirements:**
- Hero section with value proposition
- Key features overview
- Call-to-action (Sign Up / Get Started)
- Social proof/testimonials (if available)
- Footer with links

**Current State:**
- ❓ Unknown if B has landing page
- ✅ Backend has `/api/v2/home/sections` for homepage content

**Actions:**
1. **Check B's Routes:**
   - Verify if landing page exists in B
   - Check route structure

2. **Create/Update Landing Page:**
   - Create `src/pages/Landing.tsx` or `src/pages/Home.tsx`
   - Use `/api/v2/home/sections` for dynamic content
   - Add responsive design
   - Add smooth scroll to features

**Estimated Effort:** 6-8 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/pages/Landing.tsx` (new or update)
- `src/routes.tsx` or router config (add route)

---

### 2.2 Pricing Page ⚠️ HIGH PRIORITY (if A has it)

**Route:** `/pricing`

**Requirements:**
- Pricing tiers/plans
- Feature comparison
- "Get Started" buttons
- FAQ section
- Link to billing/subscription (if exists)

**Current State:**
- ❌ No billing system exists
- ❓ Unknown if A has pricing page

**Actions:**
1. **Verify if A has Pricing:**
   - Audit A's routes to check for `/pricing`
   - If exists, extract pricing structure

2. **Create Pricing Page:**
   - Static pricing tiers (can be hardcoded initially)
   - Responsive pricing cards
   - Feature comparison table

**Estimated Effort:** 4-6 hours  
**Dependencies:** None (unless dynamic pricing from backend)  
**Files to Create/Modify:**
- `src/pages/Pricing.tsx` (new)

---

### 2.3 Features Page ⚠️ MEDIUM PRIORITY

**Route:** `/features`

**Requirements:**
- Product features showcase
- Use cases
- Screenshots/demos
- "Try it free" CTA

**Estimated Effort:** 4-6 hours  
**Files to Create/Modify:**
- `src/pages/Features.tsx` (new)

---

### 2.4 Public Frontscreen Page ⚠️ MEDIUM PRIORITY

**Route:** `/frontscreen`

**Current State:**
- ✅ A serves `/frontscreen` as static HTML
- ❌ Not documented in B

**Actions:**
1. **Migrate Frontscreen Page:**
   - Copy from A's `public/frontscreen/index.html`
   - Adapt to B's structure
   - Or serve from C as static file

**Estimated Effort:** 2-3 hours  
**Files to Create/Modify:**
- `public/frontscreen/index.html` (copy from A)
- Or add route in C to serve static file

---

## 🏗️ Priority 3: Architecture & Infrastructure (Week 2)

### 3.1 Global App Shell ⚠️ CRITICAL

**Purpose:** Unified layout for public + authenticated pages

**Requirements:**
1. **Public Layout:**
   - Header with logo, nav (Features, Pricing, About)
   - Footer with links
   - No sidebar

2. **Authenticated Layout:**
   - Sidebar navigation
   - Header with user menu
   - Breadcrumbs
   - Notifications

3. **Shared Components:**
   - Header component
   - Footer component
   - Navigation component
   - User menu dropdown

**Current State:**
- ❓ Unknown if B has unified app shell
- ⚠️ Likely fragmented across pages

**Actions:**
1. **Create Layout Components:**
   ```typescript
   src/layouts/
   ├── PublicLayout.tsx      // For landing, pricing, features
   ├── AuthenticatedLayout.tsx // For dashboard, screens, etc.
   └── components/
       ├── Header.tsx
       ├── Footer.tsx
       └── Sidebar.tsx
   ```

2. **Route-Based Layout Selection:**
   ```typescript
   // In router config
   const publicRoutes = ['/', '/pricing', '/features', '/about'];
   const usePublicLayout = publicRoutes.includes(pathname);
   ```

3. **Auth State Management:**
   - Detect if user is authenticated
   - Redirect to dashboard if logged in and on public page
   - Redirect to login if not authenticated and on protected page

**Estimated Effort:** 8-12 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/layouts/PublicLayout.tsx` (new)
- `src/layouts/AuthenticatedLayout.tsx` (new)
- `src/components/layout/Header.tsx` (new)
- `src/components/layout/Footer.tsx` (new)
- `src/components/layout/Sidebar.tsx` (new)
- Router config (modify)

---

### 3.2 Unified API Client ⚠️ HIGH PRIORITY

**Purpose:** Centralized API communication with consistent error handling

**Requirements:**
1. **Base Configuration:**
   - Base URL configuration
   - Auth token injection
   - Request/response interceptors

2. **Error Handling:**
   - Centralized error handling
   - 401 → redirect to login
   - 403 → show permission error
   - 500 → show generic error

3. **Type Safety:**
   - TypeScript interfaces for all API responses
   - Type-safe request/response

**Current State:**
- ⚠️ Likely fragmented API calls across components
- ❓ May use different patterns

**Actions:**
1. **Create API Client:**
   ```typescript
   src/api/
   ├── client.ts           // Base client with interceptors
   ├── auth.ts             // Auth-related API calls
   ├── campaigns.ts        // Campaign API calls
   ├── screens.ts          // Screen API calls
   └── types.ts            // Shared TypeScript types
   ```

2. **Example Structure:**
   ```typescript
   // src/api/client.ts
   const apiClient = {
     get: (url, options) => fetch(url, { ...options, method: 'GET' }),
     post: (url, data, options) => fetch(url, { ...options, method: 'POST', body: JSON.stringify(data) }),
     // ... put, patch, delete
   };
   ```

3. **Auth Token Management:**
   - Read from localStorage/sessionStorage
   - Inject into Authorization header
   - Handle token refresh if needed

**Estimated Effort:** 4-6 hours  
**Dependencies:** None  
**Files to Create/Modify:**
- `src/api/client.ts` (new)
- `src/api/auth.ts` (new or update)
- Update existing API calls to use new client

---

### 3.3 Auth Flow Verification ⚠️ CRITICAL

**Purpose:** Ensure B's auth flow matches A's behavior

**Current State:**
- ✅ C has `/api/auth/login`, `/api/auth/register`, `/api/auth/me`
- ❓ Unknown if B's auth flow matches A's

**Actions:**
1. **Verify Auth Flow:**
   - Login → redirect to dashboard
   - Register → auto-login → redirect to onboarding/dashboard
   - Logout → clear token → redirect to landing
   - Protected routes → check auth → redirect if not logged in

2. **Session Management:**
   - Token storage (localStorage vs sessionStorage)
   - Token expiration handling
   - Auto-refresh if supported

3. **OAuth Integration:**
   - Facebook/TikTok OAuth flow
   - OAuth callback handling
   - Post-OAuth redirect

**Estimated Effort:** 4-6 hours  
**Dependencies:** Unified API Client  
**Files to Verify/Modify:**
- Auth components (Login, Register)
- Protected route wrapper
- OAuth callback handlers

---

## 📊 Priority 4: Core Feature Completion (Week 2-3)

### 4.1 Campaigns UI ⚠️ HIGH PRIORITY

**Purpose:** Complete campaigns feature with full UI

**Current State:**
- ⚠️ Backend migration needed (Priority 1.1)
- ❓ Unknown if B has campaigns UI

**Actions:**
1. **Create Campaigns Pages:**
   - `GET /campaigns` - List campaigns
   - `GET /campaigns/new` - Create campaign
   - `GET /campaigns/:id` - View/edit campaign
   - `GET /campaigns/:id/analytics` - Campaign analytics

2. **Campaign Components:**
   - CampaignCard
   - CampaignForm
   - CampaignStatusBadge
   - CampaignAnalytics

**Estimated Effort:** 8-12 hours  
**Dependencies:** Campaigns backend migration (Priority 1.1)  
**Files to Create:**
- `src/pages/Campaigns.tsx`
- `src/pages/CampaignNew.tsx`
- `src/pages/CampaignDetail.tsx`
- `src/components/campaigns/CampaignCard.tsx`
- `src/components/campaigns/CampaignForm.tsx`

---

### 4.2 Analytics Dashboard ⚠️ HIGH PRIORITY

**Purpose:** Visualize analytics and insights

**Current State:**
- ⚠️ Backend migration needed (Priority 1.2)
- ❓ Unknown if B has analytics UI

**Actions:**
1. **Create Analytics Pages:**
   - `GET /analytics` - Main analytics dashboard
   - `GET /analytics/screens` - Screen analytics
   - `GET /analytics/campaigns` - Campaign analytics
   - `GET /insights` - AI insights

2. **Analytics Components:**
   - MetricCard
   - Chart components (line, bar, pie)
   - DateRangePicker
   - FilterBar

**Estimated Effort:** 12-16 hours  
**Dependencies:** Analytics backend migration (Priority 1.2)  
**Files to Create:**
- `src/pages/Analytics.tsx`
- `src/pages/Insights.tsx`
- `src/components/analytics/MetricCard.tsx`
- `src/components/analytics/Chart.tsx`

---

### 4.3 User Profile/Settings UI ⚠️ HIGH PRIORITY

**Purpose:** User account management

**Current State:**
- ⚠️ Backend endpoints needed (Priority 1.4)
- ❓ Unknown if B has profile page

**Actions:**
1. **Create Settings Pages:**
   - `GET /settings` - Settings overview
   - `GET /settings/profile` - Profile settings
   - `GET /settings/account` - Account settings
   - `GET /settings/business` - Business settings (if applicable)

2. **Settings Components:**
   - ProfileForm
   - PasswordChangeForm
   - BusinessForm
   - SettingsNav

**Estimated Effort:** 6-8 hours  
**Dependencies:** Profile backend endpoints (Priority 1.4)  
**Files to Create:**
- `src/pages/Settings.tsx`
- `src/pages/SettingsProfile.tsx`
- `src/components/settings/ProfileForm.tsx`
- `src/components/settings/PasswordForm.tsx`

---

## ✅ Implementation Checklist

### Week 1: Backend Foundation

- [ ] **Day 1-2: Campaigns Migration**
  - [ ] Copy campaigns routes from B's server
  - [ ] Adapt to C's structure
  - [ ] Test all endpoints
  - [ ] Mount in server.js

- [ ] **Day 2-3: Analytics Migration**
  - [ ] Copy analytics routes from B's server
  - [ ] Consolidate with existing endpoints
  - [ ] Test analytics endpoints
  - [ ] Mount in server.js

- [ ] **Day 3: C-Net Registry Migration**
  - [ ] Copy C-Net routes
  - [ ] Integrate with existing screen management
  - [ ] Test player registration

- [ ] **Day 4: User Profile Backend**
  - [ ] Create profile endpoints
  - [ ] Create business endpoints (if needed)
  - [ ] Test profile updates

### Week 1-2: Public Pages

- [ ] **Day 5-6: Landing Page**
  - [ ] Check if B has landing page
  - [ ] Create/update landing page
  - [ ] Connect to `/api/v2/home/sections`
  - [ ] Add responsive design

- [ ] **Day 6: Pricing Page** (if A has it)
  - [ ] Verify A has pricing page
  - [ ] Create pricing page
  - [ ] Add pricing tiers

- [ ] **Day 7: Features Page**
  - [ ] Create features page
  - [ ] Add feature showcase

### Week 2: Architecture

- [ ] **Day 8-9: Global App Shell**
  - [ ] Create PublicLayout
  - [ ] Create AuthenticatedLayout
  - [ ] Create shared Header/Footer/Sidebar
  - [ ] Integrate with router

- [ ] **Day 9: Unified API Client**
  - [ ] Create base API client
  - [ ] Add error handling
  - [ ] Add auth token injection
  - [ ] Update existing API calls

- [ ] **Day 10: Auth Flow Verification**
  - [ ] Test login/logout flow
  - [ ] Test protected routes
  - [ ] Test OAuth flow (if applicable)

### Week 2-3: Core Features

- [ ] **Day 11-12: Campaigns UI**
  - [ ] Create campaigns list page
  - [ ] Create campaign create/edit page
  - [ ] Create campaign detail page
  - [ ] Test full campaigns flow

- [ ] **Day 13-14: Analytics Dashboard**
  - [ ] Create analytics dashboard
  - [ ] Add charts and metrics
  - [ ] Create insights page

- [ ] **Day 15: Profile/Settings UI**
  - [ ] Create settings pages
  - [ ] Create profile form
  - [ ] Test profile updates

### Week 3-4: Polish & Testing

- [ ] **Day 16-17: Integration Testing**
  - [ ] End-to-end testing
  - [ ] Test all migrated routes
  - [ ] Test public pages
  - [ ] Test authenticated pages

- [ ] **Day 18: Route Migration**
  - [ ] Handle route redirects from A
  - [ ] Test 404 fallback
  - [ ] Verify static asset serving

- [ ] **Day 19-20: Bug Fixes & Polish**
  - [ ] Fix any integration issues
  - [ ] Polish UI/UX
  - [ ] Performance optimization

---

## 🚨 Critical Blockers

These must be resolved before proceeding:

1. **Audit A (cardbey-web-latest)** to verify:
   - [ ] Does A have pricing page?
   - [ ] Does A have billing/subscription?
   - [ ] What are A's actual routes?
   - [ ] What features does A actually use?

2. **Audit B (Marketing Dashboard)** to verify:
   - [ ] Which routes in B's server are actively used?
   - [ ] Does B already have landing/pricing pages?
   - [ ] What UI components already exist?

3. **Route Conflicts:**
   - [ ] Verify no route conflicts between A and B
   - [ ] Plan route migration strategy

---

## 📝 Next Steps

1. **Immediate (Day 1):**
   - Audit A to verify assumptions about public pages
   - Audit B to verify what already exists
   - Start with Campaigns backend migration

2. **Week 1:**
   - Complete all backend migrations (Priorities 1.1-1.4)
   - Create public pages (Priorities 2.1-2.2)

3. **Week 2:**
   - Complete architecture setup (Priority 3)
   - Start core feature UIs (Priority 4)

4. **Week 3-4:**
   - Complete remaining features
   - Integration testing
   - Bug fixes and polish

---

## 📊 Success Metrics

**Week 1 Goals:**
- ✅ All critical backend routes migrated to C
- ✅ Landing page accessible
- ✅ No duplicate servers running

**Week 2 Goals:**
- ✅ Global app shell working
- ✅ Unified API client in use
- ✅ Public pages complete

**Week 3-4 Goals:**
- ✅ All core features accessible in B
- ✅ Full end-to-end testing passed
- ✅ Ready for A → B migration

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-25  
**Status:** Ready for Implementation


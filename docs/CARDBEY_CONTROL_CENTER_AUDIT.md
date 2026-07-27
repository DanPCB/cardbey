# Cardbey Control Center — Audit & Restructure

**Date:** 2026-06-16  
**Canonical page:** `DashboardEnhanced` → `LivePerformanceCenter` (business) / `CardbeyControlCenter` (platform admin)  
**Routes:** `/marketing`, `/marketing/dashboard`, `/dashboard/legacy`, `/app/back/dashboard`  
**Prior audits:** `LIVE_PERFORMANCE_V2_AUDIT.md`, `LIVE_PERFORMANCE_V2_ARCHITECTURE.md`

---

## Executive summary

The Live Performance page evolved into a **Business Intelligence + Performer Execution Center** that mixes store KPIs, campaign charts, discovery session metrics, PIL opportunities, and platform admin diagnostics on one scroll. For **platform operators** this creates cognitive overload and hides ecosystem-level signals behind store-level noise.

**Decision:** Platform admins (`platform_admin`, `super_admin`, legacy `admin`) see **Cardbey Control Center** — a 4-zone executive dashboard. Store owners and business managers keep **Live Performance** (business-scoped BI) without platform widgets.

---

## 1. Widget inventory (current)

### 1.1 LivePerformanceCenter sections (render order)

| # | Section | Component | KPIs / widgets |
|---|---------|-----------|----------------|
| 1 | Business Snapshot | `BusinessSnapshotSection` | Reach (Views, Reach, Visitors), Engagement (Loves, Likes, Shares, Comments), Conversion (Leads, Bookings, Orders, Conv. Rate), Revenue (Revenue, Offer Claims, Campaign ROI) |
| 2 | Discovery Intelligence | `DiscoveryIntelligenceSection` | 4 rail cards: Featured Now, Nearby, Active Offers, New This Week — each: Impressions, Store Opens, rail-specific (Claims, Redemptions, Location Clicks, Conversions), Revenue Influenced |
| 3 | Business Objectives | `BusinessObjectivesSection` | Inferred objectives per store with confidence + Ask Performer |
| 4 | Supplier Intelligence | `SupplierIntelligenceSection` | Visitor insight cards (questions, comparisons, conversion gaps) |
| 5 | Charts row | `EngagementChart` + `CAISummary` (slots) | Campaign engagement line chart (impressions/clicks/shares); CAI pie (Earned/Spent/Pending) |
| 6 | Content Intelligence | `ContentIntelligenceSection` | Top Show content: views, watch time, loves, claps, shares |
| 7 | Business Opportunities | `BusinessOpportunitiesSection` | Problem/impact/confidence cards → Performer handoff |
| 8 | Performer Actions | `PerformerActionsSection` | Recommended action cards → Performer |
| 9 | Opportunity Center | `OpportunityCenterSection` | PIL intent-aware suggestions |
| 10 | Supplier Insight Feed | `SupplierInsightFeed` | Expandable visitor insight feed |
| 11 | Loyalty + sidebar | `LoyaltyDashboardTile` + admin/business panel | Loyalty programs; admin: PIL diagnostics, ingestion, runtime obs, health |
| 12 | Recent Activity | `CollapsibleRecentActivity` → `ActivityFeed` | Mock marketing activity list |

### 1.2 DashboardEnhanced slots (parent page)

| Widget | Location | Notes |
|--------|----------|-------|
| `TopBar` | Page header | Search → `/dashboard/insights` |
| Email verification banner | Conditional | Auth gate |
| `EngagementChart` | chartsRow slot | Campaign line chart |
| `CAISummary` | chartsRow slot | Mock CAI pie |
| `LoyaltyDashboardTile` | loyaltySection slot | Store loyalty programs |
| `ActivityFeed` | activitySection slot | **Mock** static `activity` array |
| `HealthPanel` | adminDiagnostics slot | API, DB, Scheduler, SSE, OAuth, MI Routes |
| `IntegrationsPanel` | adminDiagnostics slot | OAuth provider config |
| `InsightsCard` | adminDiagnostics slot | Tenant AI insights |
| `WatcherChatButton` | adminDiagnostics slot | System guardian modal |

### 1.3 Admin-only panels (gated by `usePlatformAdmin`)

| Panel | Component | Shown when |
|-------|-----------|------------|
| Intelligence Diagnostics | `IntelligenceDiagnosticsPanel` | Platform admin |
| Business Ingestion | `BusinessIngestionDashboard` | Platform admin |
| Runtime Observations | `RuntimeObservationsPanel` | Platform admin |
| Business Status | `BusinessStatusPanel` | **Non-admin** only |

### 1.4 Legacy / unmounted (same codebase)

| Widget | Path | Mounted? |
|--------|------|----------|
| `StatsRow` | `DashboardEnhanced.jsx` | **No** (V2 removed) |
| `AIInsightsPanel` | `DashboardEnhanced.jsx` | **No** |
| `QuickActions` | `DashboardEnhanced.jsx` | **No** |
| `PipelineObservability` | `components/dashboard/` | **No** (admin API exists) |
| Control Tower UI | `/app/console/control-tower` | Separate route |

---

## 2. Data sources per widget

| Widget | Hook / source | Endpoint / storage | Live vs mock |
|--------|---------------|-------------------|--------------|
| Business Snapshot — store signals | `useLivePerformanceMetrics` → `getStoreSignalSummaryFromApi` | `GET /api/stores/:id/signals` | Live (when storeId) |
| Business Snapshot — trend | `useDashboardTrend` | `GET /api/dashboard/trend` | Live + mock fallback |
| Business Snapshot — overview | `useLivePerformanceMetrics` | `GET /api/dashboard/overview` | Live |
| Business Snapshot — social | `readSocialEngagementTotals()` | `localStorage` `cardbey.socialInteractions.v1` | Client-local |
| Discovery Intelligence | `aggregateDiscoveryIntelligence()` | `sessionStorage` discover events | Session-scoped |
| Content Intelligence | `buildContentIntelligenceMetrics()` | Show event tracker (session) | Session-scoped |
| Business Opportunities | `generateBusinessOpportunities` + store API | `GET /api/stores/:id/opportunities` | Mixed |
| Performer Actions | `generatePerformerActionCards` | Derived client-side | Derived |
| Business Objectives | `getStoreBusinessObjectives` | PIL local store | Client-local |
| Supplier Intelligence | `buildSupplierIntelligenceState` | PIL supplier store | Client-local |
| Opportunity Center | `buildOpportunityCenterState` | PIL attention graph | Client-local |
| Engagement Chart | `useDashboardTrend` | `GET /api/dashboard/trend` | Live + mock |
| CAI Summary | Static `cai` array | **Mock** | Mock |
| Activity Feed | Static `activity` array | **Mock** | Mock |
| Loyalty Tile | `LoyaltyDashboardTile` | `GET /api/loyalty/programs/:storeId` | Live |
| Health Panel | `useHealth` | `GET /api/health?full=true` | Live |
| MI Routes | `fetch` in HealthPanel | `GET /api/mi/health` | Live |
| Integrations | `useOAuthProviders` | `GET /api/oauth/providers` | Live |
| Insights Card | `useDashboardInsights` | `GET /api/dashboard/insights` | Live |
| PIL Diagnostics | `buildPilDiagnostics()` | PIL session/local | Client-local |
| Business Ingestion | `BusinessIngestionDashboard` | `GET /api/business-ingestion/*` | Live (super admin) |
| Runtime Observations | `RuntimeObservationsPanel` | `GET /api/runtime/diagnostics/recent` | Live (admin) |
| **Unused admin APIs** | `useLiveMetrics` | `GET /api/admin/metrics/live` | Live, not mounted |
| | `useCAISummary` | `GET /api/admin/cai/summary` | Not mounted |
| | `useActivityFeed` | `GET /api/admin/activity` | Not mounted |
| | `usePipelineLive/Stats` | `GET /api/admin/pipeline/*` | Not mounted |
| | Control Tower | `GET /api/control-tower/overview` | Separate page only |
| | Discovery stats | `GET /api/discovery/stats` | Discovery admin only |
| | System metrics | `GET /api/system/metrics` | Watcher only |

---

## 3. Audience classification

| Widget / metric family | Store owner | Business manager | Platform admin | Correct home |
|------------------------|:-----------:|:----------------:|:--------------:|--------------|
| Business Snapshot (reach, engagement, conversion, revenue) | ✓ | ✓ | ✗ | **Business Space / Store Insights** |
| Loves, Likes, Shares, Comments | ✓ | ✓ | ✗ | **Store Insights** |
| Campaign Engagement chart | ✓ | ✓ | ✗ | **Campaign Insights** |
| CAI Summary (tenant rewards) | ✓ | ✓ | ✗ | **Business Space** |
| Discovery Intelligence (session rails) | ✓ | ✓ | partial | **Discovery Dashboard** (platform aggregate) |
| Content Intelligence | ✓ | ✓ | ✗ | **Store Insights / Show** |
| Business Opportunities | ✓ | ✓ | ✗ | **Business Space** |
| Performer Actions | ✓ | ✓ | ✗ | **Business Space** |
| Opportunity Center / PIL suggestions | ✓ | ✓ | ✗ | **Business Space** |
| Supplier Intelligence | ✓ | ✓ | ✗ | **Business Space** |
| Loyalty Dashboard | ✓ | ✓ | ✗ | **Business Space** |
| Business Status panel | ✓ | ✓ | ✗ | **Business Space** |
| Mock Activity Feed | ✓ | ✓ | ✗ | **Business Space** (wire real feed) |
| System Health / OAuth / MI | ✗ | ✗ | ✓ | **Control Center — Zone 1** |
| Business Ingestion / QA / Claims | ✗ | ✗ | ✓ | **Control Center — Zone 2 + Discovery** |
| PIL Diagnostics (pipeline volumes) | ✗ | ✗ | ✓ | **Control Center — Zone 4** |
| Runtime Observations | ✗ | ✗ | ✓ | **Control Center — Runtime section** |
| Pipeline Observability | ✗ | ✗ | ✓ | **Control Center — Runtime section** |
| Watcher / Integrations ops | ✗ | ✗ | ✓ | **Control Center — Zone 1 (links)** |
| User network growth | ✗ | ✗ | ✓ | **Control Center — Zone 3** |
| Platform activity stream | ✗ | ✗ | ✓ | **Control Center — Zone 4** |

---

## 4. Placement matrix (target dashboards)

| Dashboard | Purpose | Contents |
|-----------|---------|----------|
| **Cardbey Control Center** (Super Admin) | Ecosystem health & growth in 30s | 4 zones + Discovery funnel + Runtime ops |
| **Live Performance** (Business) | Store/business BI + Performer | Snapshot, content, opportunities, loyalty — **no platform widgets** |
| **Discovery Dashboard** | Acquisition & activation funnel | Ingestion QA, claim queue, discovery stats, card impressions |
| **Insights Dashboard** | Campaign & content analytics | Engagement charts, CAI, conversion, social signals |
| **Business Space** | Day-to-day business ops | Objectives, supplier intel, opportunity center, status |

---

## 5. Cognitive load drivers (why restructure)

1. **16+ sections** on one infinite scroll — no hierarchy for operators.
2. **Store metrics dominate** even when `usePlatformAdmin()` is true; admin panels are a narrow sidebar after business content.
3. **Empty states everywhere** ("Not tracked yet") — noise for admins who don't own a store narrative.
4. **Mock data** (CAI pie, activity feed) mixed with real health checks — erodes trust.
5. **Session-scoped discovery** metrics presented as business intelligence without platform aggregation.
6. **Admin APIs exist but are unwired** (`/api/admin/metrics/live`, pipeline, activity).
7. **Duplicate control surfaces** — Control Tower console vs Live Performance admin sidebar.

---

## 6. Proposed information architecture

### Cardbey Control Center (platform admin only)

```
Cardbey Control Center
├── ZONE 1 — Platform Health
│   Core API · Dashboard · Runtime · Queue · Device heartbeat
│   Active missions · Error rate · Last deployment
├── ZONE 2 — Business Network
│   Funnel: Discovered → Claimable → Verified → Active
│   Pending QA · New this week · Conversion rates
├── ZONE 3 — User Network
│   Total users · Active · New registrations · Owners vs consumers
│   Returning · Verification rate
├── ZONE 4 — Platform Activity
│   Real-time stream (admin activity API)
├── Business Discovery (dedicated section)
│   Funnel: Discovered → Viewed → Claim Started → Verified → Active
├── Runtime Operations (dedicated section)
│   Active/queued/failed missions · Avg duration · Success rate
└── Quick links → Control Tower · Discovery Agent · Watcher
```

### Live Performance (business users — unchanged scope, cleaner)

Retain `LivePerformanceCenter` without admin sidebar clutter. Store analytics stay here until Business Space dashboard absorbs them (Phase B).

---

## 7. Wireframe

### Desktop (2-column)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Cardbey Control Center                                    [Search] [User] │
├──────────────────────────────────────────────────────────────────────────┤
│ ZONE 1 — PLATFORM HEALTH                                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│ │Core API│ │Dashboard│ │Runtime │ │ Queue  │ │Devices │ │Deploy  │       │
│ │  ● OK  │ │  ● OK  │ │ ● WARN │ │  ● OK  │ │ 12/48  │ │ 2h ago │       │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
│ Missions today: 14 · Failed: 1 · Error rate: 7%                           │
├───────────────────────────────┬──────────────────────────────────────────┤
│ ZONE 2 — BUSINESS NETWORK     │ ZONE 3 — USER NETWORK                     │
│                               │                                           │
│   Discovered        12,400    │  Total users      8,240                    │
│        ↓                      │  Active (7d)      1,120                    │
│   Claimable          3,200    │  New (7d)           186                    │
│        ↓                      │  Business owners    412                    │
│   Verified           1,050    │  Consumers        7,828                    │
│        ↓                      │  Verification     68%                      │
│   Active               890    │                                           │
│                               │                                           │
│ Pending QA: 42 · New/wk: 318  │                                           │
├───────────────────────────────┴──────────────────────────────────────────┤
│ ZONE 4 — PLATFORM ACTIVITY                                                │
│ ● 2m ago  Store published — acme-cafe                                       │
│ ● 5m ago  Claim request started — seed_8842                               │
│ ● 8m ago  Mission completed — menu_import                                 │
│ ● 12m ago Discovery card viewed × 340 (aggregate)                         │
├──────────────────────────────────────────────────────────────────────────┤
│ BUSINESS DISCOVERY                    │ RUNTIME OPERATIONS                  │
│ Discovered → Viewed → Claim → Verified│ Active: 2 · Queued: 5 · Failed: 1 │
│ → Active                              │ Success: 94% · Avg: 12.4s           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mobile (stacked)

1. Platform Health  
2. Business Network  
3. User Network  
4. Platform Activity  
5. Discovery funnel  
6. Runtime ops  

---

## 8. Component mapping

| New zone / section | Reuse | New build | Primary API |
|--------------------|-------|-----------|-------------|
| Platform Health status cards | `BusinessStatusPanel` pattern, `StatusPill` from DashboardEnhanced | `PlatformHealthZone` | `useHealth`, `GET /api/system/metrics`, `useLiveMetrics` |
| Business Network funnel | `BusinessIngestionDashboard` metrics slice | `BusinessNetworkZone` | `GET /api/business-ingestion/metrics` |
| User Network cards | `KpiValue` / `LpPrimitives` | `UserNetworkZone` | `GET /api/control-tower/overview` (gtm funnel, signups) — partial |
| Platform Activity stream | `useActivityFeed` | `PlatformActivityZone` | `GET /api/admin/activity` |
| Discovery funnel | Discovery stats + ingestion | `DiscoveryFunnelSection` | `GET /api/discovery/stats`, ingestion metrics |
| Runtime Operations | `PipelineObservability` logic | `RuntimeOperationsSection` | `GET /api/admin/pipeline/live`, `/stats` |
| Shell / layout | `LpCard`, `LpSectionHeader` | `CardbeyControlCenter` | — |
| Data hook | — | `useControlCenterMetrics` | Aggregates above |
| Role gate | `usePlatformAdmin` | Branch in `DashboardEnhanced` | — |

### Removed from platform admin view (not deleted — relocated)

| Component | Relocate to |
|-----------|-------------|
| `BusinessSnapshotSection` | Live Performance (business only) |
| `EngagementChart`, `CAISummary` | Campaign Insights |
| `ContentIntelligenceSection` | Store Insights |
| `BusinessOpportunitiesSection`, `PerformerActionsSection` | Business Space |
| `OpportunityCenterSection`, Supplier sections | Business Space |
| `LoyaltyDashboardTile` | Business Space |
| Mock `ActivityFeed` | Business Space (replace with real) |
| Admin sidebar stack on LP | Absorbed into Control Center zones |

---

## 9. Migration plan

### Phase A — Role split (this implementation)

| Step | Action | Risk |
|------|--------|------|
| A1 | Add `CardbeyControlCenter` + `useControlCenterMetrics` | Low — new files |
| A2 | `DashboardEnhanced`: if `usePlatformAdmin()` → Control Center, else `LivePerformanceCenter` | Medium — admin UX changes |
| A3 | i18n: admin title "Cardbey Control Center" | Low |
| A4 | Tests for role branch | Low |

### Phase B — Business dashboard cleanup

| Step | Action |
|------|--------|
| B1 | Move campaign chart + CAI to `/marketing/reports` or store insights |
| B2 | Wire real activity feed for business users |
| B3 | Remove duplicate empty discovery rails when no session data |

### Phase C — API enrichment

| Step | Action |
|------|--------|
| C1 | `GET /api/admin/platform/overview` — unified user + business + activity counts |
| C2 | Platform-wide discovery impression aggregation (not session-only) |
| C3 | Deprecate mock CAI/activity in `DashboardEnhanced` |

### Phase D — Navigation

| Step | Action |
|------|--------|
| D1 | Nav label: "Control Center" for admins, "Live Performance" for business |
| D2 | Link Control Center ↔ `/app/console/control-tower` (deep ops) |

---

## 10. Impact report (development safety)

### What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Admin users lose quick access to store BI on dashboard route | Role branch swaps entire layout | Admins can open a store's Business Space; Live Performance remains for business users |
| Ingestion/discovery API 403 for non-super-admin `admin` role | APIs use `requireSuperAdmin` | Hook catches errors; shows auth message in zone |
| Empty user network metrics | No dedicated user-count API yet | Show partial data from control tower; label unavailable fields |
| Duplicate with Control Tower console | Overlapping mission/deployment data | Control Center = executive 30s view; Control Tower = deep ops |

### Impact scope

- `DashboardEnhanced.jsx` — render branch only  
- New `components/controlCenter/*`, `hooks/useControlCenterMetrics.ts`  
- `LivePerformanceCenter` — **unchanged** for business users  
- No API or route removals  

### Smallest safe patch

Platform-admin role gate at `DashboardEnhanced` render + new isolated Control Center component tree wired to existing admin APIs.

---

## 11. Acceptance criteria

- [ ] Platform operator sees **no** store engagement KPIs (likes, shares, campaign chart, loyalty) on opening dashboard.
- [ ] Four zones visible above the fold on desktop (health + network + activity).
- [ ] Discovery funnel and Runtime sections present below zones.
- [ ] Business users unchanged on `LivePerformanceCenter`.
- [ ] Page understandable in **≤30 seconds** without store-level noise.

---

*Implementation: `src/components/controlCenter/CardbeyControlCenter.tsx`, `src/hooks/useControlCenterMetrics.ts`*

---

## 12. Phase B — Store, Device, Account, Region, AI (2026-06-16)

### New zones

| Zone | Purpose | Primary API |
|------|---------|-------------|
| Store Network | Draft → published → active store funnel | `GET /api/admin/platform/store-network` |
| Device Network / C-Net | Signage device health and scale | `GET /api/admin/platform/device-network` |
| Account Governance | Platform identity and verification | `GET /api/admin/platform/account-network` |
| Region Overview | Cross-entity regional breakdown | `GET /api/admin/platform/region-overview` |
| AI Operations | PIL/Performer intelligence usage (not runtime) | Client `buildPilDiagnostics()` + pipeline stats |

### Executive grid layout

1. **Platform Health** — full width  
2. **Business Network** \| **User Network**  
3. **Store Network** \| **Device Network**  
4. **Business Discovery** \| **Runtime Operations**  
5. **Account Governance** \| **AI Operations**  
6. **Region Overview** + **Platform Activity** — bottom  

### New backend endpoints

**File:** `apps/core/cardbey-core/src/routes/admin/platformOverview.js`  
**Mount:** `/api/admin` (requireAuth + requireAdmin)

#### `GET /api/admin/platform/store-network`

| Field | Source |
|-------|--------|
| totalDraftStores | `DraftStore` status in draft/generating/ready/failed |
| publishedStores | `Business.publishedAt != null` |
| activeStores | `Business.isActive && publishedAt` |
| archivedStores | `Business.isActive === false` |
| createdToday | DraftStore + Business created today |
| publishedToday | `Business.publishedAt >= today` |
| awaitingReview | `DraftStore.status === 'ready'` |
| publishConversionRate | committed / (ready + committed) |

#### `GET /api/admin/platform/device-network`

| Field | Source |
|-------|--------|
| totalDevices, online, offline | `Device` table |
| tvDevices, mobileDevices | Platform/type heuristics on Device rows |
| pairRequests | `DevicePairing` status pending |
| playlistFailures | `DevicePlaylistBinding` status failed |
| heartbeatErrors | `DeviceAlert` last 7d |
| lastHeartbeatAt | Latest `Device.lastSeenAt` |
| byRegion | Grouped by `Device.location` → normalized region |

#### `GET /api/admin/platform/account-network`

| Field | Source |
|-------|--------|
| totalAccounts | `User.count()` |
| verifiedAccounts | `emailVerified === true` |
| pendingVerification | `emailVerified === false` |
| businessAccounts | `hasBusiness` or `accountType` business/both |
| consumerAccounts | personal accountType, no business |
| suspendedAccounts | **Not tracked yet** — no schema field |
| disabledAccounts | **Not tracked yet** — no schema field |
| newToday, newThisWeek | `User.createdAt` windows |

#### `GET /api/admin/platform/region-overview`

Aggregates `Business.country/region`, `User.country`, `Device.location`, ingestion seed `normalized.country` into rows: `{ region, businesses, users, devices, claims }`. Unknown region when country missing.

### Component mapping (Phase B)

| UI section | Hook field | Display helper |
|------------|------------|----------------|
| Store Network cards + funnel | `storeNetwork` | `fmtMetric`, `fmtPct` |
| Device Network | `deviceNetwork` | `fmtMetric` |
| Account Governance | `accountGovernance` | `fmtMetric` |
| Region Overview | `regionOverview` | `CcRegionTable` |
| AI Operations | `aiOperations` | `fmtMetric` |

### Known gaps (Not tracked yet)

| Metric | Reason |
|--------|--------|
| Suspended / disabled accounts | No `User.suspended` field in schema |
| Returning users | No platform-wide session return metric |
| Queued missions | No queue depth API |
| Performer sessions (platform) | Session-local PIL only; no server aggregate |
| Discovery viewed (platform) | Session discover events unless platform analytics wired |
| Discovery claim education events | Not instrumented at platform level |

### Tests added

- `CardbeyControlCenter.test.tsx` — Phase B sections, no store BI, missing data → "Not tracked yet"
- `DashboardEnhanced.platformAdmin.test.tsx` — admin vs business user branch

### Phase B acceptance

- [x] Store Network, Device Network, Account Governance, AI Operations sections render
- [x] Region Overview table at bottom
- [x] Executive 2-column grid (not single vertical scroll of tiny cards)
- [x] Missing metrics show "Not tracked yet" — no fake numbers
- [x] Non-admin users still get `LivePerformanceCenter`


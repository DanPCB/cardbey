# Mission 1000 — Flow Traces

**Audit date:** 2026-07-21  
**Purpose:** Document *actual* current end-to-end paths (not aspirational docs). Disconnected edges marked **[DISCONNECTED]**.

---

## Repository map (relevant)

```
apps/core/cardbey-core          API, Kernel, Prisma, workers
apps/dashboard/cardbey-marketing-dashboard   SPA (git submodule)
packages/api-client, template-engine, cors-headers
docs/, reports/                 many impact reports (not runtime)
render.yaml                     staging + production env flags
```

---

## Stage 0 — Entry → first import action

```mermaid
flowchart LR
  subgraph FE["Dashboard SPA"]
    Signup["/signup"]
    Login["/login"]
    App["/app Performer"]
    Onb["/onboarding/business wizard"]
    Disc["/discover-business"]
    Creators["/creators /creator-studio"]
  end
  subgraph API["Core API"]
    Auth["/api/auth/*"]
    Intake["/api/performer/intake/v2"]
    Mem["/api/users/:id/onboarding"]
  end
  subgraph DB["Prisma"]
    User["User"]
    OP["OnboardingProgress"]
    Draft["DraftStore"]
  end
  Signup --> Auth --> User
  Login --> Auth
  Auth --> App
  App --> Intake
  Onb -.->|"parallel path"| Draft
  Disc -.->|"Places candidates JSON file"| API
  Creators -.->|"role confusion"| API
  Mem --> OP
  App -->|"sessionStorage next-step"| FE
```

**Working:** Signup/login → Performer.  
**Disconnected / competing:** Business Builder wizard; Creator Studio as alternate “product”; no welcome email; onboarding progress multi-SOT.

---

## Stage 1 — Import paths

### A) Canonical Performer path (intended)

```mermaid
flowchart TD
  U[Owner message / discovery bundle] --> FE[Performer console]
  FE --> API["POST /api/performer/store-creation/from-discovery"]
  API --> RUN["runUnifiedStoreCreationFromDiscovery"]
  RUN --> ENRICH["business.import.enrich / Kernel optional"]
  ENRICH --> MEM{"Kernel snapshots\nmemory://"}
  RUN --> PIPE["MissionPipeline type=store"]
  PIPE --> CREATE["create_store → DraftStore Prisma"]
  CREATE --> DRAFT[(DraftStore)]
  MEM -.->|"often not persisted"| X[Lost on restart]
```

**Evidence:**  
`routes/performerStoreCreationRoutes.js`  
`lib/storeMission/runUnifiedStoreCreationFromDiscovery.js`  
`lib/capabilities/businessImportEnrich.js`  
`lib/businessImportKernel/sources/snapshotStore.js` (`memory://`)

### B) Business Import Studio (advanced) — **legacy; normalized away from SME path**

```mermaid
flowchart TD
  PHRASE["Explicit Studio phrase"] --> CORE["buildOpenBusinessDiscoveryResponse"]
  CORE --> PERF["action create_store OR resume_active_mission"]
  PERF --> REVIEW["StoreDraftReview when draftId"]
  CORE -.->|"navigateTo Studio REMOVED"| X[Deprecated]
  API2["/api/business-import-studio/*"] --> SESS["sessionStore in-memory"]
  SESS --> KER["Kernel stages"]
  KER --> EXEC["execute persistToDraftStore:false"]
  EXEC -.->|"diagnostic only"| NO[(No default DraftStore)]
```

**Evidence:**  
`businessDiscoveryRouting.js` (Performer handoff; no Studio URL)  
`normalizeLegacyBusinessDiscoveryIntake.ts` (FE compat)  
`routes/businessImportStudioRoutes.js` (API retained)  
`App.jsx` — still no `/app/business-import-studio` route (by design)

### C) Parallel acquisition surfaces

| Input | Path | Durable? | Notes |
|---|---|---|---|
| Website URL | Kernel + Places UI | Partial | Places candidates file-backed |
| PDF/image | Kernel adapters + menu OCR API | Partial | Parallel stacks |
| Google Places | `/discover-business` → discovery APIs | Partial | Needs API key |
| FB/IG | classify only | No | **[DISCONNECTED]** |
| CSV | discovery-engine admin | Admin only | Not SME |
| Manual | ownerIntake fields | Yes → DraftStore | Works |

---

## Stage 2 — Presence

```mermaid
flowchart TD
  DRAFT[(DraftStore)] --> GEN["POST /api/draft-store/generate"]
  GEN --> REV["/preview/:draftId StoreDraftReview"]
  REV --> PUB{"Publish"}
  PUB --> SNAP["publishDraft / publish snapshot"]
  SNAP --> BIZ[(Business + Product Prisma)]
  BIZ --> PUBAPI["GET /api/public/stores/:slug"]
  PUBAPI --> SF["/s/:slug CanonicalStorefrontRenderer"]
  BIZ --> QR["DynamicQr /q/:code"]
  BIZ --> FEED["Marketplace public feed"]
  PUB -.->|"loyalty"| LOY["setup_loyalty_program separate"]
  LOY -.->|"DISCONNECTED from import"| X2[Not auto]
```

**Working:** Draft → publish → public URL → feed/QR.  
**Weak:** SEO/OG, auto loyalty, completeness after empty extraction.  
**Flags:** `PUBLISH_SNAPSHOT_V1` / `VITE_PUBLISH_SNAPSHOT_V1` dual path.

---

## Stage 3 — Content week

```mermaid
flowchart TD
  OWNER[Owner / Performer] --> TOOLS["Tools: generate_poster\ngenerate_social_posts\ncreate_video"]
  TOOLS --> FACT["Creative Factory V1"]
  FACT --> ASSET[Asset / mission outputs]
  OWNER --> CAMP["CampaignV2 schedule"]
  OWNER --> CS["Creator Studio CreatorContent"]
  CS --> QUEUE["Admin publishing queue"]
  LIFE["Lifecycle events"] --> SAE[(StoreActivityEvent)]
  SAE -.->|"DISCONNECTED"| TOOLS
  PROD["Creator Production Runtime"] -.->|"flags OFF + memory"| FIX[Fixtures]
  CG["Content Graph"] -.->|"flag OFF + memory"| FIX2[No Week-1]
  SOCIAL["Social publish"] -.->|"mock"| MOCK[Fake]
```

**Missing node:** orchestrator that builds 7-day branded plan from Business + catalog and returns approve UX.

---

## Stage 4 — Acquisition funnels

### A) Discovery / marketplace

```mermaid
flowchart LR
  FEED[Marketplace /] --> VIEW["/s/:slug"]
  VIEW --> CTA[Book / Quote / Offer]
  CTA --> QRQ["POST quote-requests"]
  QRQ --> DB[(Quote + StoreActivityEvent)]
  DB -.->|"weak"| N[Notification/email]
  N -.->|"DISCONNECTED often"| OWNER[Owner response]
  DI["Discovery Intelligence Panel"] -.->|"flag OFF memory"| FEED
```

### B) QR

```mermaid
flowchart LR
  SCAN["/q/:code"] --> LAND[Storefront / journey]
  LAND --> CTA[CTA]
  CTA --> CONV[Quote/booking]
  CONV --> COUNT[qrScans / intent signals]
  COUNT -.->|"weak attribution"| ATTR[Cardbey attributed first customer]
```

### C) Campaign

```mermaid
flowchart LR
  CAMP[Campaign created] --> SHARE[In-app / manual share]
  SHARE -.->|"external publish mock"| EXT[Social networks]
  SHARE --> LAND2[Landing / store]
  LAND2 --> CONV2[Conversion]
```

### D) Direct enquiry

```mermaid
flowchart LR
  FORM[Public quote form] --> SVC[quoteRequestService]
  SVC --> ACT[emitCustomerInquiryActivity]
  SVC --> OWNAPI[Owner quote-requests PATCH]
  ACT --> SAE2[(StoreActivityEvent)]
  OWNAPI --> GROWTH[Growth / leads APIs]
  SVC -.->|"DISCONNECTED"| EMAIL[Owner email notify]
```

---

## Stage 5 — Value / ROI

```mermaid
flowchart TD
  EVENTS[(StoreActivityEvent\nEngagementSnapshot\nCampaignReport)] --> GROWTH[Growth center UI]
  EVENTS -.->|"DISCONNECTED"| ROI[Value dashboard]
  TRACK["analytics.trackEvent"] -.->|"console stub"| VOID[No product sink]
  ROI -.->|"MISSING"| OWNER[Owner sees time/money]
```

---

## Stage 6 — Morning manager

```mermaid
flowchart TD
  OPEN[Owner opens /app] --> HOOK[useBusinessBriefing]
  HOOK --> BUILD[buildDailyBusinessBriefing]
  BUILD --> CARD[DailyBusinessBriefingCard / PIL]
  CARD --> ACT[Suggested action → governed intent]
  CRON["reportScheduler / discovery cron"] -.->|"mostly OFF"| EMAIL[Email/push briefing]
  EMAIL -.->|"DISCONNECTED"| OWNER2[Owner morning habit]
```

**Staging note:** `VITE_INTELLIGENCE_SURFACE_BRIEFING=true` enables in-app surface; does not create scheduled delivery.

---

## Persistence map

| Artifact | Storage | Multi-instance safe? |
|---|---|---|
| User, Business, Product, DraftStore, Booking, Quote, Loyalty, Campaign, CreatorContent, StoreActivityEvent | Prisma | Yes (with Postgres) |
| Import Kernel snapshots / Studio sessions | Memory | **No** |
| Discovery Intelligence projections | Memory (even if Prisma flag reserved) | **No** |
| Creator Identity default | Memory | **No** until Prisma flag |
| Creator Production default | Memory | **No** |
| Content Graph | Memory | **No** |
| Business discovery candidates | JSON file dir | Fragile |
| Post-profile next step | sessionStorage | Browser-only |
| Briefing quiet/snooze | localStorage | Browser-only |

---

## Feature-flag dependency hazards

```mermaid
flowchart TD
  DI["ENABLE_DISCOVERY_INTELLIGENCE_PANEL_V2"] --> CGP["ENABLE_DISCOVERY_CONTENT_GRAPH_PROJECTIONS_V1"]
  DI --> MEM["Always memory repo today"]
  KER["ENABLE_BUSINESS_IMPORT_KERNEL_V1"] --> DSA["ENABLE_BUSINESS_IMPORT_DRAFTSTORE_ADAPTER_V1"]
  PROD["ENABLE_CREATOR_PRODUCTION_RUNTIME_V1"] --> PRISMA["ENABLE_CREATOR_PRODUCTION_PRISMA_V1"]
  PROD --> STUDIO["ENABLE_CREATOR_PRODUCTION_STUDIO_V1"]
  OFF["Most creator/DI flags default false"] --> DEAD["UI routes may exist but empty/fixture"]
```

**Dead-end UX examples:** navigating to Studio import (404); enabling DI panel with empty memory projections; Creator Production Studio with fixtures while SME expects real media.

---

## Production vs staging (from `render.yaml`)

| Concern | Staging | Production |
|---|---|---|
| Performer runtime kernel | ON | ON |
| Discovery cron | `DISCOVERY_ENABLED=false` | false |
| Loyalty spine | true | true |
| PIL briefing Vite | true | (check dashboard env) |
| Video transcode | skipped | skipped |
| Import Kernel / DI Prisma | not set ON in yaml | not set ON |

Infer: **staging does not currently turn on Mission 1000 import durability or Discovery Intelligence.**

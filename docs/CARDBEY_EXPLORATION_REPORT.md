# Cardbey Project — Structured Exploration Report

A concise, markdown-friendly report of repo structure, core backend, agents/orchestration, data model, extension points, and frontend.

---

## 1. Repo structure

### Top-level directories

- **`apps/`** — Workspace applications (Core API, Dashboard).
- **`packages/`** — Shared libraries (api-client, template-engine).
- **`scripts/`** — Repo-level automation and one-off scripts.
- **`docs/`** — Project documentation (including this report).

### Apps (`apps/`)

| App | Path | Purpose |
|-----|------|---------|
| **cardbey-core** | `apps/core/cardbey-core` | Central backend API: auth, stores, draft store generation, devices, MI/orchestrator, signage, loyalty, RAG, reports, admin. Express + Prisma + SQLite. |
| **cardbey-marketing-dashboard** | `apps/dashboard/cardbey-marketing-dashboard` | Main user-facing dashboard (Vite + React). Store creation, draft review, devices, content studio, performer/back office, greeting cards, MI flows. Talks to Core via `@cardbey/api-client` and optional Vite proxy. |

### Packages (`packages/`)

| Package | Purpose |
|---------|---------|
| **@cardbey/api-client** | Shared API client for Core: base URL resolution (local/proxy vs Render), `buildUrl()`, typed fetch helpers. Used by the dashboard. |
| **@cardbey/template-engine** | Shared template types/utilities (e.g. template slot definitions). |

---

## 2. Core backend (cardbey-core)

### Main entry

- **`src/server.js`** — Express app entry. Loads env via `./env/loadEnv.js` and `./env/ensureDatabaseUrl.js`, initializes DB, CORS, middleware, mounts all routers, starts HTTP server (and WebSocket/SSE when `ROLE !== 'worker'`). Run with `tsx src/server.js` or `npm run dev` (nodemon).

### How routes are mounted

- Express `Router()` instances are imported and mounted with `app.use(path, router)`.
- Order: static/assets and health first, then auth, then domain routes, then admin/internal, then SPA fallback and error handler.
- Auth: `requireAuth`, `optionalAuth`, `requireAdmin` (and guest helpers) from `src/middleware/auth.js` are applied per route or router.

### Key route files

| Mount | Route file | Role |
|-------|------------|------|
| `/api/auth` | `routes/auth.js` | Register, login, me, profile, verify, reset, guest. |
| `/api/stores`, `/api/store` | `routes/stores.js` | Store CRUD, context, preview, draft, promos, publish, stats. |
| `/api/draft-store` | `routes/draftStore.js` | Draft generate, by-store, create-from-store, claim, patch, commit. |
| `/api/device`, `/api/devices` | `routes/deviceEngine.js`, `routes/deviceAgentRoutes.js` | Device list, pairing, playlist bindings; device agent register, heartbeat, playlists. |
| `/api/mi` | `routes/miRoutes.js` | MI orchestrator: playlist/template suggestions, orchestra/start, orchestra/job/:id, promo/from-draft, classify-business, etc. |
| `/api/orchestrator` | `orchestrator/api/orchestratorRoutes.js` | POST /run (orchestrator), task creation, SAM3 design task, SSE progress. |
| `/api/automation` | `routes/automation.js` | Headless automation (e.g. store-from-input). |
| `/api/menu` | `routes/menuRoutes.js` | Menu engine (e.g. configure-from-photo). |
| `/api/catalog` | `routes/catalog.js` | Catalog SAM-3 process, reprocess. |
| `/api/ai`, `/api/ai/images`, `/api/studio` | `routes/ai.js`, `routes/aiImages.js`, `routes/studio.js` | AI design, images, studio. |
| `/api/rag` | `routes/rag.js` | RAG endpoints. |
| `/api/admin` | `routes/admin.js`, `routes/adminMedia.js`, `routes/mediaHealth.js` | Admin + media health (requireAdmin). |
| `/api/workflows` | `routes/workflows.js` | Legacy workflow: from-prompt, execute (poster + CNet). |

### Agent / orchestrator / workflow concepts in core

- **Orchestrator** — `src/orchestrator/`: types, context (vision/text), intent, planning, skills (skillRegistry), execution (workflowRunner, stateStore, errorHandler). API: `orchestratorRoutes.js` (POST /api/orchestrator/run, task creation, SAM3 task, SSE).
- **Workflows (legacy)** — `routes/workflows.js`: prompt → parsed actions → create `Workflow` record, generate poster, CNet preview; execute workflow by ID.
- **Tools registry** — `orchestrator/toolsRegistry.js`: in-memory registry; `initializeToolsRegistry()` registers tools from engines (loyalty, menu, promo, signage, device). Used by orchestrator to resolve tools by name/engine.
- **Engines** — Under `src/engines/`: device, loyalty, menu, promo, signage. Each exposes tools (e.g. `deviceTools`, `signageTools`) that the orchestrator can use.
- **Orchestra (MI)** — In `miRoutes.js`: “orchestra” = MI job for store generation. POST `/api/mi/orchestra/start` creates an `OrchestratorTask`, runs build-store pipeline (orchestraBuildStore.js), GET `/api/mi/orchestra/job/:jobId` polls status.
- **Creative agent** — `src/agents/creative/`: scaffolded “Creative Agent” (stub) for contextual creative ideas from orchestrator context/plans.

---

## 3. Existing agent / AI / orchestration

| Concept | Where defined | One-line role |
|--------|----------------|----------------|
| **Orchestrator (generic)** | `src/orchestrator/` (api, context, intent, planning, skills, execution) | Runs intent-based plans (image/text + storeId); skill registry + workflow runner; HTTP `/api/orchestrator/run` and task/SAM3 endpoints. |
| **Orchestra (MI store build)** | `routes/miRoutes.js`, `services/draftStore/orchestraBuildStore.js` | MI job that creates/updates a draft store from user input; status in `OrchestratorTask`; polled via `/api/mi/orchestra/job/:jobId`. |
| **MI routes** | `routes/miRoutes.js` | Signage playlist suggestions, template suggestions/instantiate/generate, promo from draft/idea/product, classify-business, orchestra start/job/run. |
| **Device engine** | `routes/deviceEngine.js`, `engines/device/` | Device listing, pairing, playlist binding; device tools registered in tools registry. |
| **Device agent** | `routes/deviceAgentRoutes.js`, `realtime/deviceWebSocketHub.js` | REST: register, heartbeat, playlists; WebSocket hub for device real-time communication. |
| **Menu engine / visual agent** | `routes/menuRoutes.js`, `engines/menu/`, `services/menuVisualAgent/` | Menu-from-photo, configure-from-photo; optional Menu Visual Agent (ENABLE_MENU_VISUAL_AGENT). |
| **Workflows (legacy)** | `routes/workflows.js` | Create workflow from prompt, execute (generate poster + CNet preview). |
| **Creative agent** | `src/agents/creative/` | Stub agent for proactive creative ideas from orchestrator context (not wired into HTTP yet). |
| **RAG** | `routes/rag.js`, `services/ragService.js` | Retrieval-augmented generation endpoints. |
| **AI SSE / metrics / events / suggestions** | `ai/sse/router.js`, `ai/metrics/router.js`, `ai/events/router.js`, `ai/suggestions/router.js` | AI streaming, metrics, event intake, suggestions. |

---

## 4. Data model (high level)

**Prisma schema:** `apps/core/cardbey-core/prisma/schema.prisma` (SQLite).

### Main models (summary)

- **User** — Auth, profile, roles, email verification, aiCreditsBalance, welcomeFullStoreRemaining, handle (public profile).
- **Business** — One per user (userId), store identity, slug, translations, brand (primaryColor, heroText, etc.), publishedAt.
- **StorePromo** — Promos (storeId, slug, scanCount, productId, etc.).
- **Product** — Catalog items (businessId, name, price, category, images, translations, hasSam3Cutout).
- **DraftStore** — Pre-signup draft (mode, status, input, preview, generationRunId, committedStoreId, ownerUserId, guestSessionId).
- **Device** — Devices (tenantId, storeId, platform, status, pairing, etc.).
- **DevicePairing**, **DeviceCapability**, **DeviceStateSnapshot**, **DevicePlaylistBinding**, **DeviceCommand**, **DeviceLog**, **DeviceAlert** — Device lifecycle and playback.
- **Screen**, **PairingSession**, **PairCode** — Screens and pairing.
- **Content** — Content Studio (userId, elements, settings, renderSlide, thumbnailUrl).
- **Playlist**, **PlaylistItem** — Unified playlists (type: MEDIA, SIGNAGE, PROMO).
- **SignageAsset**, **PlaylistSchedule** — Signage.
- **Workflow** — Legacy workflows (name, prompt, status, trigger, actions JSON).
- **Campaign** — Campaign (workflowId, status, data).
- **OrchestratorTask** — Orchestrator/AI job (entryPoint, tenantId, userId, status, request, result).
- **PaidAiJob** — Idempotent paid AI job (userId, refId, actionName, status).
- **MIEntity** — MI “mini-brains” attached to products (productId, productType, miBrain JSON, links to creative/report/screen/packaging).
- **CreativeTemplate**, **GreetingCard**, **MiVideoTemplate**, **MiMusicTrack** — Templates and greeting cards.
- **LoyaltyProgram**, **LoyaltyStamp**, **LoyaltyReward** — Loyalty.
- **PromoRule**, **PromoRedemption** — Promos.
- **RagChunk** — RAG chunks.
- **TenantReport**, **TenantInsight**, **SystemEvent**, **SystemInsight** — Reports and system events.
- **Notification**, **SeedCatalog**, **SeedAsset**, **SmartObject**, **DynamicQr**, **ScanEvent** — Notifications, seeds, QR, scans.
- **JourneyTemplate**, **JourneyStepTemplate**, **JourneyInstance**, **JourneyStep** — Journey/planner.
- **Demand**, **AssistantSuggestion**, **EventLog**, **SuggestionLog**, **IdempotencyKey**, **AuditEvent**, **PriceChange**, **ReorderRequest**, **CreativeRefreshTask**, **TrendProfile**, **Media**, **ContentIngestSample**, **PasswordResetToken**, **SeedAssetFile**, **SeedIngestionJob** — Supporting domains.

There are **no** dedicated “service” or “marketplace” or “agent” tables; **OrchestratorTask** and **PaidAiJob** track orchestrator/AI jobs; **MIEntity** holds MI metadata for creatives.

---

## 5. Extension points

### Middleware

- **Auth:** `middleware/auth.js` — `requireAuth`, `optionalAuth`, `requireAdmin`, role checks.
- **Guests:** `middleware/guestSession.js`, `guestAuth.js`, `guestLimit.js` — Guest session ID, guest auth, draft limits.
- **Rate limit:** `middleware/rateLimit.js` — Per-route rate limits (e.g. orchestra-start).
- **Other:** `requestId.js`, `errorHandler.js`, `requestLog.js`.

Pattern: apply `requireAuth` / `optionalAuth` / `requireAdmin` on routers or individual routes; no plugin loader.

### Env-based feature flags

- **ENABLE_EMAIL_VERIFICATION** — Verification emails and publish gating.
- **ENABLE_GUEST_AUTH** / **GUEST_AUTH_ENABLED** / **ALLOW_GUEST_AUTH** — Guest login.
- **ENABLE_MENU_VISUAL_AGENT** — Menu Visual Agent (and exposed in home flags as `menu_visual_agent_v1`).
- **FEATURE_MENU_GRID_CROP_IMAGES** — Menu grid crop.
- **ENABLE_DRAFT_GUARDS** — Draft guard behavior.
- **ENABLE_CONTENT_INGEST_LOGS** — Content ingest export (dev); gates `/api/dev/content-ingest/export`.

No generic feature-flag service; flags are read from `process.env` in code.

### Plugin / service registration

- **Tools registry** — `orchestrator/toolsRegistry.js`: `registerTools()`, `getToolByName()`, `findToolsByEngine()`, `listTools()`. `initializeToolsRegistry()` imports engines (loyalty, menu, promo, signage, device) and registers their tools. Adding a new engine = new import + `registerTools()` in that function.
- **Routes** — No dynamic route loader. New features = new router file + `app.use(...)` in `server.js`.
- **Engines** — Engines live under `src/engines/` and expose tool arrays; they are the natural extension point for “new agents” or “new skills” that the orchestrator can call.

**For a marketplace:** you could add new routes (e.g. `/api/marketplace`), new Prisma models (e.g. `MarketplaceListing`, `InstalledService`), and optionally register marketplace-backed tools in the tools registry so the orchestrator can invoke them.

---

## 6. Frontend / dashboard

### Main dashboard

- **App:** `apps/dashboard/cardbey-marketing-dashboard` (`@cardbey/dashboard`).
- **Stack:** Vite, React, React Router, TanStack Query, Zustand, Tailwind.
- **Entry:** Vite dev server (e.g. port 5174); production build served as SPA.

### How it talks to Core

- **@cardbey/api-client** — Shared client used by the dashboard. Base URL via `getCoreBaseUrl()` (or dashboard’s `getEffectiveCoreApiBaseUrl()` when available): in dev with Vite, uses relative URLs so the Vite proxy forwards to Core; otherwise `localStorage` (e.g. `cardbey.dev.coreUrl`), `window.__APP_API_BASE__`, or `VITE_CORE_BASE_URL`.
- **Dashboard resolver** — `src/lib/getCoreApiBaseUrl.ts`: `getEffectiveCoreApiBaseUrl()`, modes `auto` | `local` | `render`, `CORE_URL_MODE_KEY`, `cardbey.dev.coreUrl`, fallback to Render URL.
- **Proxy** — In Vite dev, API calls are typically proxied to Core (e.g. 3001) so the browser uses the same origin.

### Admin / “marketplace” UI

- **Back office** — `src/app/back/BackOffice.tsx` + `Sidebar.tsx`: nested routes under `/app/back` for Live Performance, Enhanced Performer, Performer, Screens, Campaigns, Content, Products, Orders, Loyalty (scan card), Roles & Permissions, API Keys, Control Hub. No “marketplace” or “plugins” section.
- **Admin API** — Core exposes `/api/admin` and `/api/admin/media` (requireAdmin); dashboard uses these for admin flows but there is no dedicated marketplace UI or plugin management UI.

---

## Summary

- **Repo:** Monorepo with `apps/core` (Express API), `apps/dashboard` (Vite React app), and `packages` (api-client, template-engine).
- **Core:** Single Express app in `server.js`; routes for auth, stores, draft-store, devices, MI/orchestrator, orchestra jobs, automation, menu, catalog, AI, RAG, workflows, admin.
- **Agents/orchestration:** Generic orchestrator (skills + workflow runner), Orchestra (MI store-build jobs), device engine/agent, menu/Menu Visual Agent, legacy workflows, creative agent (stub), RAG.
- **Data:** Prisma (SQLite); User, Business, StorePromo, Product, DraftStore, Device and related, Content, Playlist, Workflow, Campaign, OrchestratorTask, PaidAiJob, MIEntity, templates, loyalty, promos, etc. No marketplace/agent tables yet.
- **Extension:** Middleware (auth, guest, rate limit), env feature flags, tools registry (engines register tools), and explicit route mounting in `server.js`.
- **Frontend:** Dashboard is the main app; it uses `@cardbey/api-client` and optional Vite proxy to Core; Back Office exists for internal admin; no marketplace UI.

This report is suitable to present as a single consolidated reference for the Cardbey project.

# Cardbey — System Architect Overview

**Audience:** Senior system architects  
**Purpose:** One document to understand scope, current architecture, planned work, and future integration.  
**Last updated:** 2026-03-08

---

## 1. Purpose and philosophy

**Cardbey** is an **AI-first platform** for:

- **Store management** — Business profiles, product catalogs, digital menus
- **Promotions and intent capture** — Offers, QR funnels, intent feeds, growth opportunities
- **Digital signage and devices** — C-NET (TV/tablet) players, playlists, campaigns
- **Content and campaigns** — Creative templates, slideshows, campaign planning
- **Loyalty** — Programs, stamps, rewards (existing models; integration in progress)

**Core rule:** “If anything can be done by AI, we integrate the APIs. Manual is an option.”  
**Execution rule:** All seller execution runs through **one runway** — Mission Execution / MI Orchestrator. Artifact UIs are viewers; they create **IntentRequest** and hand off to Mission, they do **not** call AI or orchestration APIs directly.

---

## 2. High-level architecture

### 2.1 Single Runway (canonical flow)

```
Users express intent
        ↓
Mission Console (Single Runway)
        ↓
Creates IntentRequest
        ↓
Mission Execution (Control Tower)
        ↓
Runs through MI Orchestrator
        ↓
Agent Team (Context · Catalog · Media · Copy · Promotion · Optimization)
        ↓
Platform Artifacts (Store · Offer Pages · QR · Campaigns · Slideshows · Intent Feeds)
        ↓
Intent Capture Layer (Public Pages · Feeds · QR · Shareable Links)
        ↓
Cardbey Network (Search · AI assistants · Social · QR scans · C-NET devices)
        ↓
Signals (offer_view, qr_scan, cta_click, lead_capture, share_click)
        ↓
Intent Opportunities
        ↓
Mission Inbox → new intents → loop
```

### 2.2 Three-layer contract

| Layer | Responsibility | Must / Must not |
|-------|----------------|------------------|
| **1. Intent interface (UI)** | Collect user intent; create `IntentRequest`; show results and checkpoints | Must **never** execute AI tasks directly |
| **2. Orchestrator** | Consume `IntentRequest`; call LLMs and store/draft APIs; produce `MissionEvent`, artifacts, signals | **Only** the orchestrator may call LLM APIs and orchestration/start and mutation APIs |
| **3. Artifact surfaces** | Display results; request actions (by creating intents) | **Never** execute orchestration; actions → create IntentRequest → Mission Execution |

**Single Runway rule:** When `missionId` exists, artifact UI **must** create IntentRequest and **must not** call orchestration APIs. All execution goes through Mission Execution UI.

### 2.3 System loop

**AI Business Operator Loop:**

Intent → Mission → Agents → Artifacts → Signals → Opportunities → New Intent

Every completed intent must produce `intent.result` with links to artifacts (draft review, offer page, QR, feed) so “completed but no outputs” cannot occur.

---

## 3. Applications and tech stack

| Application | Location | Port (dev) | Tech |
|-------------|----------|------------|------|
| **Backend API (Cardbey Core)** | `apps/core/cardbey-core` | 3001 | Node.js, Express, Prisma, TypeScript/JS |
| **Marketing Dashboard** | `apps/dashboard/cardbey-marketing-dashboard` | 5174 | React, Vite, TypeScript |
| **Public website** | (sibling repo) | 3000 | React, Vite |
| **C-NET Player** | Embedded in core | — | HTML/JS at `/player`, `/device/player` |

**Database:** SQLite (dev) / PostgreSQL (prod). Schema: `apps/core/cardbey-core/prisma/postgres/schema.prisma` (and sqlite variant).

---

## 4. Core domains

### 4.1 Store and draft

- **Business** — Store entity (name, type, slug, profile, hero/avatar, publishedAt, etc.).
- **DraftStore** — Uncommitted store state (input, preview with catalog/items/hero/avatar, status: draft | generating | ready | error). Key identifier: `generationRunId` (links job ↔ draft).
- **Publish flow** — Draft → commit → Business; draft can be created from template, AI (profile + menu), or OCR.
- **Single path:** Store creation is owned by Mission Launcher / Mission Execution; lineage (missionId, draftId, generationRunId, storeId) must be preserved through auth gates and publish so “back to edit” and publish always refer to the same store.

### 4.2 Promotion and intent capture

- **StoreOffer** — Promotion entity (store, slug, title, description, isActive, endsAt). Created by `create_offer` intent.
- **DynamicQr** — QR code (code, storeId, type: offer, targetPath, payload). Used for `/q/:code` redirect.
- **IntentSignal** — Events (offer_view, page_view, qr_scan, etc.) per store/offer.
- **IntentOpportunity** — Computed suggestions (e.g. no_first_offer → create_offer, high_views_no_qr → create_qr_for_offer). Accepted → creates IntentRequest in mission.
- **Public surfaces** — Offer pages (`/p/:storeSlug/offers/:offerSlug`), intent feed (`GET /api/public/stores/:storeId/intent-feed`), QR redirect (`/q/:code`).

### 4.3 Missions and execution

- **Mission** — Registry for a mission (id, tenantId, createdByUserId, title, status, context). Context can hold chainPlan, missionPlan, lineage.
- **IntentRequest** — Queued/running/completed/failed intent (missionId, type, payload, result). Types include create_offer, create_qr_for_offer, generate_tags, rewrite_descriptions, generate_store_hero, publish_intent_feed, mi_assistant_message, etc.
- **OrchestratorTask** — Job record (entryPoint, request, status, result). Entry points: build_store, autofill_product_images, generate_tags, mi_command, llm_generate_copy, device/campaign/studio insights, etc.
- **MissionEvent** — Append-only stream (missionId, intentId, agent, type: started | progress | completed | failed, payload).
- **AgentRun** — Mission execution run (research, planner, ops, etc.) with optional chain plan (cursor, suggestions).

Execution paths:

- **Mission Inbox:** Opportunity accept or POST intents → IntentRequest → POST run → orchestrator branch (create_offer, catalog, media, etc.).
- **Orchestra:** POST orchestra/start → OrchestratorTask → POST job/run → build_store or MI goals or insights handlers.
- **Agent Chat:** User message → planner/RAG → execution_suggestions → chain plan → dispatch → AgentRun (research/planner). Only this path has an explicit “mission plan” (chainPlan) before agents run.

### 4.4 Device and signage (C-NET)

- **Device, Screen, Playlist, PlaylistItem, Media** — Device registration, playlists, content.
- **Device pairing** — PairingSession, PairCode; player polls and heartbeats.
- **Signage/Campaign** — Campaign, CampaignPlan, CreativeTemplate, CreativeAsset; device handlers in insights orchestrator (device_health_check, playlist_assignment_audit, etc.).

### 4.5 Content and AI

- **Content Studio** — Creative templates, content generation, proposals.
- **AI engines** — Vision (OCR, Universal Vision Input), Text (OpenAI adapter, LLM provider abstraction), Content (image generation). Target: all AI via orchestrator; currently some direct OpenAI call sites remain (aiService, llmMenuParser, assistant, etc.).
- **LLM service path** — `llm_generate_copy` task → runLlmGenerateCopyJob → provider (e.g. Kimi) + **LlmCache** + **LlmUsageDaily** (budget guard). Use this path for new and high-volume LLM use; migrate existing callers incrementally.

---

## 5. Key data entities (Prisma)

Representative models (see `prisma/postgres/schema.prisma` for full list):

| Domain | Key models |
|--------|------------|
| Identity / tenant | User, Business |
| Store / catalog | Business, Product, DraftStore |
| Promotion / intent | StoreOffer, DynamicQr, IntentSignal, IntentOpportunity, StorePromo |
| Missions / orchestration | Mission, IntentRequest, MissionEvent, OrchestratorTask, AgentRun, AgentMessage |
| Device / signage | Device, Screen, Playlist, PlaylistItem, Media, Campaign, CampaignV2 |
| AI / budget | LlmCache, LlmUsageDaily, RagChunk |
| Loyalty | LoyaltyProgram, LoyaltyStamp, LoyaltyReward |
| Content / creative | CreativeTemplate, MIEntity, Content |

---

## 6. Execution model (detail)

### 6.1 User intent capture

- **Store opportunities** — GET store opportunities → accept with missionId → IntentRequest (type from opportunity, payload with storeId).
- **Mission Inbox** — POST `/api/mi/missions/:missionId/intents` (type, payload) → IntentRequest queued.
- **Orchestra start** — POST `/api/mi/orchestra/start` (goal, businessName, storeId, etc.) → OrchestratorTask (entryPoint).
- **Agent chat** — POST agent-messages; optional dispatch (research/planner); handleUserTurn for ops/special intents.
- **Insights** — POST `/api/orchestrator/insights/execute` (entryPoint, payload) → OrchestratorTask → executeTask(entryPoint).

### 6.2 Orchestrator routing

- **MI Intents run** — `POST /api/mi/missions/:missionId/intents/:intentId/run`. Switch on intent type: create_offer, create_qr_for_offer, publish_*, mi_assistant_message, catalog (generate_tags, rewrite_descriptions), media (generate_store_hero). Emit MissionEvent; write intent.result.
- **Orchestra job run** — `POST /api/mi/orchestra/job/:jobId/run`. build_store → generateDraft (or stepped catalog/visuals/item_images); MI_DRAFT_GOALS → run workers (autofill, tags, rewrite, hero, mi_command); fix_catalog → not implemented (fail gracefully); insights → executeTask.
- **Insights orchestrator** — executeTask(entryPoint): agent_chat_reply (RAG + planner reply), device_* (deviceHandlers), campaign_* (campaignHandlers), studio_* (studioHandlers).

### 6.3 Mission plan (current state)

- **Chain plan (Agent Chat only)** — Mission.context.chainPlan from execution_suggestions (suggestions[], cursor, risk). maybeAutoDispatch advances cursor and runs next agent (research/planner). Retry/skip when blocked.
- **Mission Inbox / Orchestra** — No first-class “mission plan”; single intent or single entryPoint drives execution. Unifying “user intent → orchestrator → mission plan → agents” for these flows is planned (see §9).

---

## 7. Auth and boundaries

- **Guest users** — Can create and inspect a draft store. **Any** follow-up mission execution (Launch first offer, accept opportunity, Run intent, MI Assistant actions) requires sign-in/sign-up. Frontend gates with auth modal and returnTo (lineage); backend rejects guest on e.g. opportunity accept with 403 `account_required`.
- **Mission lineage** — returnTo preserves missionId, draftId, generationRunId, jobId, storeId, committedStoreId so post-auth user resumes same mission/draft/store.
- **Single Runway** — When missionId is present, artifact UIs (Draft Review, ImproveDropdown, etc.) use dispatchMissionIntent (or equivalent) and do not call `/api/mi/orchestra/start` directly for gated goals.

---

## 8. Integrations and surfaces

| Surface | Purpose |
|---------|---------|
| **Public offer pages** | `/p/:storeSlug/offers/:offerSlug` — offer display; signals (views, etc.). |
| **Intent feed** | `GET /api/public/stores/:storeId/intent-feed` — JSON for AI/agents (store, offers, URLs). |
| **QR redirect** | `/q/:code` — DynamicQr → targetPath (e.g. offer page); scan tracking. |
| **C-NET player** | Polls playlists/screens; heartbeats; displays media. |
| **Dashboard** | Store/draft review, mission console, execution drawer, agent chat, opportunities, content studio. |
| **MI object landing** | Public MI chat surface (e.g. `/mi/o/:publicId`) for QR landings. |

Signals (IntentSignal, ScanEvent, etc.) feed into Intent Opportunities and back into the mission loop.

---

## 9. Already implemented vs planned

### 9.1 Implemented

- Single Runway gate (M1): outcome UIs send intents to Mission when missionId present; ImproveDropdown uses dispatchMissionIntent for gated goals.
- Mission and IntentRequest model; MissionEvent stream; AgentRun and chain plan (Agent Chat).
- create_offer / create_qr_for_offer / catalog / media intent execution; normalized create_offer result for promotion handoff.
- Orchestra start and job run (build_store, MI draft goals, mi_command); draft generation (template/AI/OCR), generateDraft.
- Intent opportunities (compute + accept); guest auth boundary (gate + backend 403).
- LLM provider abstraction (Kimi); LlmCache; LlmUsageDaily (budget guard); llm_generate_copy task.
- RAG for agent_chat_reply; insights orchestrator (device/campaign/studio entry points).
- Public intent feed and QR routes; store/offer pages.

### 9.2 Planned / future integration

- **M2 — Unify pipeline vs AI Operator** — One backend mission start; Pipeline and AI Operator as UI modes; one job record, one missionId, one event stream.
- **M3 — True agent orchestration** — Agents emit events; Mission Execution UI consumes and asks at checkpoints; IntentRequest.agent used for routing (CopyAgent, CatalogAgent, etc.).
- **User intent → Orchestrator → Mission plan → Agents** — Add orchestrator-produced mission plan for Mission Inbox and Orchestra (not only Agent Chat); optionally single orchestrator API for all intents.
- **Stepped store creation** — Coarse steps (catalog → visuals → item_images) in OrchestratorTask.result.steps; same generateDraft logic, step-by-step visibility and failure isolation.
- **Entity framework** — Formal entity contract (entityId, entityType, brainContext, bodyConfig, surfaceConfig, signalConfig, missionHooks) and taxonomy (store, product, promotion, QR); additive over current store/product/promo objects.
- **LLM service adoption** — Route new and high-volume LLM call sites through cache + budget path; migrate aiService, llmMenuParser, translation, assistant incrementally.
- **AI abstraction** — All AI calls via orchestrator/engines; no direct OpenAI in routes (target already stated in ARCHITECTURE.md).
- **Device agent modularity** — Player as modular agent (pairing, playlistManager, fileCache, renderer, healthMonitor); optional local AI.

---

## 10. Key documents index

| Topic | Document |
|-------|----------|
| System contract | `docs/CARDBEY_SYSTEM_CONTRACT.md` |
| Single Runway | `docs/SINGLE_RUNWAY_AUDIT_AND_PLAN.md`, `docs/SINGLE_RUNWAY_M1.5_IMPLEMENTATION.md` |
| Architecture (current + target) | `apps/core/cardbey-core/docs/ARCHITECTURE.md` |
| Mission flow / launch | `docs/MISSION_FLOW_LAUNCH_READINESS_AUDIT.md` |
| Guest auth boundary | `docs/MISSION_GUEST_AUTH_BOUNDARY_IMPLEMENTATION.md` |
| Store creation path | `docs/STORE_CREATION_PATH_AUDIT_PROMPT.md` |
| User intent / orchestrator / plan | `docs/SYSTEM_AUDIT_USER_INTENT_ORCHESTRATOR_MISSION_PLAN.md` |
| Entity framework | `docs/ENTITY_FRAMEWORK_COMPATIBILITY_REPORT.md` |
| Stepped store creation | `docs/MI_STEPPED_STORE_CREATION_PLAN.md` |
| RAG / orchestrator | `docs/ORCHESTRATOR_RAG_WIRING.md` |
| Mission Engine (phase A, chain plan) | `docs/MISSION_ENGINE_PHASE_A.md` |
| Development principles | `docs/DEVELOPMENT_PRINCIPLES.md` |
| Project overview (Grok) | `CARDBEY_PROJECT_OVERVIEW_FOR_GROK.md` |
| System overview (diagram) | `Cardbey System Overview.md` |

---

## 11. Summary for architect

- **Cardbey** is an AI-first SMB platform: one execution runway (Mission → Orchestrator → Agents → Artifacts), with signals and opportunities closing the loop.
- **Scope:** Stores/drafts, promotions/offers/QR/feeds, missions/intents, device/signage, content/campaigns, loyalty (models in place), with clear auth (guest vs registered) and Single Runway enforcement.
- **Current state:** Single Runway gate (M1) and promotion handoff are in place; orchestrator and “mission plan” are fully aligned only in Agent Chat; Mission Inbox and Orchestra are single-step execution.
- **Planned:** Unify mission start (M2), agent checkpoint orchestration (M3), explicit mission plan for all intents, stepped store creation, entity framework adoption, and full LLM/AI path through cache/budget and engine abstraction.

This overview should be enough for a senior system architect to understand scope, boundaries, data and execution model, and where the system is heading.

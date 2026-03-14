# Agent Marketplace for Service (Service Agent on Demand) — Compatibility & Upgrade Report

This report assesses the current Cardbey structure and how compatible it is with building an **agent marketplace for service** (service agents on demand). It builds on the [Cardbey Exploration Report](./CARDBEY_EXPLORATION_REPORT.md).

---

## 1. What “agent marketplace for service” means here

- **Service agent:** An agent (skill set / tool set / workflow) that performs a specific *service* for a tenant or end user—e.g. “menu-from-photo,” “loyalty stamp,” “promo from draft,” “device playlist push,” “store build from description.”
- **On demand:** The agent is invoked when needed (user action, schedule, or event), not always running.
- **Marketplace:** A catalog of such agents that tenants (or admins) can discover, enable, and use—optionally with billing, permissions, and versioning.

So the target is: **discoverable, pluggable service agents that can be enabled per tenant and invoked on demand**, with a path to a full marketplace (listings, installs, usage, billing).

---

## 2. Current Cardbey structure (summary)

- **Monorepo:** `apps/core` (Express API), `apps/dashboard` (Vite React), `packages` (api-client, template-engine).
- **Core:** Single Express app; routes for auth, stores, draft-store, devices, MI/orchestrator, orchestra, automation, menu, catalog, AI, RAG, workflows, admin.
- **Data:** Prisma (SQLite); User, Business, StorePromo, Product, DraftStore, Device (+ pairing/playlist), Content, Playlist, Workflow, Campaign, **OrchestratorTask**, **PaidAiJob**, MIEntity, templates, loyalty, promos, etc. **No marketplace/agent catalog tables yet.**

Details: see [CARDBEY_EXPLORATION_REPORT.md](./CARDBEY_EXPLORATION_REPORT.md).

---

## 3. What is already built and compatible

### 3.1 Orchestrator + tools registry (core enabler)

- **Location:** `src/orchestrator/` (intent, planning, skills, workflow runner) and `src/orchestrator/toolsRegistry.js`.
- **Behavior:** Intent-based plans; **skill/tool registry** with `registerTools()`, `getToolByName()`, `findToolsByEngine()`, `listTools()`.
- **Compatibility:** This is the natural place to attach “service agents.” Today each **engine** (loyalty, menu, promo, signage, device) registers tools; a marketplace could register **marketplace-backed tools** (e.g. call a remote agent or a tenant-installed service) the same way.

### 3.2 Engines as “service agents” today

| Engine   | Path / tools              | Role (one line)                          |
|----------|---------------------------|------------------------------------------|
| Loyalty  | `engines/loyalty/`        | Stamp, reward, program tools             |
| Menu     | `engines/menu/`           | Menu-from-photo, configure-from-photo     |
| Promo    | `engines/promo/`          | Promo creation / from-draft tools        |
| Signage  | `engines/signage/`        | Signage/playlist tools                   |
| Device   | `engines/device/`         | Device list, pairing, playlist binding   |

These are effectively **first-party service agents**: they expose tools the orchestrator can run on demand. The same pattern (engine → register tools) can be used for marketplace agents.

### 3.3 Job and task model

- **OrchestratorTask** — Generic orchestrator/AI job (entryPoint, tenantId, userId, status, request, result). Used by Orchestra (MI store build) and orchestrator runs.
- **PaidAiJob** — Idempotent paid AI job (userId, refId, actionName, status).

**Compatibility:** “Service agent on demand” runs can be represented as OrchestratorTask (or a thin wrapper); PaidAiJob already supports billing-related tracking. No schema change required for a minimal “run marketplace agent” flow.

### 3.4 API surface

- **Orchestrator:** `POST /api/orchestrator/run`, task creation, SAM3 task, SSE progress.
- **MI/Orchestra:** `POST /api/mi/orchestra/start`, `GET /api/mi/orchestra/job/:jobId` — store-build as a job.
- **Device agent:** `/api/devices/register`, heartbeat, playlists (REST + WebSocket).
- **Menu:** Menu-from-photo, configure-from-photo (optional Menu Visual Agent).
- **Channel:** `miToolsRoutes.js` already accepts `context.channel` = `'agent'` (web, mobile, kiosk, api, **agent**).

So: **invocation patterns** (run job, poll status, agent channel) and **task/job storage** already exist.

### 3.5 Auth and tenancy

- **Auth:** `requireAuth`, `optionalAuth`, `requireAdmin`; User, roles (owner, staff, viewer, admin, super_admin).
- **Tenancy:** Stores/businesses tied to User; Device to tenant/store; OrchestratorTask has `tenantId`, `userId`.

**Compatibility:** Marketplace agents can be gated by auth and scoped by tenant/user the same way.

### 3.6 Feature flags and extension

- Feature flags via `process.env` (e.g. `ENABLE_MENU_VISUAL_AGENT`).
- New features = new router + `app.use()` in `server.js`; new engine = new import + `registerTools()` in `initializeToolsRegistry()`.

**Compatibility:** Marketplace can be a new router (e.g. `/api/marketplace`) and optionally a new “engine” that registers marketplace-backed tools.

---

## 4. Gaps for a full agent marketplace

| Gap | Current state | Needed for marketplace |
|-----|----------------|-------------------------|
| **Catalog model** | No “agent” or “service” or “listing” table | Tables for listings (name, description, engineId, config schema, version, visibility, pricing hint). |
| **Install / enable** | Engines are global; no per-tenant “installed agents” | Model for “tenant X enabled agent Y” (and optionally version, config). |
| **Discovery API** | No API to list “available agents” or “installed agents” | GET /api/marketplace/agents, GET /api/marketplace/agents/installed (or under /api/tenant/...). |
| **Invocation** | Orchestrator runs with existing engines only | Orchestrator (or a thin “marketplace runner”) can resolve an agent by ID, load config, and run it (same tools registry pattern or adapter). |
| **Billing / usage** | PaidAiJob exists; no product/plan model for “agent” | Optional: link usage to a “product” or “plan” for marketplace agents. |
| **Dashboard UI** | No marketplace or “agents” section | Screen(s) to browse agents, enable/disable, configure, view usage. |
| **Lifecycle** | Tools are registered at startup from built-in engines | Marketplace agents: load definitions from DB (or config) and register dynamically, or run via a generic “run marketplace agent” tool that looks up and executes by ID. |

---

## 5. Upgrade path: minimal vs full

### 5.1 Minimal (compatible with current structure)

**Goal:** Expose existing engines as “service agents” and invoke them on demand, without a full marketplace UI or catalog DB.

- **No schema change.** Use existing OrchestratorTask + tools registry.
- **Add a thin “service agent” API layer:**
  - `GET /api/agents` — list available agents (map from `listTools()` + engine metadata, or a small static config file).
  - `POST /api/agents/:agentId/run` (or use existing `POST /api/orchestrator/run` with a reserved intent/agentId) — requireAuth, resolve agent → tool(s), run via existing orchestrator path, return task ID or result.
- **Optional:** One “marketplace” engine that reads a config (file or env) of “extra” agents and registers them as tools so orchestrator can call them.

This is **compatible with the current structure** and uses existing auth, tenancy, tools registry, and job model.

### 5.2 Full marketplace (requires additions)

**Goal:** Discoverable catalog, per-tenant install, billing hints, dashboard UI.

1. **Schema**
   - **ServiceAgent** (or **MarketplaceListing**): id, slug, name, description, engineId (or provider), configSchema, version, visibility, pricingHint, etc.
   - **InstalledAgent** (or **TenantAgent**): tenantId (or userId), agentId, enabled, config JSON, installedAt.

2. **Backend**
   - **Routes:** e.g. `/api/marketplace/agents` (list), `/api/marketplace/agents/:id` (detail), `POST /api/marketplace/agents/:id/install`, `DELETE .../uninstall`, `POST .../run` (invoke on demand).
   - **Tools registry:** Either register installed agents as tools at startup (from DB) or add a generic “run marketplace agent” tool that looks up InstalledAgent + ServiceAgent and executes (e.g. via existing engine adapter or a small runner).

3. **Orchestrator**
   - Planner can choose “run agent X” when the intent matches; resolution: by name or by marketplace agent ID.

4. **Dashboard**
   - New section (e.g. under Back Office or a “Marketplace” nav): list agents, install/uninstall, configure, “Run” button or link to flows that call the run API.

5. **Billing (optional)**
   - Use or extend PaidAiJob; add product/plan references for marketplace agents so usage can be metered and billed later.

---

## 6. Summary table

| Area | Current state | Compatible for minimal marketplace? | For full marketplace? |
|------|----------------|--------------------------------------|------------------------|
| Repo / apps / packages | Monorepo; core + dashboard | Yes | Yes |
| Orchestrator + tools registry | Skills/tools from engines | Yes — add agents as tools or via one “agent runner” tool | Yes — same + DB-driven catalog |
| Engines (loyalty, menu, promo, signage, device) | First-party “service agents” | Yes — expose as listable/runable agents | Yes — can be first-party catalog entries |
| Job/task model (OrchestratorTask, PaidAiJob) | Already used for on-demand runs | Yes | Yes |
| Auth / tenancy | User, roles, tenantId on tasks | Yes | Yes + InstalledAgent per tenant |
| API (orchestrator, MI, device, menu) | Run/poll/SSE patterns | Yes | Yes + marketplace routes |
| Data model | No agent/marketplace tables | No change needed | Add ServiceAgent + InstalledAgent (and optional billing) |
| Dashboard | No marketplace UI | Optional “Run agent” from existing flows | New marketplace/agents section |
| Feature flags / env | Per-feature env flags | Yes — e.g. ENABLE_AGENT_MARKETPLACE | Yes |

---

## 7. Conclusion

- **Current Cardbey structure is compatible** with adding an agent marketplace for service (service agents on demand). The orchestrator, tools registry, engines, job/task model, auth, and API patterns already support “run a service on demand” and can be extended without breaking existing flows.
- **Minimal upgrade:** No DB change; add a small “agents” API (list + run) that maps to existing tools/orchestrator; optional config-driven “extra” agents. Fully compatible with what’s built.
- **Full marketplace:** Add catalog and install models (ServiceAgent, InstalledAgent), marketplace routes, optional dynamic registration or generic “run agent” tool, dashboard UI, and optional billing linkage. This builds on the same extension points (tools registry, orchestrator, auth, tenancy).

For a phased rollout: implement the **minimal** path first (list + run existing engines as agents), then introduce **catalog + install + UI** when you need discovery and per-tenant enablement.

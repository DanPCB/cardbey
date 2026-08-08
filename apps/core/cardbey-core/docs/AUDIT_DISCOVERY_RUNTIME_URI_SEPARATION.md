# Audit + Plan — Shared Discovery Runtime vs Business / URI Pipelines

**Date:** 2026-08-08  
**Status:** Audit + implementation plan only — **no refactor until acknowledged**  
**Target architecture:**

```text
Shared Discovery Runtime
        ├── Business Discovery Pipeline   (existing Content Discovery Agent)
        └── URI Resource Discovery Pipeline  (new; Federation-owned adapters)
```

**Non-negotiables (from brief):**

1. Do **not** route reusable-media discovery through the pre-built-store / `UnclaimedStore` pipeline.
2. Do **not** create a second scheduler if the existing runtime can be safely extracted/reused.
3. Preserve **all** existing business discovery behaviour and data.
4. Provider adapters (Pexels / TikTok-media / Openverse / …) remain owned by **URI Federation**.
5. Shared Discovery Runtime schedules and executes work; it must **not** contain provider-specific business logic.

---

## 1. Executive verdict

The Content Discovery Agent under `src/lib/discovery/**` is a **single hardwired business-store crawl**:

`seeds → resolve URLs → scrapeAndNormalize → UnclaimedStore → optional DraftStore (pre_built)`

Ops controls around it (config, cron, enable/pause, daily limits, concurrency/delay, seed registry, batch history, admin Run Now) are **mostly generic**, but they are **not extracted**: the scheduler tick calls `runAllActive` which always runs the business pipeline.

**URI Global Resource Federation** today is a **separate, largely on-demand** stack (dashboard client + documented Core `/api/resource-intelligence/*` / federation APIs). It does **not** use `DiscoveryScheduler` / `DiscoveryBatchRun`. Media adapters (Pexels, Openverse, etc.) are request-time, not crawl-scheduled.

A third system — **Discovery Engine** (`DiscoveryEngineJob` → `BusinessSeed`) — is also business-oriented and must stay **out of scope** for this separation (do not merge three stacks in one cut).

---

## 2. Inventory — what exists today

### 2.1 Module map (Content Discovery Agent)

| Module | Path | Role |
|--------|------|------|
| Batch runner | `src/lib/discovery/DiscoveryBatchRunner.js` | `resolveUrlsFromSeed`, `processUrl`, `runWithConcurrency`, `runBatch`, `runAllActive`, `isDiscoveryLocked` |
| Scheduler | `src/lib/discovery/DiscoveryScheduler.js` | `node-cron` tick → `runAllActive('cron')`; enable/reload; `isDiscoveryRunning` |
| Config | `src/lib/discovery/DiscoveryConfigService.js` | Singleton `DiscoveryConfig`; `isRunnable` (enabled / paused / daily limit) |
| Unclaimed stores | `src/lib/discovery/UnclaimedStoreService.js` | Upsert, claim, expire, stats |
| Pre-built drafts | `src/lib/discovery/PreBuiltStoreService.js` | System `DraftStore` shells; transfer on claim |
| Claim helpers | `ClaimAuthorityBuilder.js`, `claimOtpStore.js` | Claim methods + OTP |
| Directory source | `sources/DirectoryCrawler.js` | Extract business URLs from directory HTML |
| Routes | `src/routes/discoveryRoutes.js` | Admin config/seeds/batches/run/stats + claim + marketplace search siblings |
| Boot | `src/lib/backgroundWorkers.js` | `initDiscoveryScheduler()` when not test / not worker-only |
| Admin UI | Dashboard `DiscoveryControlPanel.tsx`, `discoveryAdminApi.ts`, `/admin/discovery` | Operator control plane |
| Scrape deps | `lib/social-import/*` + platform adapters | Business profile scrape/normalize |

### 2.2 Related systems (do not confuse)

| System | Entry | Relation |
|--------|-------|----------|
| **businessDiscovery** | Same `discoveryRoutes.js`, `lib/businessDiscovery/**` | On-demand Places/website candidates — not the crawl agent |
| **discoverySearch** | Marketplace federation search | Published Cardbey entities |
| **Discovery Engine** | `/api/discovery-engine/*`, `DiscoveryEngineJob`, `BusinessSeed` | Separate governed providers (OSM/Places/CSV) |
| **Control Center rollback** | `/api/control-center/rollback/*` | Soft rollback for **candidates/seeds** — **not** `UnclaimedStore` / `DiscoveryBatchRun` |
| **URI / Federation** | Dashboard `lib/universalResourceIntelligence/*`; docs `UNIVERSAL_RESOURCE_INTELLIGENCE_*.md` | On-demand search/reuse; adapters must stay Federation-owned. Core URI mount may be incomplete in this checkout — treat as separate product plane |

---

## 3. Coupling classification

### 3.1 GENERIC operational infrastructure (extractable)

These concerns are pipeline-agnostic **if** the tick handler is injected rather than hardwired to `runAllActive`:

| Concern | Current home | Extractable as |
|---------|--------------|----------------|
| Cron schedule + live reload | `DiscoveryScheduler` | `SharedDiscoveryScheduler` |
| Enable / disable / pause | `DiscoveryConfig` + service | Shared runtime config (or per-pipeline config rows) |
| Batch size, concurrency, delay | `DiscoveryConfig` | Runtime execution policy |
| Max runs / day | `isRunnable` / `countRunsToday` | Runtime quota (scope carefully — see §6) |
| Source registry (active, priority, limit, errors) | `DiscoverySeedSource` | Generic **work sources** with `pipelineKind` |
| Manual Run Now + 202 accept | `POST /api/discovery/run` | Runtime “start job session” |
| Run history shell | `DiscoveryBatchRun` id/timestamps/status/trigger/errorLog/configSnapshot | Generic **job run** |
| Multi-instance lock | `isDiscoveryLocked` | Optional runtime lock |
| Admin status badges | ACTIVE / PAUSED / OFF, next run | Shared health API |
| Concurrency + inter-item delay loop | `runWithConcurrency` | Generic `executeWorkItems(items, policy, handler)` |

### 3.2 BUSINESS-COUPLED (must stay in Business Discovery Pipeline)

| Concern | Current home | Why coupled |
|---------|--------------|-------------|
| Seed types `tiktok_hashtag`, `directory_crawl`, `web_crawl`, `google_maps`, `url_list` (as **business profile URLs**) | `resolveUrlsFromSeed` | Resolves **store/profile candidates**, not media resources |
| TikTok tag HTML → `@` profile URLs (+ puppeteer fallback) | `DiscoveryBatchRunner` | Business acquisition, not URI media adapter |
| `scrapeAndNormalize` / social-import adapters | `processUrl` | Produces **store payload** |
| `UnclaimedStore` upsert + claim authority | `processUrl` | Business claim surface |
| `PreBuiltStoreService.buildPreBuiltStore` | `processUrl` | DraftStore `pre_built` — **forbidden for URI media** |
| Counters `discovered/scraped/created/skipped/failed/preBuilt` | `DiscoveryBatchRun` | Semantics = store crawl |
| Claim OTP routes | `discoveryRoutes.js` | Business claim UX |
| Admin seed platform list (TikTok/FB/IG/Google/Website) | `DiscoveryControlPanel` | Business sources UI |
| Tenant discovery reports | `appendDiscoveryReport` | Business crawl metrics |

### 3.3 Must NOT live in Shared Discovery Runtime

- Pexels / Openverse / Coverr / Pixabay / Mixkit / URI TikTok-media adapter logic  
- Rights evaluation, custody modes (`REFERENCE_ONLY`, `PULL_ON_USE`, …)  
- Resource indexing / graph / kit proposals  
- Any call to `UnclaimedStoreService` or `PreBuiltStoreService`  
- Social-import “normalize to store”

Those belong to **URI Federation + URI Resource Discovery Pipeline**.

### 3.4 Coupling diagram (today)

```text
┌─────────────────────────────────────────────────────────────┐
│ DiscoveryScheduler.onTick / POST /run                       │
│   └─► runAllActive  (ONLY business path)                    │
│         ├─ expireStale(UnclaimedStore)                      │
│         ├─ load DiscoverySeedSource                         │
│         └─ runBatch → resolveUrlsFromSeed (TikTok/…)        │
│               └─ processUrl → scrapeAndNormalize            │
│                     └─ UnclaimedStore → PreBuilt DraftStore │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ hardwired
URI Federation / media adapters ──✗── not connected
```

### 3.5 Target diagram

```text
┌──────────────────────── Shared Discovery Runtime ────────────────────────┐
│ Config · Scheduler · Source registry · Job session · Concurrency/delay   │
│ Quota · Health · Run history shell · Admin enable/pause/run               │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │                               │
                ▼                               ▼
┌───────────────────────────�─┬───────────────────────────────┬──────────────────────────┘
                │                               │
                ▼                               ▼
┌───────────────────────────┐     ┌─────────────────────────────────────────┐
│ Business Discovery        │     │ URI Resource Discovery Pipeline         │
│ Pipeline (unchanged       │     │ (new)                                   │
│ behaviour)                │     │                                         │
│ • business seed resolvers │     │ • asks Federation for work / adapters   │
│ • social-import scrape    │     │ • NEVER UnclaimedStore / PreBuilt       │
│ • UnclaimedStore          │     │ • outcomes §4                           │
│ • PreBuilt DraftStore     │     │                                         │
│ • counters as today       │     │ Provider adapters: URI Federation only  │
└───────────────────────────┘     └─────────────────────────────────────────┘
```

---

## 4. URI Resource Discovery — outcome model (required)

Pipeline-owned lifecycle (not store counters):

```text
DISCOVERED
  → NORMALIZED
  → RIGHTS_EVALUATED
  → INDEXED
  → terminal: REUSABLE | REFERENCE_ONLY | NEEDS_REVIEW | REJECTED
```

**Independently tracked (not overloaded onto `created` / `preBuilt`):**

| Metric | Meaning |
|--------|---------|
| `discovered` | Raw hits returned by Federation adapter search/crawl unit |
| `normalized` | Passed schema/normalize step |
| `rightsEvaluated` | Rights/custody evaluation completed |
| `indexed` | Written to URI index / candidate store |
| `reusable` | Terminal REUSABLE |
| `referenceOnly` | Terminal REFERENCE_ONLY |
| `needsReview` | Terminal NEEDS_REVIEW |
| `rejected` | Terminal REJECTED |
| `duplicates` | Deduped against existing URI/index identity |
| `failures` | Hard failures (adapter/timeout/parse) — separate from REJECTED |

Align custody vocabulary with existing URI docs (`REFERENCE_ONLY`, `PULL_ON_USE`, etc. in Phase 2). Terminal **REUSABLE** here means “eligible for governed reuse flows,” not auto-publish.

---

## 5. Database models — current vs proposed

### 5.1 Current Content Discovery Agent tables (preserve)

| Model | Generic vs business | Preserve? |
|-------|---------------------|-----------|
| `DiscoveryConfig` | Mostly generic ops | Yes — keep rows; extend carefully |
| `DiscoverySeedSource` | Mixed (`type`/`platform`/`value` business-shaped) | Yes — existing rows must keep working |
| `DiscoveryBatchRun` | Mixed counters | Yes — **do not rename/repurpose counters** |
| `UnclaimedStore` | Business-only | Yes — untouched by URI pipeline |
| `DraftStore` (`pre_built`, `unclaimedStoreId`) | Business-only | Yes |

### 5.2 Proposed additive models (recommended — lowest migration risk)

Prefer **additive tables** over mutating business counter semantics.

#### A. Shared runtime (thin)

| Model (proposed) | Purpose |
|------------------|---------|
| `DiscoveryRuntimeConfig` **or** extend `DiscoveryConfig` with `pipelineKind` scopes | Either: (1) keep singleton config for **business** only + new `UriDiscoveryConfig`, or (2) one config table with `pipelineKind` unique. **Recommendation:** keep `DiscoveryConfig` as **business** singleton; add `UriDiscoveryRuntimeConfig` (or reuse shared scheduler with **per-pipeline** cron/enabled/limits). |
| `DiscoveryWorkSource` | Optional generalization later. **v1 recommendation:** keep `DiscoverySeedSource` for business; add `UriDiscoverySource` for URI feeds/queries so VALID_SEED_TYPES and admin UI do not collide. |
| `DiscoveryJobRun` | Optional shared shell. **v1 recommendation:** keep `DiscoveryBatchRun` for business; add `UriDiscoveryJobRun` with URI outcome columns. Shared runtime code operates on a **JobRunPort** interface implemented by both. |

Rationale: staging already has business history (Failed/Completed rows with `preBuilt`). Repurposing those columns for URI outcomes would corrupt operator meaning and reports.

#### B. URI pipeline tables (new)

| Model (proposed) | Key fields |
|------------------|------------|
| `UriDiscoverySource` | `id`, `providerKey` (opaque string — adapter chosen by Federation), `queryJson`, `isActive`, `priority`, `batchLimit`, `lastRunAt`, `runCount`, `lastError`, `errorCount` — **no** scrape-to-store fields |
| `UriDiscoveryJobRun` | `id`, `startedAt`, `completedAt`, `status`, `sourceId`, `triggeredBy`, `configSnapshot`, `errorLog`, plus outcome ints: `discovered`, `normalized`, `rightsEvaluated`, `indexed`, `reusable`, `referenceOnly`, `needsReview`, `rejected`, `duplicates`, `failures` |
| `UriDiscoveryItem` (optional but useful) | Per-item lifecycle state enum matching §4; `externalId`, `dedupeKey`, `rightsJson`, `terminalStatus`, `jobRunId` |

Federation may already persist `ResourceCandidateSnapshot` / index rows — URI pipeline should **write through Federation APIs**, not duplicate a second media catalogue in the Discovery Agent.

### 5.3 What not to do

- Do **not** add URI sources into `DiscoverySeedSource` with type `pexels_query` while `processUrl` still calls `UnclaimedStore` (leak risk).
- Do **not** reuse `preBuilt` column for “indexed media.”
- Do **not** drop or rename business columns in v1.

---

## 6. Job ownership (current → target)

### 6.1 Current ownership

| Action | Owner today |
|--------|-------------|
| Create `DiscoveryBatchRun` | `DiscoveryBatchRunner.runBatch` only |
| Cron tick | `DiscoveryScheduler.onTick` → `runAllActive('cron')` |
| Manual run | `POST /api/discovery/run` → `setImmediate(runAllActive('manual', userId))` |
| Expire unclaimed | `runAllActive` → `UnclaimedStoreService.expireStale(30)` **before** seeds |
| Report append | Scheduler / manual `.then(appendDiscoveryReport)` |

**Known quirks (document, fix only in a later ops slice if needed):**

- Manual `setImmediate` does not set `isDiscoveryRunning` (cron in-process flag).
- API `runId` cuid ≠ `DiscoveryBatchRun.id`.
- Admin `VALID_SEED_TYPES` omits `web_crawl` / `directory_crawl` / platform `website` while runner/UI support them.

### 6.2 Target ownership

| Layer | Owns |
|-------|------|
| **Shared Discovery Runtime** | Schedule tick, pause/enable, concurrency/delay execution, job session start/finish, source iteration order, global per-pipeline locks, health |
| **Business Discovery Pipeline** | Selecting business sources, URL resolution, scrape, UnclaimedStore, PreBuilt, business counters, `expireStale`, discovery reports |
| **URI Resource Discovery Pipeline** | Selecting URI sources, calling **Federation** to execute adapter work, mapping results into §4 outcomes, URI job metrics, URI-specific rollback hooks |
| **URI Federation** | Provider adapters, rights engine, index writes, dedupe identity, custody policy |

Scheduler change (conceptual):

```text
onTick(pipelineKind):
  if !runtime.isRunnable(pipelineKind): return
  pipeline = registry.get(pipelineKind)
  await runtime.executeSession(pipeline, trigger)
```

v1 registration: **only** `business_store` registered → behaviour identical to today.  
v2: register `uri_resource` without touching business path.

---

## 7. Rollback path

### 7.1 Business (today)

| Mechanism | Scope |
|-----------|--------|
| `expireStale` | Marks old `unclaimed` → `expired` |
| Seed deactivate / delete | Stops future runs; does not undo stores |
| Claim reject | Claim flow only |
| Control Center rollback | **Does not** reverse `UnclaimedStore` / `DiscoveryBatchRun` / pre-builts |

**Gap:** No “rollback batch X” for agent-created unclaimed/pre-built rows. Accept for v1 preservation; optional later `BusinessDiscoveryRollback` keyed by `discoveryBatch` / batch run id (soft-hide), **separate** from URI.

### 7.2 URI (required for safe federation crawl)

| Mechanism | Requirement |
|-----------|-------------|
| Job-level soft rollback | Mark `UriDiscoveryJobRun` rolled_back; tombstone or hide items from that run in URI index via Federation API |
| Item-level reject | Terminal `REJECTED` / operator NEEDS_REVIEW without deleting provider originals |
| Never call | `UnclaimedStore` delete, `DraftStore` pre_built delete, business claim APIs |

Rollback ownership: **URI pipeline + Federation**, not Shared Runtime (runtime only marks job status).

---

## 8. Separation plan — phased implementation (after approval)

### Phase 0 — Freeze + contracts (this document)

- [x] Classify generic vs business coupling  
- [x] Declare URI outcomes + non-routing through pre-built  
- [x] User acknowledgment before code moves (Phase 1 authorized 2026-08-08)

**Exit:** Written contracts for `DiscoveryPipeline` interface + JobRunPort + no-provider-logic rule.

### Phase 1 — Extract Shared Runtime **behind** business (behaviour-preserving) — DONE 2026-08-08

**Goal:** Move code boundaries only; staging business crawl metrics unchanged.

1. [x] Introduce `SharedDiscoveryRuntime` with:
   - scheduler tick that calls `pipeline.runAllActive('cron')` via `runScheduledSession`
   - `executeWithConcurrency(items, {concurrency, delayMs}, worker)`
   - isRunnable / in-process running / lock injected (config stays `DiscoveryConfigService`)
2. [x] `BusinessDiscoveryPipeline` wraps `runAllActive` + `isDiscoveryLocked` (provider/scrape/Unclaimed/PreBuilt remain in `DiscoveryBatchRunner` + services)
3. [x] Keep Prisma models and API paths (`/api/discovery/*`) unchanged.
4. [x] Keep admin UI unchanged.
5. [x] Boundary tests under `runtime/__tests__` (runtime must not import business internals).

**Layout:** `src/lib/discovery/runtime/**` + `src/lib/discovery/pipelines/business/**`  
**Impact:** `docs/IMPACT_REPORT_DISCOVERY_RUNTIME_PHASE1.md`  
**Stop before Phase 2:** no `UriDiscovery*` tables or URI pipeline code.

**Migration risk:** Low (mostly file moves + indirection).  
**Rollback:** Revert PR; tables untouched.

### Phase 2 — Per-pipeline runtime config + dual registration (still business-only default)

1. Add `UriDiscoveryRuntimeConfig` (enabled default **false**) + optional separate cron.  
2. Shared scheduler supports **two tasks** (or one tick that fans out to enabled pipelines). Prefer **one scheduler module, two cron tasks** over a second process.  
3. Quotas: **separate** `maxRunsPerDay` per pipeline so URI load cannot starve business (or vice versa).  
4. Business remains sole enabled pipeline until Phase 3.

**Migration risk:** Low–medium (new config row).  
**Rollback:** Disable URI config; remove cron task registration.

### Phase 3 — URI Resource Discovery Pipeline (no media → store)

1. Add `UriDiscoverySource` + `UriDiscoveryJobRun` (+ optional items).  
2. Pipeline handler:
   - Load active URI sources  
   - For each source, call **Federation** port: `federation.discover(source)` / ops-intake (exact API per URI Phase 5 docs)  
   - Map adapter results → §4 states  
   - Persist metrics; **never** import social-import store normalize  
3. Admin: either new `/admin/uri-discovery` or tab on Discovery page filtered by pipeline — **do not** overload business Seed Sources table in v1.  
4. Boundary assert: CI check that URI pipeline module does not import `UnclaimedStoreService` / `PreBuiltStoreService` / `SocialImportService`.

**Migration risk:** Medium (new tables + Federation contract).  
**Rollback:** Disable URI config; leave tables; business path untouched.

### Phase 4 — Optional convergence (only if proven)

- Unify source tables behind `DiscoveryWorkSource` with `pipelineKind`  
- Unify job shell table with JSON `outcomeJson` discriminated by pipeline  
- Migrate admin to one control plane with pipeline switcher  

**Do not start Phase 4 until Phase 1–3 are stable on staging.**

---

## 9. Interface sketch (contracts only — not implemented)

```ts
// Conceptual — Shared Runtime
type PipelineKind = 'business_store' | 'uri_resource';

interface DiscoveryPipeline {
  kind: PipelineKind;
  listActiveSources(): Promise<WorkSource[]>;
  /** Resolve work units (URLs, queries, …) — pipeline-specific */
  expandSource(source: WorkSource, limit: number): Promise<WorkUnit[]>;
  /** Process one unit — business: scrape→store; URI: federation→outcomes */
  processUnit(unit: WorkUnit, job: JobRunHandle): Promise<void>;
  onSessionStart?(job: JobRunHandle): Promise<void>; // e.g. expireStale for business only
  onSessionEnd?(job: JobRunHandle, summary: unknown): Promise<void>;
}

interface FederationDiscoverPort {
  // Implemented inside URI Federation package — adapters stay there
  discover(input: { providerKey: string; query: unknown; limit: number }): Promise<FederationDiscoverResult>;
}
```

Shared Runtime may call `pipeline.processUnit` only. It must not switch on `providerKey === 'pexels'`.

---

## 10. Migration risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scheduler extraction breaks cron on Render | No business runs | Phase 1 feature-flag / identical `initDiscoveryScheduler` export; smoke Run Now + wait for cron |
| Shared quota across pipelines | URI burns daily limit | Per-pipeline `maxRunsPerDay` (Phase 2) |
| URI work accidentally hits `processUrl` | Fake/wrong unclaimed stores | Separate pipeline module + import boundary CI; no shared `processUrl` |
| Repurposing `DiscoveryBatchRun` counters | Corrupt ops history / reports | Additive URI tables (recommended) |
| Admin seed validation gap (`web_crawl`) | Operator confusion | Fix in business pipeline slice only; out of band from URI |
| Discovery Engine confusion | Double business ingestion | Explicit out-of-scope; no merge |
| Missing Core URI service in checkout | Phase 3 blocked | Phase 3 depends on Federation port existing; do not invent adapters inside Runtime |
| Multi-instance lock only on business batches | Overlap | Per-pipeline lock keys / status queries |
| Manual run `isRunning` gap | Overlapping manuals | Optional Phase 1 hardening; not required for separation |

---

## 11. Explicit out-of-scope (v1 separation)

- Redesigning Universal Library UI  
- Merging Discovery Engine (`BusinessSeed`) into Shared Runtime  
- Implementing Pexels/Openverse adapters inside `src/lib/discovery`  
- Auto-publish or auto-claim of businesses  
- Changing claim OTP / marketplace discoverySearch  
- Destroying or backfilling historical `DiscoveryBatchRun` rows  

---

## 12. Success criteria

| Criterion | Proof |
|-----------|--------|
| Business behaviour preserved | Staging: existing seeds + Run Now produce same counter meanings; pre-built path unchanged |
| No second scheduler process | Single `initDiscoveryScheduler` (or renamed) owns cron registration for all pipelines |
| URI not in pre-built path | Boundary test: URI pipeline bundle has zero imports of Unclaimed/PreBuilt/SocialImport store path |
| Runtime has no provider switch | Grep/CI: no `pexels`/`openverse` in Shared Runtime package |
| URI outcomes complete | Job run can show §4 terminals + independent duplicates/failures |
| Rollback safe | URI job rollback does not mutate `UnclaimedStore` |

---

## 13. Recommended decision checklist (acknowledge before code)

1. **Additive URI tables** (`UriDiscovery*`) rather than overloading `DiscoveryBatchRun` — **approve?**  
2. **Keep `DiscoveryConfig` as business singleton**; add URI config row — **approve?**  
3. **Phase 1 extract-only** (no URI behaviour) as first PR — **approve?**  
4. **Separate admin surface** for URI sources in Phase 3 — **approve?**  
5. Confirm Federation port API name/shape for crawl/ops-intake (from URI Phase 5) before Phase 3 coding.

---

## 14. No-parallel-stack proof (plan intent)

- Does **not** introduce a fourth discovery product.  
- Reuses the **existing** Content Discovery Agent scheduler/config/concurrency patterns as Shared Runtime.  
- Leaves Discovery Engine and on-demand businessDiscovery as they are.  
- URI media continues to own adapters under Federation; Runtime only schedules pipeline sessions.

---

## Appendix A — File touch list (future PRs, not now)

**Phase 1 (extract):**  
`DiscoveryScheduler.js`, `DiscoveryBatchRunner.js` (split), `DiscoveryConfigService.js`, `backgroundWorkers.js`, new `runtime/` + `pipelines/business/` folders, tests for identical `runAllActive` behaviour.

**Phase 2:** URI config model + migration (postgres/sqlite), scheduler dual registration.

**Phase 3:** `pipelines/uri/`, Federation port adapter, URI admin API/UI, boundary assert script.

**Dashboard:** Phase 3 only for URI admin; business `DiscoveryControlPanel` stays until optional Phase 4.

---

*End of audit + plan. No code refactor performed.*

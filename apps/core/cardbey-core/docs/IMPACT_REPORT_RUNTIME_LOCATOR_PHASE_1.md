# Impact Report — Runtime Locator Phase 1

**Date:** 2026-07-19  
**Status:** Phase 1 locator implemented (module + tests + `.env.example`); no writer cutover  
**Parent plan:** [`RUNTIME_BOUNDARY_PLAN.md`](./RUNTIME_BOUNDARY_PLAN.md)  
**Implementation:** `src/lib/runtimeBoundary/runtimeLocator.ts`  
**Scope:** Establish ownership, path contract, compatibility behavior, security constraints, migration inventory, and test strategy for `CARDBEY_RUNTIME_ROOT`.  
**Non-scope:** Moving files on disk, `git rm --cached`, changing writers to new locations, broad repository rewrite.

---

## Intent

Phase 1 introduces one central path abstraction so later migrations have a stable foundation:

```ts
type RuntimeArea =
  | "uploads"
  | "logs"
  | "diagnostics"
  | "development"
  | "missions"
  | "evidence"
  | "generatedArtifacts"
  | "cache"
  | "businessIngestionRuns";

resolveRuntimePath(area: RuntimeArea, ...segments: string[]): string
```

Precedence (write destination and preferred read root):

1. Area-specific override env  
2. `CARDBEY_RUNTIME_ROOT`  
3. Platform-safe default  

Legacy repo-relative paths remain **readable** via a temporary compat shim. Phase 1 does **not** relocate data.

`.gitignore` remains a safety net only; this locator is the architecture.

---

## 1. Which modules currently write runtime state?

Inventory of primary writers (not exhaustive of every `path.join`, but covering durable side effects). Paths relative to core package / cwd as used today.

### uploads

| Module | Today’s path |
|--------|----------------|
| `src/server.js` | `cwd/uploads` (+ `media/`, `optimized/`) |
| `src/lib/storage/localStorageAdapter.js` | uploads root |
| `src/routes/import.js` | uploads dir |
| `src/lib/vision/saveVisionUploads.js` | `UPLOADS_DIR` or `cwd/uploads/media` |
| `src/lib/video/*` (download, concat, burn, mux, probe) | `UPLOADS_DIR` |
| `src/lib/factoryRuntime/creativeFactoryV4*.js` | `UPLOADS_DIR` |

### diagnostics / audit / activity

| Module | Today’s path |
|--------|----------------|
| `src/lib/platformActivity/platformActivityStore.js` | `data/platformActivity` (`PLATFORM_ACTIVITY_JSONL_DIR`) |
| `src/lib/runtimeDiagnostics/diagnosticStore.js` | `src/.cache/runtime-diagnostics` (`RUNTIME_DIAGNOSTICS_JSONL_DIR`) |
| `src/selfAudit/fixHistory.ts` | `cwd/self-audit-reports` |
| `src/lib/intake/maintenanceTools.js` | `patches.audit.json` (package root) |
| `src/lib/truthEnforcerMetrics.js` | repo `.cardbey/` (already ignored) |

### development / evidence / generated

| Module | Today’s path |
|--------|----------------|
| `src/development/store/developmentStore.ts` | `cwd/.development-runtime` |
| `src/development/services/evidenceService.ts` | `cwd/.development-runtime/evidence-files` |
| `src/development/services/checkRunner.ts` (+ workspace services) | `.development-workspaces/**/check-artifacts`, diffs |
| `src/development/repositories/cardbeyRepositoryManifest.ts` | `CARDBEY_REPO_ROOT` → workspaces (checkout tooling, not Runtime Root data) |

### missions / domain file stores

| Module | Today’s path |
|--------|----------------|
| `src/lib/performer/performerRequestEnvelope.js` | `data/performerRequests` |
| `src/lib/businessIngestion/*` repositories/stores | `BUSINESS_INGESTION_DIR` or `data/businessIngestion` |
| `src/lib/businessCandidate/*` | `BUSINESS_CANDIDATE_DIR` or `data/businessCandidates` |
| Discovery / vision disk repos | under `data/discoveryEngine`, `data/visionDiscovery` |
| `src/lib/recommendations/recommendationEvidenceStore.js` | `data/recommendationEvidence` |
| `src/lib/runtime/failureEvidence/snapshotStore.js` | `data/consolidatedFailureSnapshots` |

### cache

| Module | Today’s path |
|--------|----------------|
| `src/services/explore/exploreVideoService.js` | `src/.cache/exploreVideos.json` |
| `src/screens/store.js` | `src/.cache` |
| `src/lib/intake/i18nMaintenanceTools.js` | `data/language-runtime` |
| `src/lib/tempFiles.js` | `os.tmpdir()` (already outside repo — keep) |

### logs

| Writer | Today’s path |
|--------|----------------|
| pm2 / `ecosystem.config.js` | `logs/` |
| Tracked JSONL leftovers (`cognitive-parity`, `kernel-decision-records`) | `logs/` — no strong live writer found; treat as diagnostics legacy |

---

## 2. Which paths do they write to today?

| Area (proposed) | Canonical today’s locations |
|-----------------|-----------------------------|
| `uploads` | `apps/core/cardbey-core/uploads/**` |
| `logs` | `apps/core/cardbey-core/logs/**` |
| `diagnostics` | `data/platformActivity/**`, `src/.cache/runtime-diagnostics/**`, `self-audit-reports/**`, `patches.audit.json`, optional `.cardbey/` |
| `development` | `.development-runtime/store.json` (and siblings) |
| `missions` | `data/performerRequests/**` |
| `evidence` | `.development-runtime/evidence-files/**`, `data/recommendationEvidence/**`, `data/consolidatedFailureSnapshots/**` |
| `generatedArtifacts` | `.development-workspaces/check-artifacts/**`, `diffs/**`, package/`dist` (build — out of locator write path for app runtime) |
| `cache` | `src/.cache/**`, `.cache/**`, `data/language-runtime/**`, OS temp |
| `businessIngestionRuns` | `data/businessIngestion/**` (mixed — see §3) |

---

## 3. Which paths contain mixed authored and generated data?

| Path | Authored (keep in Git) | Generated (Runtime Root) |
|------|------------------------|---------------------------|
| `data/businessIngestion/` | Curated fixtures / golden suites | Run dumps, claim/QA append logs, suitcase state when file-backed |
| `data/discoveryEngine/` | Fixtures | Live `jobs.json` / run state |
| `data/visionDiscovery/` | Any committed seeds | Event/repo JSON growth |
| `data/businessCandidates/` | Rare fixtures if any | Live candidate trees |
| `docs/` + `core/docs/` | Intentional contracts & phase docs | Mission-generated impact dumps (policy: review before commit — not locator writes) |
| `data/starter-packs/`, `price-ladders/`, `templates/`, `language-seed/` | **Shipped configuration** — not Runtime Area | — |

Phase 1 locator **names** `businessIngestionRuns` so later splits do not invent a second root. Fixtures stay outside that area.

---

## 4. Which deployment environments need overrides?

| Environment | Needs | Suggested knobs |
|-------------|-------|-----------------|
| **Local desktop** | Durable Runtime Root outside Git tree | `CARDBEY_RUNTIME_ROOT=~/.cardbey/runtime` (or repo-adjacent default) |
| **CI** | Ephemeral, job-scoped; never commit | `CARDBEY_RUNTIME_ROOT=$RUNNER_TEMP/cardbey-runtime` (or test tmp) |
| **Staging** | Shared persistent disk or object store for uploads | `CARDBEY_RUNTIME_ROOT` + `UPLOADS_DIR` / R2 as today |
| **Production (Render etc.)** | Persistent disk aligned with DB policy | `CARDBEY_RUNTIME_ROOT` ↔ `PERSISTENT_DISK_PATH` family; `UPLOADS_DIR` / R2; DB via `DATABASE_URL` |
| **Dev worktrees** | Isolation per workspace without polluting parent index | Area overrides or Runtime Root under workspace; **checkouts** still via `CARDBEY_REPO_ROOT` |

Area-specific envs already partially exist and must remain highest precedence:

| Area | Existing override (keep) |
|------|--------------------------|
| uploads | `UPLOADS_DIR` |
| diagnostics (activity) | `PLATFORM_ACTIVITY_JSONL_DIR` |
| diagnostics (runtime) | `RUNTIME_DIAGNOSTICS_JSONL_DIR` |
| business ingestion | `BUSINESS_INGESTION_DIR` |
| business candidates | `BUSINESS_CANDIDATE_DIR` |

Phase 1 maps these through the locator rather than deleting them.

---

## 5. Which readers require temporary legacy compatibility?

Any reader that opens today’s on-disk path must continue to find data until a later move phase.

| Consumer class | Examples | Compat requirement |
|----------------|----------|-------------------|
| Static / HTTP media | `server.js` `/uploads/*` | Resolve uploads root: new → legacy |
| Platform activity SSE / admin | `platformActivityStore.js` | Read JSONL from override → Runtime Root → legacy `data/platformActivity` |
| Diagnostics admin routes | `runtimeDiagnosticsRoutes.js` / store | Same for diagnostics JSONL |
| Development UI / missions | `developmentStore.ts`, evidenceService | Read `.development-runtime` until moved |
| Self-audit / maintenance | `fixHistory.ts`, `maintenanceTools.js` | Read legacy audit paths |
| Ingestion / candidate / discovery | repositories above | Keep file backends working when DB off |
| Tests | Many set `BUSINESS_INGESTION_DIR` / tmp dirs | Prefer explicit overrides; defaults must not break suite cwd assumptions |

**Compat policy (Phase 1):**

- `resolveRuntimePath` returns the **preferred write path** under the precedence chain.  
- `resolveRuntimePath(..., { readFallback: true })` or a sibling `resolveRuntimeReadPath` searches preferred then legacy locations for **exists**.  
- Phase 1 may **create** preferred dirs when writers are optionally opted in later; default Phase 1 behavior is **locator available + tests**, writers still using legacy until Phase “Move writers”.

Recommended Phase 1 delivery: ship locator + unit tests + docs; **zero writer cutover** unless a single pilot writer is explicitly approved in a follow-up slice.

---

## 6. What must remain unchanged during Phase 1?

| Must not change | Why |
|-----------------|-----|
| On-disk locations of existing runtime data | Avoid breaking local/prod mounts mid-WIP |
| Writer call sites (except optional unused import of locator) | No broad rewrite |
| Git index / `git rm --cached` | Separate hygiene phase after locator exists |
| `CARDBEY_REPO_ROOT` / worktree creation semantics | Checkout tooling ≠ Runtime Root |
| Prisma / `DATABASE_URL` / auth / publish paths | Out of scope |
| Dashboard submodule layout | Separate repo |
| Safe Execution / AutonomyPolicy gates | Orthogonal; filesystem class only |
| Authored `data/starter-packs` etc. | Source/configuration |

---

## Proposed locator contract

### Ownership

| Concern | Owner module (proposed) |
|---------|-------------------------|
| Path resolution | `src/lib/runtimeBoundary/runtimeLocator.ts` (or `.js`) — **single** module |
| Area → relative suffix map | Same module (constant table) |
| Legacy path map | Same module (compat table) |
| Env precedence | Same module |
| Callers | None required in Phase 1; later slices only |

**No-parallel-stack proof:** There is exactly one Runtime Locator. Domain stores must not invent a second “runtime root.” Env overrides remain area knobs routed *through* the locator.

### API (contract)

```ts
type RuntimeArea =
  | "uploads"
  | "logs"
  | "diagnostics"
  | "development"
  | "missions"
  | "evidence"
  | "generatedArtifacts"
  | "cache"
  | "businessIngestionRuns";

/** Internal metadata (Phase 1 — design for backup/retention; not required at call sites). */
interface RuntimeAreaDefinition {
  suffix: string;
  writable: boolean;
  persistent: boolean;
  backupPolicy: "none" | "runtime" | "business";
  legacyRoot?: string;
  areaEnv?: string;
}

type ResolveOptions = {
  purpose?: "write" | "read";
  legacyFallback?: boolean;
  segments?: string[];
};

/** Never creates directories. */
function resolveRuntimePath(area: RuntimeArea, ...parts: Array<string | ResolveOptions>): string;

/** Opt-in directory creation. */
function ensureRuntimeDirectory(area: RuntimeArea, ...segments: string[]): string;

function getRuntimeRoot(): string;
function getLegacyAreaRoot(area: RuntimeArea): string;
function getRuntimeAreaDefinition(area: RuntimeArea): RuntimeAreaDefinition;
```

**Accepted refinements (pre-implementation):**

1. **Area metadata table** — each area carries `suffix`, `writable`, `persistent`, `backupPolicy`, optional `legacyRoot` / `areaEnv` so later backup/cleanup/retention attach to the area, not scattered call sites.  
2. **Path creation is opt-in** — `resolveRuntimePath` is side-effect free; callers that need materialization use `ensureRuntimeDirectory(area, ...)`.

### Precedence

```
area-specific env (if defined for area)
  → CARDBEY_RUNTIME_ROOT / <area-suffix> / ...segments
  → platform-safe default / <area-suffix> / ...segments
```

**Platform-safe default (proposal for Phase 1 docs + implementation):**

| Platform | Default root |
|----------|--------------|
| Local / unknown | `path.join(os.homedir(), '.cardbey', 'runtime')` |
| When `PERSISTENT_DISK_PATH` set | `path.join(PERSISTENT_DISK_PATH, 'cardbey-runtime')` |
| When `NODE_ENV=test` and no override | `path.join(os.tmpdir(), 'cardbey-runtime-test', <workerId?>)` |

Legacy roots remain available only via read fallback / `getLegacyAreaRoot`.

### Area suffix table (under Runtime Root)

| Area | Suffix |
|------|--------|
| uploads | `uploads` |
| logs | `logs` |
| diagnostics | `diagnostics` |
| development | `development` |
| missions | `missions` |
| evidence | `evidence` |
| generatedArtifacts | `generated` |
| cache | `cache` |
| businessIngestionRuns | `domain/business-ingestion/runs` |

### Area-specific env map

| Area | Env |
|------|-----|
| uploads | `UPLOADS_DIR` |
| diagnostics (activity subpath later) | `PLATFORM_ACTIVITY_JSONL_DIR` — Phase 1: if set, `resolveRuntimePath('diagnostics', 'platform-activity')` returns this dir when resolving that sub-area **or** document that JSONL_DIR overrides the full diagnostics leaf used by that store |
| diagnostics (runtime JSONL) | `RUNTIME_DIAGNOSTICS_JSONL_DIR` |
| businessIngestionRuns | `BUSINESS_INGESTION_DIR` |

Note: existing JSONL_DIR vars already point at **leaf** directories. Phase 1 contract must preserve leaf semantics (override returns that path directly when the resolve target is that leaf), not invent a double-nested surprise.

### Security constraints

| Constraint | Rule |
|------------|------|
| **S1 Path escape** | Reject `segments` containing `..` or absolute fragments; only append sanitized relative segments |
| **S2 Symlink caution** | Do not follow untrusted symlinks into source tree for writes (document; harden in move phases) |
| **S3 Production fail-closed (later)** | Optional: if prod and no `CARDBEY_RUNTIME_ROOT` / persistent disk, refuse writes to repo-relative legacy for selected areas — **not enabled in Phase 1** |
| **S4 Secrets** | Locator never logs full env secrets; paths only |
| **S5 Source tree** | Locator never returns a path under `src/` as a *preferred* write root |

### Compatibility behavior

| Mode | Behavior |
|------|----------|
| Write resolve | Precedence chain → preferred path (may not exist yet) |
| Read resolve | Preferred if exists, else legacy if exists, else preferred (caller creates) |
| Phase 1 default integration | Locators exported + tested; writers unchanged |

---

## What could break (if Phase 1 is implemented carelessly)

| Risk | Why | Mitigation |
|------|-----|------------|
| Tests unexpectedly write under `~/.cardbey` | Default root changes before writers cut over | Phase 1: no writer cutover; test default = `os.tmpdir()` when `NODE_ENV=test` |
| Double roots confuse operators | Locator default ≠ historical cwd paths | Docs + `.env.example` comments; legacy still works |
| Accidental broad import rewrite | “While we’re here” | Strict Phase 1 PR: locator module + tests + docs only |
| Security hole via `..` segments | Path join abuse | Reject traversal in API |
| Competing “runtime root” modules | Parallel stack | Single module; PR checklist |

---

## Smallest safe Phase 1 patch

1. Add `src/lib/runtimeBoundary/runtimeLocator.ts` with area metadata table + `resolveRuntimePath` / `ensureRuntimeDirectory`.  
2. Unit tests: precedence, legacy read fallback, traversal rejection, test-env default, no mkdir on resolve.  
3. Document in `.env.example`: `CARDBEY_RUNTIME_ROOT` (commented, not required).  
4. Cross-link from `RUNTIME_BOUNDARY_PLAN.md`.  
5. **Do not** change uploads/server/development writers in the same PR.

---

## Test strategy

| Case | Expect |
|------|--------|
| No env set, `NODE_ENV=test` | Root under `os.tmpdir()` |
| `CARDBEY_RUNTIME_ROOT=/r` | `resolveRuntimePath('uploads')` → `/r/uploads` |
| `UPLOADS_DIR=/u` wins over root | → `/u` |
| `resolve(..., { purpose:'read' })` with only legacy present | Returns legacy path |
| Segment `..` / absolute | Throws / returns error result (choose one; tests lock it) |
| `getLegacyAreaRoot('development')` | Resolves to today’s `.development-runtime` under cwd/core package rule as documented |

No integration test that relocates production data in Phase 1.

---

## Migration inventory (for later phases; frozen here)

| Later phase | Locator areas involved |
|-------------|------------------------|
| Ignore / index hygiene | (gitignore only; locator already defines names) |
| Move writers | uploads, diagnostics, development, evidence, cache, logs |
| Split mixed data | `businessIngestionRuns` vs fixtures |
| Worktree hygiene | `generatedArtifacts`; keep `CARDBEY_REPO_ROOT` for checkouts |
| CI / deploy / backup | defaults + `CARDBEY_RUNTIME_ROOT` on persistent disk |

---

## Rollback

1. Delete or flag-off unused locator module (nothing depends on it in Phase 1).  
2. Remove env docs comments.  
3. No data migration to reverse.

---

## Success criteria (Phase 1)

- [x] Single owner module with the contract above  
- [x] Unit tests green for precedence, legacy read, security, no mkdir on resolve  
- [x] Zero required writer migrations  
- [x] Zero `git rm --cached` / disk moves  
- [x] Clear no-parallel-stack statement in PR / module header  
- [x] Area metadata table (`writable` / `persistent` / `backupPolicy`)  
- [x] `ensureRuntimeDirectory` opt-in creation  
- [x] `.env.example` documents optional `CARDBEY_RUNTIME_ROOT`

---

## Recommended approval gate

Proceed to **locator implementation** only after this impact report is accepted.  
Do **not** combine implementation with Git hygiene or writer moves in the same change set.

# Cardbey Runtime Boundary Plan

**Status:** Draft plan (no migration executed)  
**Date:** 2026-07-19  
**Trigger:** Repository health audit (~1,210 Git changes; VS Code Git degradation)  
**Related:** Git repository health audit (conversation, 2026-07-19)

---

## 1. Purpose

Cardbey is evolving into a platform with AI agents, Performer, missions, diagnostics, development orchestration, audit evidence, generated artifacts, and uploaded media.

Those are **runtime products**, not source code.

Today’s Git noise is a symptom. The deeper problem is that runtime state lives inside the repository tree and is only partially restrained by `.gitignore`. As Cardbey grows, this must become a **deliberate architectural boundary**, not a growing pile of ignore rules.

This plan:

1. Inventories directories that are (or behave like) runtime-generated state.
2. Classifies each into a clear concern.
3. Defines the target layout and ownership rules.
4. Produces a staged migration plan that protects ongoing development and improves CI/CD, backups, and deploys.

**Out of scope for this document:** executing `git rm --cached`, moving files on disk, or changing writers. Those happen only after this plan is accepted and sliced.

---

## 2. Target boundary

```
Repository (version-controlled)
│
├── Source Code
├── Tests
├── Schemas
├── Documentation          # intentional product/engineering docs
└── Configuration          # env examples, deploy manifests, seed data meant to ship

        ↓  produces / operates on  ↓

Runtime (NOT version-controlled; durable or ephemeral by class)
│
├── uploads                # user/business media
├── logs                   # process & decision logs
├── diagnostics            # self-audit, runtime diagnostics, activity streams
├── development-runtime    # mission store, orchestration state
├── missions               # performer / mission local envelopes (if file-backed)
├── evidence               # development evidence, failure snapshots, recommendation evidence
├── generated-artifacts    # build output, i18n gaps, check-artifacts, diffs
└── caches                 # .cache, temp, local SQLite scratch, model weights
```

### Hard rules

| Rule | Meaning |
|------|---------|
| **R1** | The Git repository must not accumulate runtime churn as normal operation. |
| **R2** | Writers resolve paths via a **Runtime Root Locator**, not `process.cwd()` + hard-coded repo-relative folders (except a thin compatibility shim during migration). |
| **R3** | `.gitignore` is a **safety net**, not the architecture. |
| **R4** | Anything needed at deploy time is either source, schema, shipped seed data, or fetched from an external store (R2, DB, disk mount) — never “whatever the last local run wrote into the clone.” |
| **R5** | Development orchestration may create worktrees; those worktrees are **checkout surfaces**, not submodule gitlinks and not content that belongs in the parent index. |

---

## 3. Classification taxonomy

| Class | Persist across restarts? | Backup? | Ship in Git? | Examples |
|-------|--------------------------|---------|--------------|----------|
| **source** | n/a | via Git | **Yes** | `src/`, schemas, intentional docs |
| **configuration** | n/a | via Git | **Yes** | `.env.example`, Render manifests, seed packs meant to ship |
| **documentation** | n/a | via Git (if intentional) | **Yes** (when authored) | contracts, phase completion notes *chosen* for history |
| **uploads** | Yes | media store / disk | **No** | `uploads/media` |
| **runtime** | Yes (local/prod disk or DB) | app data | **No** | platform activity JSONL, performer envelopes, ingestion run state |
| **diagnostics** | Optional (rotate/retain) | optional | **No** | self-audit reports, patches.audit, pm2 logs, diagnostics JSONL |
| **evidence** | Mission-scoped | optional / mission archive | **No** | `.development-runtime/evidence-files`, failure snapshots |
| **generated-artifacts** | Rebuildable | no | **No** | `dist/`, check-artifacts, vitest dumps |
| **cache** | Disposable | no | **No** | `.cache`, `tmp`, `os.tmpdir()`, `models/` |
| **fixture** *(subset of source)* | n/a | via Git | **Yes** (curated only) | small golden JSON under `data/**/fixtures` |

**Ambiguity rule:** If a path mixes fixtures and run dumps (e.g. `data/businessIngestion`), split it: fixtures stay under source; run output moves to runtime.

---

## 4. Inventory and decisions

Paths are relative to the monorepo root unless noted. Writer citations are from current code (2026-07-19).

### 4.1 Must leave Git (runtime / diagnostics / evidence / uploads / cache)

| Path | Classification | Writer(s) | Git today | Decision |
|------|----------------|-----------|-----------|----------|
| `apps/core/cardbey-core/uploads/` | uploads | `localStorageAdapter.js`, upload routes, `UPLOADS_DIR` | **~2117 still tracked** despite ignore | Untrack; keep local/R2; never commit |
| `apps/core/cardbey-core/.development-runtime/` | runtime + evidence | `developmentStore.ts`, `evidenceService.ts` | store tracked; evidence untracked | Whole tree → Runtime Root |
| `.development-workspaces/` | generated-artifacts + checkout | `workspaceWorktree.ts`, `checkRunner.ts`, … | partial track + gitlink noise | Ignore entirely; stop recording as gitlinks |
| `apps/core/cardbey-core/self-audit-reports/` | diagnostics | `fixHistory.ts`, self-audit scripts | partial | → Runtime Root / diagnostics |
| `apps/core/cardbey-core/patches.audit.json` | diagnostics | `maintenanceTools.js` | tracked | → Runtime Root; empty optional seed not required |
| `apps/core/cardbey-core/data/platformActivity/events.jsonl` | runtime / diagnostics | `platformActivityStore.js` | tracked | → Runtime Root (`PLATFORM_ACTIVITY_JSONL_DIR`) |
| `apps/core/cardbey-core/src/.cache/` | cache / diagnostics | `diagnosticStore.js`, explore cache, pair codes | partial | → Runtime Root (not under `src/`) |
| `apps/core/cardbey-core/.cache/` | cache | backfill scripts, explore | partial | → Runtime Root |
| `apps/core/cardbey-core/logs/` | diagnostics | pm2 / leftover JSONL | partial | → Runtime Root |
| `apps/core/cardbey-core/data/language-runtime/` | cache / runtime | i18n maintenance tools | ignored | Stay ignored; prefer Runtime Root |
| `apps/core/cardbey-core/data/language-agent/apply-history.json` | diagnostics | `languageExecutionAudit.js` | untracked | → diagnostics |
| `apps/core/cardbey-core/data/recommendationEvidence/` | evidence | recommendation evidence store | untracked | → evidence |
| `apps/core/cardbey-core/data/consolidatedFailureSnapshots/` | evidence | failure snapshot store | untracked | → evidence |
| `apps/core/cardbey-core/data/performerRequests/` | runtime | performer envelope store | untracked | → missions/runtime |
| `.cardbey/` | diagnostics | truth enforcer metrics | ignored | Keep as optional local metrics root *or* fold into Runtime Root |
| `packages/*/dist/`, dashboard `dist/` | generated-artifacts | builds | ignored / untracked | Remain out of Git |
| `coverage/`, `.vite/`, `node_modules/` | cache / generated | tools | ignored or should be | Remain out of Git |
| `models/` | cache | ML weights | ignored | Remain out of Git |
| Prisma `*.db*` | runtime | Prisma / local SQLite | ignored | Prod via `DATABASE_URL` / `PERSISTENT_DISK_PATH` — never in Git |

### 4.2 Stay in Git (source / configuration / curated fixtures)

| Path | Classification | Decision |
|------|----------------|----------|
| `apps/core/cardbey-core/src/**` (code) | source | Stay; **except** never write runtime under `src/.cache` |
| `prisma/**/*.prisma`, migrations | schemas | Stay |
| `docs/**`, `apps/core/cardbey-core/docs/**` | documentation | Stay when intentionally authored; do not auto-commit mission dumps without review |
| `data/starter-packs/`, `data/price-ladders/`, `data/templates/` | configuration / source data | Stay (shipped packs) |
| `data/language-seed/` | configuration | Stay (seed for materialisation) |
| Curated fixtures under ingestion/discovery/vision | fixture | Stay **only** if small, stable, and named/fixtures-separated |
| `.env.example`, deploy YAML, package manifests | configuration | Stay |
| Dashboard submodule source | source | Stay (own repo); its `dist/` stays out |

### 4.3 Must split (mixed concerns — highest design debt)

| Path | Problem | Target split |
|------|---------|--------------|
| `data/businessIngestion/` | Fixtures + thousands of run dumps; partially tracked | `data/businessIngestion/fixtures/` (source) vs Runtime `…/business-ingestion/runs/` |
| `data/discoveryEngine/` | Jobs + fixtures | fixtures in Git; live `jobs.json` → runtime/DB |
| `data/businessCandidates/` | File-backed candidate state | runtime (`BUSINESS_CANDIDATE_DIR`) |
| `data/visionDiscovery/` | Event repos on disk | runtime |
| Impact reports under `docs/` and `core/docs/` | Mix of deliberate architecture docs and mission-generated reports | **documentation** when reviewed; optional Runtime archive for ephemeral mission notes |

### 4.4 Development worktrees (special case)

| Item | Classification | Decision |
|------|----------------|----------|
| `.development-workspaces/dev-*` | **checkout surface** (git worktree) | Allowed as a *tooling* location outside “source content”; must not appear as `160000` gitlinks in parent index |
| `check-artifacts/`, `diffs/` | generated-artifacts | Under Runtime Root or ignored sibling; never committed |
| Claude / external `cardbey-wt-*` worktrees | checkout surface | Outside boundary plan content; operator hygiene |

`DEVELOPMENT_RUNTIME_MUTATION_ENABLED` and `CARDBEY_REPO_ROOT` already encode “mutations happen in isolated checkouts.” The boundary plan extends that idea from *mutations* to *all durable side effects*.

---

## 5. Proposed Runtime Root layout

Prefer one locator, configurable, defaulting **outside** the Git work tree when possible.

### 5.1 Resolution order (Invisible Assistance spirit, for paths)

1. Explicit env override for that concern (e.g. `UPLOADS_DIR`, `PLATFORM_ACTIVITY_JSONL_DIR`).
2. `CARDBEY_RUNTIME_ROOT` (new canonical root).
3. Legacy repo-relative path (**compat shim only**, with deprecation log once per process).
4. Fail closed for unknown writable concerns in production if unset and disk is ephemeral.

### 5.2 Suggested layout

```
$CARDBEY_RUNTIME_ROOT/                    # e.g. ~/.cardbey/runtime  or  /var/cardbey/runtime
├── uploads/
│   ├── media/
│   └── optimized/
├── logs/
├── diagnostics/
│   ├── platform-activity/
│   ├── runtime-diagnostics/
│   ├── self-audit/
│   └── patch-audit/
├── development/
│   ├── store.json
│   └── evidence-files/
├── missions/
│   └── performer-requests/
├── evidence/
│   ├── recommendation/
│   └── failure-snapshots/
├── domain/                               # file-backed domain state when DB off
│   ├── business-ingestion/
│   ├── business-candidates/
│   ├── discovery-engine/
│   └── vision-discovery/
├── generated/
│   ├── check-artifacts/
│   └── diffs/
└── cache/
    ├── explore/
    ├── language-runtime/
    └── tmp/
```

Local default proposal:

| Environment | Default `CARDBEY_RUNTIME_ROOT` |
|-------------|-------------------------------|
| Local desktop | `~/.cardbey/runtime` (or repo-adjacent `../.cardbey-runtime` if preferred) |
| Render / prod | Persistent disk mount (align with `PERSISTENT_DISK_PATH`) |
| CI | Job-scoped temp dir; never upload as Git artifact unless explicitly published |

`.cardbey/` at repo root can remain a thin local metrics folder **or** be deprecated in favour of `$CARDBEY_RUNTIME_ROOT/diagnostics/truth-metrics`.

### 5.3 What stays in-repo under Git

Only:

- Source, tests, schemas  
- Intentional documentation  
- Configuration + **curated** seeds/fixtures  
- Ignore files and Runtime Locator code  

Development worktrees may still physically live under `.development-workspaces/` for operator convenience, but that directory is **not** a content package — it is a Git tooling parking lot and must be fully ignored by the parent repo.

---

## 6. Ownership contract (who may write what)

| Concern | Allowed writers | Forbidden |
|---------|-----------------|-------------|
| uploads | upload/storage adapters | agent “convenient” dumps into `src/` |
| diagnostics | diagnosticStore, self-audit, platform activity, patch audit | committing from CI green-paths |
| development-runtime | development orchestrator / evidence service only | product request handlers (except explicit admin tools) |
| evidence | named evidence services | silent append from hot request paths without retention policy |
| generated-artifacts | build tools, checkRunner | runtime API |
| source tree | humans / governed implementation missions | any continuous append (JSONL, media, audit growth) |

Governed by existing Safe Execution + AutonomyPolicy for *external* effects; this plan adds **filesystem class** governance for *where* effects land.

---

## 7. Migration plan (staged; preserve ongoing development)

Do **not** start with blanket `git rm --cached` or `git clean`.

### Phase 0 — Accept boundary (this document)

- [ ] Agree taxonomy and Runtime Root shape  
- [ ] Agree defaults for local / prod / CI  
- [ ] No disk moves yet  

### Phase 1 — Locator + inventory freeze (low risk)

- [ ] Introduce `getRuntimeRoot()` / per-concern helpers (single module).  
- [ ] Wire **new** writes through the locator while still accepting legacy paths (read fallback).  
- [ ] Expand `.gitignore` / core `.gitignore` as a **temporary safety net** for known runtime paths (does not replace architecture).  
- [ ] Document env vars in `.env.example`.  

**Impact report required** before merging locator (touches many writers).  
**No-parallel-stack proof:** one Runtime Locator; no second ad-hoc root inventing competing folders.

### Phase 2 — Stop the bleeding (Git hygiene without deleting WIP)

Order matters:

1. Ignore untracked runtime (evidence, check-artifacts, dist) — collapses VS Code noise safely.  
2. **`git rm -r --cached` for historically tracked uploads and known runtime files** (keeps files on disk).  
3. Never `git clean` untracked `src/` or intentional docs.  

**Status (2026-07-20):** Ignore expansions applied; approved runtime paths removed from the index (`--cached`). Unstaged porcelain dropped from ~1214 → ~510. Staged deletions (~2172) await a dedicated hygiene commit. See [`IMPACT_REPORT_RUNTIME_IGNORE_INDEX_HYGIENE.md`](./IMPACT_REPORT_RUNTIME_IGNORE_INDEX_HYGIENE.md).

Protect expressly:

- All WIP under `apps/core/cardbey-core/src/**`  
- `packages/template-engine/src/**`  
- Intentional docs  
- Any deliberate deletion (e.g. `deepseekAdapter.js`) until reviewed  

### Phase 3 — Move writers off `src/` and repo-adjacent dumps

Priority order (highest Git / product value first):

1. `src/.cache/runtime-diagnostics` → `$RUNTIME/diagnostics/runtime-diagnostics`  
2. `data/platformActivity` → `$RUNTIME/diagnostics/platform-activity`  
3. `.development-runtime` → `$RUNTIME/development`  
4. `self-audit-reports` + `patches.audit.json` → `$RUNTIME/diagnostics/...`  
5. uploads already env-capable (`UPLOADS_DIR`) — point default at `$RUNTIME/uploads`  
6. File-backed domain stores (`businessIngestion` runs, candidates, discovery jobs, vision)  

Each slice: read-compat from old path → write to new → delete old only after soak.

### Phase 4 — Split mixed `data/**` trees

- Extract curated fixtures into explicit `fixtures/` (source).  
- Stop committing run directories.  
- Prefer DB backends already gated by env (`BUSINESS_INGESTION_RUNS_BACKEND`, etc.) in shared/prod.  

### Phase 5 — Development worktree hygiene

- Ensure parent repo never indexes `160000` entries for `.development-workspaces/dev-*`.  
- Ignore `.development-workspaces/**`.  
- Keep worktree creation; redirect check-artifacts/diffs to `$RUNTIME/generated/`.  

### Phase 6 — Deploy / backup / CI alignment

| Surface | Rule |
|---------|------|
| **CI** | Checkout source only; runtime dir = job temp; publish coverage as CI artifacts, not Git |
| **Deploy** | Image/build from source; bind persistent volume to Runtime Root (+ DB); uploads via R2 or volume |
| **Backup** | Backup Runtime Root + DB separately from Git; Git is not a backup for media or audits |
| **Local** | One Runtime Root per developer machine; optional per-worktree override |

### Phase 7 — Remove legacy shims

- Drop repo-relative write defaults after metrics show zero legacy hits.  
- Remove any remaining tracked runtime blobs from history only via a **dedicated** history rewrite decision (separate, explicit — not required for day-to-day hygiene).  

---

## 8. What this solves beyond today’s Git warning

| Pain | Boundary fix |
|------|----------------|
| VS Code disables Git features | Repo status reflects source work, not media/logs |
| “Is this file intentional?” | Class is structural |
| Deploy size / secrets / media | Clone ≠ data lake |
| CI flakiness from dirty trees | CI never sees local runtime |
| Mission evidence vs product code | Evidence lifecycle ≠ release lifecycle |
| Submodule / worktree ` M` spam | Worktrees are tooling, not content |

---

## 9. Explicit non-goals (for now)

- Rewriting Git history to purge historical uploads (optional later).  
- Forcing all file-backed domain stores to Prisma in one slice.  
- Deleting developer WIP or auto-committing impact reports.  
- Moving the dashboard submodule into the monorepo.  

---

## 10. Success criteria

The boundary is successful when:

1. A clean checkout + install + build produces **no** required runtime directories inside the Git tree (or only empty placeholders documented as non-authored).  
2. Running core locally for an hour does **not** dirty `git status` except via intentional source edits.  
3. Uploads, diagnostics, evidence, and development-runtime all resolve under `CARDBEY_RUNTIME_ROOT` (or documented env overrides).  
4. New contributors have one short doc: “Source is Git; state is Runtime Root.”  
5. CI never fails because a JSONL grew or a worktree gitlink moved.  

---

## 11. Recommended next action

**Do not** run `git rm --cached` yet.

**Do:**

1. ~~Review and accept (or amend) this boundary plan.~~ → Accepted framing (2026-07-19).  
2. ~~Author a small Phase 1 impact report for the Runtime Locator module.~~ → [`IMPACT_REPORT_RUNTIME_LOCATOR_PHASE_1.md`](./IMPACT_REPORT_RUNTIME_LOCATOR_PHASE_1.md).  
3. ~~Implement Phase 1 locator **only** after that impact report is approved (locator + tests + docs; no writer moves).~~ → Done: `src/lib/runtimeBoundary/runtimeLocator.ts`.  
4. Only after the locator lands, schedule Git untracking / writer moves as separate, explicitly approved slices.

---

## 12. Appendix — env cheatsheet (current + proposed)

| Variable | Role | Boundary home |
|----------|------|----------------|
| `CARDBEY_RUNTIME_ROOT` | **Proposed** canonical root | all classes below |
| `UPLOADS_DIR` | Media root | uploads |
| `PLATFORM_ACTIVITY_JSONL_DIR` | Activity stream files | diagnostics |
| `RUNTIME_DIAGNOSTICS_JSONL_DIR` | Diagnostics JSONL | diagnostics |
| `CARDBEY_REPO_ROOT` | Monorepo root (source / worktrees) | **source tooling**, not runtime data |
| `DEVELOPMENT_RUNTIME_MUTATION_ENABLED` | Allow isolated workspace mutations | development checkout |
| `BUSINESS_INGESTION_DIR` / `_RUNS_BACKEND` | Ingestion file vs DB | runtime / DB |
| `BUSINESS_CANDIDATE_DIR` | Candidate JSON | runtime |
| `PERSISTENT_DISK_PATH` / `DATABASE_URL` | Durable DB | runtime (DB) |
| `RUNTIME_DIAGNOSTICS_ENABLED` | Toggle diagnostics | diagnostics |

---

## 13. Appendix — relation to locked product rules

| Locked rule | Implication for runtime boundary |
|-------------|----------------------------------|
| Agent-first / Automation by Default | Agents must write side effects to Runtime, not invent UI/forms *or* pollute source |
| Safe Execution Governance | Publish/message/bill remain confirmation-gated; filesystem class is orthogonal but complementary |
| Invisible Assistance | Path resolution order: mission config → env → runtime root → ask (never dump into `src/`) |
| Intent Runtime foundation | Wrap don’t rewrite: locator wraps existing stores; no parallel “MI filesystem product” |
| Render-loop hardening | Unrelated, except dirty Git watches must not freeze the IDE |

---

*End of plan. Implementation starts only after explicit approval of Phase 1.*

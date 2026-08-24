# Implementation Report — Phase 3 Content Editing Bridge Hardening

**Authorization:** `ACK PHASE_3_CONTENT_EDITING_BRIDGE_HARDENING`  
**Verdict:** `PHASE_3_CONTENT_EDITING_BRIDGE_PARTIAL`  
**Date:** 2026-08-21  
**Branch (parent):** `fix/upload-ask-presentoptions-storename` @ `0d0e21501` (Phase 2 HEAD; Phase 3 uncommitted)  
**Dashboard submodule:** dirty with Phase 3 fingerprint/stale UI tweaks (not pushed)

## Why PARTIAL (not staging-pilot-ready)

Staging-ready requires persistence + concurrency + audit + isolation **and** local browser verification all pass. This session delivered the first four with unit/integration tests; **browser/E2E checklist (L1–L18) was not executed** (flags remain default OFF; no live fixtures exercised in a browser). Prisma client generate for `ContentEditProposal` may still be needed before multi-instance staging uses the DB path (file store is restart-safe for single-node local).

---

## A. Proposal storage — before / after

| | Before (Phase 2) | After (Phase 3) |
|--|------------------|-----------------|
| Mechanism | In-memory `Map` (`proposalStore`) | General `ContentEditProposal` contract |
| Durability | Lost on Core restart | Survives restart |
| Scope | Process-local | Shared general content-edit proposals (not Shows-only table name semantics — `contentType` field) |

**Canonical persistence:**

1. **Preferred:** Prisma model `ContentEditProposal` (sqlite + postgres schemas) + `scripts/apply-content-edit-proposal-sqlite.mjs`
2. **Fallback (pilot-safe local):** JSON files under `apps/core/cardbey-core/data/contentEditProposals/` when Prisma delegate is absent

Repository: `src/services/contentEditProposals/contentEditProposalRepository.js`

### Schema / migration

- Additive model on `prisma/sqlite/schema.prisma` and `prisma/postgres/schema.prisma`
- SQLite apply script creates table + indexes (ran successfully against local `DATABASE_URL`)
- Operator must run `pnpm db:generate` / postgres migrate before staging multi-node Prisma mode
- Statuses: `PENDING` | `ACCEPTED` | `DISCARDED` | `EXPIRED` | `STALE` | `FAILED`
- TTL default: **1 hour** (`DEFAULT_PROPOSAL_TTL_MS`); server time authoritative
- Retention: expire-on-read (`expireDueProposals`); files under `data/contentEditProposals` are gitignored and prunable by age/status

Required identity fields persisted: proposal id, actor, store, draft/revision, content type/item, scoped fields, base fingerprint + baseUpdatedAt, patch, provider/method, status, created/expiry/accepted/discarded, applied revision.

---

## B–C. Expiry, replay, concurrency

- Expired / discarded / stale cannot be accepted
- Accepted accept is **idempotent** (returns prior apply; no second mutation)
- CAS claim: `PENDING` → `ACCEPTED` via `claimPendingProposalForAccept` (Prisma `updateMany` or file status check)
- Binding: storeId + actor (admin only with `adminSupport`) + item fingerprint + `expectedUpdatedAt`
- Cross-store accept by swapping `storeId` → `403 cross_store_proposal`
- Fingerprint + timestamp precondition before claim; conflict → `STALE` + `409 concurrency_conflict`

---

## D. Audit

Reuses canonical **`AuditEvent`** (not a bridge-only universe). Actions include:

`content_bridge_resolve` | `content_bridge_propose` | `content_bridge_accept` | `content_bridge_discard` | `content_bridge_hide`

Metadata carries actor, store, content type, item id, fingerprints, providerMethod, adminSupport, result — **no tokens / query-string secrets** (media URLs stripped of query).

---

## E. Admin acting-on-behalf

- `entry=admin` / `adminSupport` never grants permission alone; `isPlatformAdmin` required server-side
- Material mutations (propose/accept/hide) require `adminReason` (≥3 chars)
- Same Shows mutation path as owner (`upsertStoreShow` / `setStoreShowStatus`) with `provenance: 'admin'`
- Audit `actorType: 'admin'` vs `'human'`
- Cannot accept another actor’s proposal without explicit `adminSupport` + admin role
- No ownership reassignment

---

## F. Isolation matrix

Covered in `performerContentEditingBridge.isolation.test.js` — all **8/8 passed**:

| Actor | Store | Draft | Item | Expected | Result |
|-------|-------|-------|------|----------|--------|
| Owner A | A | A | A | Allowed | Pass |
| Owner A | B | B | B | Rejected | Pass |
| Owner A | A | B | B | Rejected | Pass |
| Owner A | A | A | B | Rejected (no title leak) | Pass |
| Admin authorised | A | A | A | Allowed + admin context | Pass |
| Admin unauthorised | A | A | A | Rejected | Pass |
| Anonymous | A | A | A | Rejected | Pass |
| Ops (propose/accept/discard/hide/warnings) | — | — | — | Binding enforced | Pass |

---

## G. Rate limiting

Reuses `middleware/rateLimit.js` on `/warnings`, `/propose`, `/accept`, `/hide` (per user+store keys). No bridge-specific limiter invented.

---

## H. Provider truthfulness

`providerMethod`: `deterministic_relevance` | `deterministic_a11y` | `not_configured` — never labelled AI. `NotConfigured` preserves manual edit.

---

## I. Manual/automatic overwrite

- Manual PATCH/hide/archive on Shows routes → `markPendingProposalsStaleForItem`
- Hide via bridge stales pending replacement proposals
- New propose supersedes older PENDING for same item → STALE
- Restore does not revive EXPIRED/STALE
- UI clears proposal on stale/expired/conflict (`ContentEditForkCard`)

---

## J. Observability

In-process counters via `getBridgeTelemetrySnapshot()` + `GET .../telemetry` (admin in production). Events: resolve, propose lifecycle, concurrency, permission/cross-store, hide, provider unavailable, rate-limit (route-level).

---

## K. Readiness check

`GET /api/performer/content-editing-bridge/readiness` → `getBridgeReadiness()`  
Statuses: `READY_FOR_LOCAL` | `READY_FOR_STAGING_PILOT` | `NOT_CONFIGURED` | `BLOCKED`  
`READY_FOR_STAGING_PILOT` only when Prisma delegate mode + audit + shows + resolver (file mode → local only). Non-mutating; does not enable flags.

---

## L. Browser/E2E

**Not executed in this session.** Flags remain default OFF. Fixture/browser checklist L1–L18 deferred — primary reason for PARTIAL verdict.

---

## M. Exclusions confirmed

No product/service adapters, bulk repair, autonomous deletion, orchestra/publish changes, production flags, BB Flowers edits, push/merge/deploy.

---

## N. Tests

```
tests/performerContentBridge/*.test.js — 27 passed (4 files)
```

Includes Phase 0–2 regression, flag-off, Phase 3 durability/expiry/idempotency/stale/hide/admin/audit/provider/readiness, isolation matrix.

Create-store / publish orchestration: **not modified** in Phase 3 files.

---

## O. Confirmations

- Flags default **OFF** (`ENABLE_PERFORMER_CONTENT_EDITING_BRIDGE_V1` / `VITE_ENABLE_…` parseBool default false)
- No live store data changed
- Create/publish orchestration unchanged
- Unrelated dirty tree **preserved** (not staged)

### Exact files changed (Phase 3)

**Core**

- `src/services/performerContentBridge/performerContentEditingBridge.js`
- `src/services/contentEditProposals/contentEditProposalRepository.js` (new)
- `src/routes/performerContentEditingBridgeRoutes.js`
- `src/routes/storeShowsRoutes.js`
- `prisma/sqlite/schema.prisma` (+ `ContentEditProposal`)
- `prisma/postgres/schema.prisma` (+ `ContentEditProposal`)
- `scripts/apply-content-edit-proposal-sqlite.mjs` (new)
- `data/contentEditProposals/.gitignore` (new)
- `tests/performerContentBridge/performerContentEditingBridge.phase3.test.js` (new)
- `tests/performerContentBridge/performerContentEditingBridge.isolation.test.js` (new)
- `tests/performerContentBridge/performerContentEditingBridge.test.js` (discard prisma arg fix)

**Dashboard**

- `src/lib/websiteEditing/performerContentEditingBridgeApi.ts`
- `src/components/performer/ContentEditForkCard.tsx`

**Docs**

- `docs/reports/IMPACT_REPORT_PHASE_3_CONTENT_EDITING_BRIDGE_HARDENING.md`
- `docs/reports/IMPLEMENTATION_REPORT_PHASE_3_CONTENT_EDITING_BRIDGE_HARDENING.md` (this file)

### Working tree

Large unrelated dirty set remains; Phase 3 work is uncommitted. Do not stage unrelated files.

---

## Next for staging-pilot-ready

1. Local/staging flags ON for fixture store only; run browser checklist L1–L18  
2. `pnpm db:generate` + deploy `ContentEditProposal` migration on staging DB  
3. Confirm readiness returns `READY_FOR_STAGING_PILOT` with Prisma storage mode  
4. Optional local checkpoint commit (surgical) when authorized

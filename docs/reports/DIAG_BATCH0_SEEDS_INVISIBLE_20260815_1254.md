# DIAG — Batch 0 Seeds Invisible to Audit Script

Date: 2026-08-15T12:54:00+10:00  
Status: **PATCH IMPLEMENTED — AWAITING RENDER AUDIT CONFIRMATION**  
Scope: Audit seed inventory aligned with import backend (`listSeedRecords`)

---

## 1. Root cause

**Hypothesis A (data-source mismatch)** — Seeds live in Postgres on Render; the audit script never queries `BusinessSeed`. It counts seeds exclusively from the filesystem JSON file `data/businessIngestion/seeds.json`.

This is not a `verificationStatus` / `batchId` WHERE filter excluding `seeded_pending_qa`. The audit path never opens the Prisma seed table at all.

### Exact evidence

| Path | Storage used |
|------|----------------|
| `scripts/import-melbourne-batch0.ts` → `runIngestion({ persistSeeds: true })` → `IngestionRepository.listSeedRecords` / upsert | **DB on Render** via `resolveBusinessSeedBackend()` when Postgres/Render (`businessSeedBackend.ts`) |
| `scripts/audit-discovery-data.ts` → `loadAuditContext` → `loadIngestionArtifacts()` | **Always** `readJsonFile(.../seeds.json)` — no Prisma `businessSeed` call |

Key audit code (`scripts/lib/discovery-data-audit.ts`):

```714:728:scripts/lib/discovery-data-audit.ts
export async function loadIngestionArtifacts(): Promise<{
  seeds: IngestedSeedRecord[];
  claims: IngestionClaimRequest[];
  enrichmentCandidates: EnrichmentCandidate[];
  suitcases: SeedSuitcase[];
}> {
  const dir = ingestionDir();
  const [seeds, claims, enrichmentCandidates, suitcases] = await Promise.all([
    readJsonFile<IngestedSeedRecord[]>(path.join(dir, 'seeds.json'), []),
    // ...
  ]);
  return { seeds, claims, enrichmentCandidates, suitcases };
}
```

And `loadAuditContext` assigns:

```812:812:scripts/lib/discovery-data-audit.ts
    seeds: ingestion.seeds,
```

Funnel / “Total BusinessSeeds” are derived from `ctx.seeds` only — i.e. whatever is in that JSON file.

Meanwhile import “Seeds skipped (unchanged): 10” comes from `reconcileIngestionSeeds` comparing incoming pilot rows against **`listSeedRecords()`** (DB on Render). Skip means “already present and factually identical in the active backend,” **not** “JSON-only, no DB write.”

`businessSeedBackend.ts` explicitly documents Render must not rely on ephemeral `seeds.json`:

> Postgres / Render → database only (no ephemeral seeds.json).

So on Render the stale/ephemeral disk `seeds.json` can still contain a single old Brunetti `seeded_claimable` row while Postgres holds the 10 Batch 0 `seeded_pending_qa` seeds. Import and audit therefore disagree by construction.

### Hypotheses ruled out

| Hypothesis | Verdict |
|------------|---------|
| **B** — Import skipped DB write; seeds only in JSON | **Rejected.** Skip count is computed after listing existing seeds from the resolved backend (DB on Render). Import report “Discovery seeds: 10 — PASS” reflects that backend’s records. |
| **C** — Wrong schema/tenant | **Unlikely** as primary cause; same app DB would still be invisible to an audit that never queries it. |
| **D** — Prisma client out of date | **Not required to explain** this symptom. Import already reconciled 10 DB seeds. ClaimOtp/index checks are orthogonal. |

---

## 2. Affected files

| File | Role |
|------|------|
| `scripts/lib/discovery-data-audit.ts` | **Bug site** — seeds loaded only from JSON |
| `scripts/audit-discovery-data.ts` | Entrypoint; uses `loadAuditContext` |
| `scripts/import-melbourne-batch0.ts` | Correct for Render (DB via ingestion pipeline) — do not change batchId/status |
| `apps/core/.../businessIngestion/IngestionRepository.ts` | Canonical `listSeedRecords()` (db \| file) |
| `apps/core/.../businessIngestion/businessSeedBackend.ts` | Backend selection (Render → db) |
| `apps/core/.../data/businessIngestion/seeds.json` | Stale/ephemeral mirror on Render; not source of truth in prod |

---

## 3. Proposed fix (smallest safe patch)

**One primary file:** `scripts/lib/discovery-data-audit.ts`

Change seed loading in `loadAuditContext` / `loadIngestionArtifacts` to use the same backend-aware API as ingestion:

1. Dynamically import core `listSeedRecords` from `apps/core/cardbey-core/src/lib/businessIngestion/IngestionRepository.ts` (or `index.ts`).
2. Prefer `listSeedRecords()` for the seed inventory used by audit counts / funnel.
3. Keep claims / enrichment / suitcases on JSON for now (unchanged) unless they already have DB backends.
4. Optionally log which backend was used and seed count in the audit markdown header (`Database` + `Seed backend=db|file`) so this class of mismatch is obvious next time.

**Do not:**
- Re-run `import:melbourne-batch0`
- Mutate any `BusinessSeed` rows, `batchId`, or `verificationStatus`
- Run `prisma migrate deploy`
- Dual-write JSON from import as a “fix” (would fight Render ephemeral disk)

### Proposed diff sketch (not applied)

```ts
// In loadAuditContext / loadIngestionArtifacts:
const { listSeedRecords } = await import(
  pathToFileURL(path.join(CORE_ROOT, 'src/lib/businessIngestion/IngestionRepository.ts')).href
);
const seeds = await listSeedRecords(); // db on Render, file locally
```

---

## 4. Risk

| Risk | Level | Notes |
|------|-------|-------|
| Audit numbers change on staging (Discovery 0→10) | Low / expected | Corrects false undercount |
| Local SQLite without `BusinessSeed` delegate | Medium | `listSeedRecords` already falls back to file when DB table/client unavailable — verify local audit still works |
| Claims/suitcases still JSON-only | Low | Out of scope; funnel seed counts are the reported bug |
| Import / QA / claim paths | None | Untouched |

---

## 5. Rollback plan

1. Revert the single change in `scripts/lib/discovery-data-audit.ts`.
2. Re-run `pnpm audit:discovery` — returns to JSON-only counts.
3. No DB rollback required (read-path only).

---

## 6. Step 1 — Raw DB count (this environment)

Local diagnostic script: `apps/core/cardbey-core/tmp/diag-seeds.mjs`

| Check | Local result |
|-------|----------------|
| `seeds.json` | **10** rows, all `seeded_pending_qa`, all `MELBOURNE_BATCH0_20260617` |
| Prisma `businessSeed.count()` | **Delegate missing** — local `@prisma/client` generated without `BusinessSeed` model |
| Render Postgres (operator-reported) | Import sees **10** seeds skipped unchanged → DB has Batch 0; audit sees **1** claimable → JSON |

**Operator action on Render (optional confirm):** run the same diag against Render’s Prisma client path to print Postgres `BusinessSeed` totals. Expected: ≥10 Batch 0 pending_qa + optional Brunetti if present in DB; `seeds.json` on disk may still show 1.

---

## 7. Approval gate

**Approved 2026-08-15.** Patch implemented.

---

## 8. Implementation result (2026-08-15)

### Code change
- `scripts/lib/discovery-data-audit.ts`
  - Added `loadAuditSeeds()` — uses `resolveBusinessSeedBackend()` + `listSeedRecords()` from `IngestionRepository.ts` / `businessSeedBackend.ts` (direct imports; not the barrel `index.ts`, which pulled mailer and forced false fallback).
  - On `backend === 'file'` or import/resolve failure: prints  
    `[WARN] audit:seeds — DB unavailable, falling back to seeds.json (counts may not reflect Postgres state)`
  - `AuditContext.seedSource: 'db' | 'file'` surfaced in audit + readiness markdown headers.
  - Read-path only (no writes / upserts / status changes).

### Tests
- `apps/core/cardbey-core/src/lib/businessIngestion/__tests__/auditDiscoverySeedSource.test.ts` — **1 passed** (file fallback + WARN).

### Local verification (`pnpm audit:discovery:readiness`)
- Seed source: **db** (`BusinessSeed` / same backend as import)
- Local SQLite inventory: Total BusinessSeeds **2** (`seeded_claimable: 2`), Discovery **(0)** — proves audit now reads DB, not the local `seeds.json` of 10 pending Batch 0 rows.
- File-fallback WARN verified on earlier broken barrel-import path and by unit test with `BUSINESS_SEEDS_BACKEND=file`.

### Render verification (Phase 9 close)
**Not run from this agent environment** (no Render shell). Operator should deploy/sync this patch then:

```bash
pnpm audit:discovery:readiness
```

**Expected on Render after patch:**
- Seed source: **db**
- Total BusinessSeeds: **10** (all `seeded_pending_qa`, batch `MELBOURNE_BATCH0_20260617`, plus any pre-existing claimable rows if still present)
- Funnel: Discovery **(10)** if exactly the Batch 0 pending set; Discovery count = count of `seeded_pending_qa`

Phase 9 can be formally closed when Render output matches those acceptance criteria.

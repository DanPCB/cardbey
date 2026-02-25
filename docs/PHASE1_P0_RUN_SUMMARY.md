# Phase 1 Ship — P0 Verification + Minimal Fix Run (Summary)

**Spine untouched:** No changes to POST /api/mi/orchestra/start, GET /api/stores/temp/draft, PATCH /api/draft-store/:draftId, POST /api/store/publish, GET /api/store/:id/preview. No new polling loops.

---

## Risk note

- **Store creation spine:** Unchanged. Only additions: Prisma schema + migration (new table), RequireAuth comment, one dashboard test file, and docs.
- **P0-2:** No change to redirect or login logic; only a comment and a test that locks current behavior.

---

## Step 0 — Status confirmed

### A) StorePromo schema

- **Finding:** `StorePromo` did **not** exist in `prisma/schema.prisma`. No migration created a `StorePromo` table. Routes (`promosAuth.js`, `promosPublic.js`, `stores.js`, `shortSlug.js`) use `prisma.storePromo` and would fail at runtime without the model.
- **Mismatch:** Schema + migrations had no StorePromo; runtime routes expect it.

### B) Auth + Draft Review returnTo

- **Finding:** RequireAuth uses `location.pathname + location.search`; LoginPage uses `decodeURIComponent(returnTo)` and `navigate(decoded, { replace: true })`. No code strips query params; draft review URL with `jobId` and `generationRunId` is preserved and used after login.
- **Conclusion:** returnTo already preserves full URL; no 401 loop from lost params. Only documentation and test added.

---

## Step 1 — P0-1 fix (StorePromo)

### File-by-file changes

| File | Change |
|------|--------|
| `apps/core/cardbey-core/prisma/schema.prisma` | Added `StorePromo` model (id, storeId, business relation, productId?, title, subtitle?, description?, heroImage?, heroImageUrl?, ctaLabel?, targetUrl, code?, startsAt?, endsAt?, slug @unique, isActive, scanCount, createdAt, updatedAt). Added `storePromos StorePromo[]` to `Business`. |
| `apps/core/cardbey-core/prisma/migrations/20260217170000_add_store_promo/migration.sql` | New migration: CREATE TABLE StorePromo + FK to Business + indexes (slug unique, storeId, slug, isActive). |

### Commands run + results

```bash
cd apps/core/cardbey-core
npx prisma migrate status   # (run timed out / background)
npx prisma generate         # Exit 1: EPERM rename (Windows file lock on query_engine DLL)
npx prisma migrate deploy   # Exit 1: prior migration 20260217160000 failed: duplicate column errorCode (pre-existing)
```

- **prisma generate:** Failed with EPERM (another process likely using the Prisma client). Fix: close dev server/other Node processes and run `npx prisma generate` again.
- **migrate deploy:** Failed on an **earlier** migration (`20260217160000_add_draft_error_code_action`: duplicate column `errorCode`), not on the new StorePromo migration. The new migration was not applied. Resolve the earlier migration (or use a DB where it’s already applied), then run `npx prisma migrate deploy` again so `20260217170000_add_store_promo` is applied.

### Tests

- **promos.routes.test.js:** Not run in this session (DB/migrate state). After applying the new migration and running `npx prisma generate`, run:  
  `npm run test -- promos.routes.test.js`

---

## Step 2 — P0-2 (returnTo)

### File-by-file changes

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/routes/guards/RequireAuth.tsx` | Comment only: document that pathname+search preserves query (e.g. jobId, generationRunId) and that LoginPage decodes and navigates back. |
| `apps/dashboard/cardbey-marketing-dashboard/tests/RequireAuthReturnTo.test.ts` | New test: buildReturnTo/decodeReturnTo mirror RequireAuth/LoginPage; assert full path+search and presence of generationRunId/jobId in decoded URL and in login redirect. |

### Commands run + results

```bash
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test -- tests/RequireAuthReturnTo.test.ts tests/reviewRoutes.test.ts --run
# Result: 2 files, 11 tests passed.
```

---

## Step 3 — Smoke test doc

| File | Change |
|------|--------|
| `docs/PHASE1_SHIP_SMOKE_TEST.md` | New: three-scenario checklist (Quick Create → Publish → storefront; logged-out draft review URL → login → return → draft loads; create promo → /p/:slug incognito → scan → QR download) + optional commands. |

---

## Phase 1 ship-ready after these P0s?

- **P0-1:** StorePromo is in schema and migration. To be fully ready: resolve any prior migration failure, run `npx prisma migrate deploy`, run `npx prisma generate` (without file lock), then run `npm run test -- promos.routes.test.js` in core.
- **P0-2:** returnTo behavior was already correct; it’s now documented and covered by tests. No further code change needed for P0-2.

Once the migration is applied and promo tests pass, Phase 1 is **ship-ready** from a P0 perspective. Use `docs/PHASE1_SHIP_SMOKE_TEST.md` for manual sign-off.

---

## Exact commands to run (after resolving migrate/generate)

```bash
# Core
cd apps/core/cardbey-core
npx prisma migrate resolve --applied 20260217160000_add_draft_error_code_action   # only if that migration is already applied in DB
npx prisma migrate deploy
npx prisma generate
npm run test -- promos.routes.test.js
npm run test -- store-publish.test.js

# Dashboard
cd apps/dashboard/cardbey-marketing-dashboard
pnpm test -- tests/RequireAuthReturnTo.test.ts tests/reviewRoutes.test.ts --run
```

# Contract Tests Baseline Verification

**Date:** 2026-09-02  
**Context:** PR #327 (`hotfix/phase0-core-envelope`) blocked on Contract Tests  
**Verdict:** **BASELINE CI DEFECT — not introduced by #327**

---

## Failure signature (identical on main and #327)

| Field | Value |
|-------|-------|
| **Workflow** | `Contract Tests (Gold Flows)` |
| **Failing step** | `Check Postgres schema vs migrations (no drift)` |
| **Command** | `npx prisma migrate diff --from-migrations prisma/postgres/migrations --to-schema-datamodel prisma/postgres/schema.prisma --exit-code` |
| **Exit code** | 2 |
| **Root cause class** | Schema datamodel ahead of committed migrations |

### First drift markers (both runs)

```
[+] Added tables
  - TemplateLibrary
  - ContentTemplate
  - ContentTemplateVersion
  - TemplateInstance
  - TemplateAsset
  - TemplateFavorite
  - CreatorPayoutAccount
  - OAuthConnection
  - teacher_traces
  - ProductVariant
  - Warehouse
```

Additional changed tables on both runs include `UniversalEntityRelation` (index rename), `business_*_events` (removed FKs), `prebuilt_*` (removed FKs), `business_seed` / `business_ingestion_run` (`updatedAt` default).

---

## Evidence: main already fails

| Run | Trigger | Result |
|-----|---------|--------|
| [33515185426](https://github.com/DanPCB/cardbey/actions/runs/33515185426) | Merge PR #325 → `main` | **FAIL** — same drift step |
| [33507868113](https://github.com/DanPCB/cardbey/actions/runs/33507868113) | Merge PR #324 → `main` | **FAIL** |
| [33490183286](https://github.com/DanPCB/cardbey/actions/runs/33490183286) | Merge PR #322 → `main` | **FAIL** |
| [33518631694](https://github.com/DanPCB/cardbey/actions/runs/33518631694) | PR #327 | **FAIL** — identical signature |

Contract Tests has been failing on **every recent main merge** since at least PR #322.

---

## Evidence: #327 introduces no schema changes

```bash
git diff origin/main...hotfix/phase0-core-envelope --name-only -- apps/core/cardbey-core/prisma
# (empty)
```

PR #327 changes: gates, health/deploy metadata, draft failure recovery, journey tests, docs. **Zero Prisma/migration files.**

---

## Conclusion

| Question | Answer |
|----------|--------|
| Did #327 cause Contract Tests failure? | **No** |
| Is drift pre-existing on main? | **Yes** — confirmed on PRs #322, #324, #325, #327 |
| Should #327 bypass Contract Tests? | **No** — document baseline defect; decide branch protection separately |
| Does this block production hardening merge decision? | **Product decision:** hardening PR is unrelated to schema drift; merges #324/#325 already landed on main despite same failure |

---

## Recommended follow-up (separate from Phase 0 hardening)

1. Generate and commit missing Postgres migrations for `schema.prisma` drift (TemplateLibrary stack, Warehouse, etc.)
2. Re-run Contract Tests on main until green
3. Restore Contract Tests as a meaningful required check on `main`

**Not in scope for #327 merge gate override without explicit team approval.**

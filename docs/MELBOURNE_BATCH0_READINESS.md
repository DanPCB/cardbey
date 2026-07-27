# Melbourne Batch 0 Readiness

> **Template** — overwritten by `pnpm audit:discovery:readiness` on staging.
> Do not launch Melbourne Batch 0 until staging audit + dry-run are reviewed.

## Remaining inventory

| Metric | Count |
|--------|------:|
| Real stores (PRESERVE) | _run audit_ |
| Discovery seeds (PRESERVE) | _run audit_ |
| Activated businesses (funnel) | _run audit_ |
| Operating businesses | _run audit_ |
| BI snapshots | _run audit_ |
| Delete candidates (stores) | _run audit_ |
| Delete candidates (seeds) | _run audit_ |
| Review required (stores) | _run audit_ |
| Review required (seeds) | _run audit_ |

## Funnel baseline

```
Discovery (_)
  ↓
Claimable (_)
  ↓
Claimed (_)
  ↓
Verified (_)
  ↓
Activated (_)
  ↓
Operating (_)
```

## Recommendation

**PENDING** — Run staging audit first.

## Two-step cleanup approval

| Step | Action |
|------|--------|
| **1** | `pnpm audit:discovery:readiness` + `pnpm cleanup:discovery:dry-run` |
| **2** | Human approval, then `DISCOVERY_CLEANUP_CONFIRM=1 pnpm cleanup:discovery -- --apply` |

| Step | Action |
|------|--------|
| **1** | `pnpm cleanup:fixture-seeds:dry-run` (review `docs/reports/FIXTURE_SEED_CLEANUP_DRY_RUN_*.md`) |
| **2** | Human approval, then `FIXTURE_SEED_CLEANUP_CONFIRM=1 pnpm cleanup:fixture-seeds -- --apply` |

**Never run `--apply` without reviewing audit + dry-run reports.**

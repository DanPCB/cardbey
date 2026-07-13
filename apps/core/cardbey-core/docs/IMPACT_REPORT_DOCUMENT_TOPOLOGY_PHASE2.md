# Impact Report — Document Topology Phase 2

## Summary

Phase 2 generalizes loyalty-card topology into a reusable `DocumentTopologyEngine` without replacing Phase 1 loyalty contracts or runtime paths.

## What could break

1. **Owner-input payload shape** — `cardTopology` and `topologyAction` are now accepted on `POST /api/missions/:id/owner-input`. Clients that strict-validate field types may reject object payloads until updated.
2. **Prisma migration** — new `DocumentTopologyRevision` table must be applied on SQLite and PostgreSQL before revision persistence works.
3. **Topology review UI** — `LoyaltyTopologyReviewPanel` now renders additional panels and action buttons; snapshot tests may need refresh.

## Why

- New shared module under `src/lib/documentTopology/`
- Loyalty extraction delegates to `DocumentTopologyEngine` + `LoyaltyTopologyInterpreter`
- Owner edits set `source: OWNER_DEFINED` and preserve `originalExtraction`
- Revision history stored in `DocumentTopologyRevision`

## Impact scope

- Loyalty intake / owner review / persistence
- Future document interpreters (menu, voucher, etc.) — registry only, not wired yet
- No change to programs without `cardTopologyJson` (still use default 2×5 template)

## Smallest safe patch

- Keep `extractLoyaltyCardTopology()` export and existing `LoyaltyCardTopology` JSON shape
- Delegate build/validate/confidence to document layer
- Extend owner-input merge only when `cardTopology` / `topologyAction` present
- Add revision table as additive migration

## Backward compatibility

- Existing loyalty topology tests remain the regression gate
- `DEFAULT_TEMPLATE` programs unchanged
- `OWNER_DEFINED` topologies are never overwritten on rescan

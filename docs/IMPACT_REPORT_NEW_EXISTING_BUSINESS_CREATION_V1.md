# Impact Report: NEW + EXISTING Business Store Creation V1

**Date:** 2026-09-05  
**Goal:** Restore Quick Card (name/location/category), creationMode decision, NEW_BUSINESS populated starter catalogs, keep EXISTING research.  
**User:** Proceed with audit-first minimum safe patch.

## What could break

1. AI-first single-clue entry becomes secondary — users who relied on clue-only may need one extra click (“Describe in one line”) or still use optional enrichment.
2. Florist / new retail stores get fuller starter menus (AI_GENERATED_STARTER) instead of 5 sparse category labels — more items, still unpriced unless evidence exists.
3. `creationMode` on business context may affect logging/telemetry consumers if they assume only vertical fields.

## Why

- Product drift: research-as-prerequisite + generic service fallback for no-evidence.
- Quick Card hid location/category behind AI-first entry.
- Sparse florist fixed generic-service wrongness but under-populated demo stores (fails “populated menu” gate).

## Impact scope

- Dashboard: `StoreCreationDraftCard.tsx` (quick card fields)
- Core: creationMode resolver, business context, industry/seed catalog for NEW_BUSINESS starters, tests
- EXISTING research path unchanged when website/evidence present

## Smallest safe patch

1. Default Quick Card shows name + location + category (+ Continue); enrichment optional.
2. `resolveStoreCreationMode` → NEW | EXISTING | AMBIGUOUS from evidence signals.
3. NEW_BUSINESS + known vertical → industry starter offerings (unpriced, provenance AI_GENERATED_STARTER), never Core Service packages.
4. EXISTING with research evidence → keep evidence-backed catalog.
5. Media: florist/new-business image query hints remain vertical-locked; reject empty/generic queries.

## Rollback

Revert listed files; previous AI-first + sparse florist behavior returns.

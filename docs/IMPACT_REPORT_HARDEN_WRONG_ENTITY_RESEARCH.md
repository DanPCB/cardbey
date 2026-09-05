# Impact Report: Harden store-creation against wrong-entity research drift

**Goal:** Prevent soft-selected wrong Places matches (e.g. Florist Braybrook) from attaching catalogs to NEW businesses (My Flower / Flower Blossom); keep catalog module load safe; ship to staging + live.

## What could break
- Soft research enrichment for legitimate single Place matches with website may require stronger name fidelity (more UNRESOLVED → NEW_BUSINESS starter). Preferred over wrong-business catalogs.
- Owner review card less often for weak matches.

## Why
Places query by name+location can return another florist; soft-select attached that catalog while identity fields stayed empty.

## Smallest safe patch
1. Industry-stopword-aware soft-select guard (no soft-select on flower/florist-only overlap).
2. Require name-exact or strong distinctive token coverage for soft-select.
3. Keep single unwrapPlacesSearchRow + import test.
4. Commit only store-creation path files (+ dashboard Quick Card); exclude payment/.tmp/unrelated.

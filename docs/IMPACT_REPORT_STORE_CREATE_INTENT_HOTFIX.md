# Impact Report: Store Create Intent Hotfix (Live)

**Date:** 2026-07-14  
**Goal:** Restore Performer “create a store” (and common typos like “create as tore”) so Mission Console opens store creation instead of chat fallback “How can I help you today?”

## What could break

1. **False-positive store create** — loose matching could treat unrelated chat as `create_store`.
2. **Multi-store users** — `create_store` no longer opens the store picker (picker remains for campaign/loyalty/analytics).
3. **Capabilities chat** — “how can I create a store?” routes to create-store instead of the capabilities blurb.

## Why

With `INTENT_ENGINE_PRIMARY`, `IntentClassifier` uses a strict create-store regex and early-returns `question` → chat. Typos never reach `tryStoreCreateFastPath` / runway classifiers. Separately, multi-store accounts hit `needs_store_picker` for explicit create-store.

## Impact scope

- Core intent engine: `IntentClassifier`, `ContextEvaluator`
- Intake V2 early-return gate (`performerIntakeV2Routes` + `storeCreateFastPath` typo normalize)
- Performer NL create-store only (structured forms / action keys unchanged)

## Smallest safe patch

1. Normalize common create-store typos; loosen `CREATE_STORE_RE` to runway-style spacing; evaluate create-store before capabilities.
2. `create_store` context always `ready` (no storeId / no picker).
3. If Intent Engine returns `action: 'chat'` but fast-path would match after normalize → skip early return and fall through.

## Governance

Draft / mission still requires user confirmation before publish or live business mutation; this hotfix only restores intent recognition → draft runway.
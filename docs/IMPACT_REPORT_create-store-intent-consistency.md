# Impact Report: Create Store Intent Consistency

**Date:** 2026-07-15  
**Scope:** Performer create-store entry (NL + URL starter + chips)

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Over-matching "create my store page" → create_store | Wider patterns | Gap-bounded patterns; video ontology still short-circuits |
| Active-store users always get new store when saying create | Removing activeStoreId early return for pattern matches | Only deterministic create-store patterns bypass; still requires greenfield wording |
| Starter auto-dispatch races with newStore=1 | Two triggers | starter creates same beginNewStoreCreation path; consume after dispatch call |
| Chip submit still posts NL without action | Onboarding chips | Map create chips to beginNewStoreCreation / action:create_store |

## Root cause

1. `EXACT_STORE_PHRASES` / ontology / explicit greenfield patterns accept `create a store` but not `create my store` / `create my first store`.
2. `starter=create_store` only prefills `"Create my first store"` (failing phrase) — no runtime dispatch.
3. With `activeStoreId`, non-exact phrases skip runway → `general_chat`.

## Smallest safe patch

1. Canonical `createStoreIntentContract` (normalize + patterns) used by fast path + explicit detectors.
2. Do not bail on `activeStoreId` when deterministic create-store match.
3. Starter + onboarding chip → `beginNewStoreCreation` / shared `startCreateStore`.
4. Align nav `createStoreEntryRoute` with `newStore=1` + preserve onboarding flag if needed.
5. Phrase tests covering all listed synonyms.

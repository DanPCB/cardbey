# Impact Report: Intent Engine headline / content-edit recognition

**Date:** 2026-08-10  
**Goal:** Restore mid-mission NL like `change headline 'AWE FINANCIAL' to 'AWE FINANCE'` so Performer runs `code_fix` (approval card) instead of chat fallback “How can I help you today?”.

## What could break

1. **False-positive content edits** — casual chat that mentions “change” + “text/title” could route to `code_fix` instead of chat.
2. **Store picker / missing store** — content-edit requires a business; multi-store accounts without `activeStoreId` will see the store picker (same as campaign/loyalty).
3. **Tool choice** — engine will prefer `code_fix` (approval-gated), not silent `change_hero_headline`. Users who expect instant apply will still see a confirm card (safer; matches legacy ontology).

## Why

With `INTENT_ENGINE_PRIMARY=true`, intake early-returns on Intent Engine `action: 'chat'`. `IntentClassifier` has no content-edit / headline pattern, so messages with verb signals (`change`) fall through to default `question` → response `"How can I help you today?"` and never reach legacy `resolveIntent` / ontology (`content_edit` / `change_headline` → `code_fix`).

Observed on live mission console: user headline instruction → Performer greeting; preview unchanged.

## Impact scope

- Core intent engine: `intent.types.ts`, `IntentClassifier`, `IntentExecutor`, `ContextEvaluator`
- Unified taxonomy map: `intentTaxonomy.ts` (`content_edit` → `update_store`)
- Intake V2 only when Intent Engine is primary (legacy path unchanged)
- Tests: classifier (+ optional executor/bridge)

## Smallest safe patch

1. Add IntentType `content_edit` (`requiresBusiness: true`).
2. Classify with the same simple text/copy regex already used to exclude capability-gap false positives.
3. Execute → `code_fix` with `description: userMessage` and storeId from context (not early chat return).
4. Map locked tool / taxonomy for picker + unified intent.

## Governance

`code_fix` remains approval-gated before apply. No auto-publish, messaging, billing, or ownership changes.

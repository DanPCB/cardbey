# Impact Report: Business Tagline / Slogan Output Hardening

**Status:** Implemented — awaiting merge to `main`  
**Branch:** `fix/business-tagline-output-hardening`  
**Verdict:** `BUSINESS_TAGLINE_OUTPUT_V1_READY` (code + unit tests; live verify after deploy)

## Symptom

Customer-facing taglines show AI meta wrappers:

- `A professional slogan for ANISON CAPITAL GROUP: "Building…"`
- `Top Pick: *"Bringing Nature's Beauty Into Eve…"`

## Root cause

1. `contentResolver.resolveContent` uses a weak free-text prompt (`Generate slogan for…`) and does not request structured JSON.
2. `sanitizeStoreSlogan` strips some tip-lists but **not** “A professional slogan for X:” or “Top Pick:”.
3. `businessProfileService.generateTagline` and publish (`resolvePublishedStoreCopyFromPreview`) do not run the sanitizer.
4. Some UI paths (e.g. `StorePreviewPage`) render raw `tagline`/`slogan` without display-time sanitize (WebsitePreview/MiniWebsite already sanitize).

Malformed text can already be stored in `DraftStore.preview.{slogan,tagline}` and `Business.tagline`.

## What could break

1. Edge-case slogans that legitimately start with words like “Here is” or “Top Pick” would be stripped (unlikely for real marketing slogans).
2. Fallback when LLM fails may change slightly if JSON parse fails (still sanitized free text).
3. Repair script updating DB rows — only when explicitly run; dry-run by default.

## Impact scope

- Core content resolution + business profile AI + publish copy sync
- Dashboard sanitizer (display defense) + StorePreviewPage
- Optional one-shot repair script for existing `Business` / `DraftStore` rows

## Smallest safe patch

1. Expand canonical `sanitizeStoreSlogan` + `isCustomerFacingSlogan` validator (core SSoT; dashboard copy synced).
2. Strict slogan prompt + `responseFormat: 'json'` `{ "tagline": "..." }` in `resolveContent`; polish + validate; one regenerate if still meta.
3. Sanitize in `generateTagline`, publish runway, and draft content-resolution preview write (incl. hero `subheadline` sync).
4. Display-time sanitize on StorePreviewPage for legacy bad rows.
5. Repair helper + dry-run script; do not auto-mutate live DB in deploy.

## No-parallel-stack proof

Reuses `llmGateway`, existing `sanitizeStoreSlogan`, and draft/publish paths. No new Performer/AI runtime.

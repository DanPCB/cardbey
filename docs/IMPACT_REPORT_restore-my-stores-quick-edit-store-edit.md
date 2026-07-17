# Impact Report — Restore Quick Edit + Store Edit on My Stores

**Date:** 2026-07-17  
**Goal:** Restore entry points into (1) Store Draft Review quick-edit UI and (2) Website Preview store editing mode.

## Target surfaces (from screenshots)

| Label | Destination | UI |
|-------|-------------|-----|
| **Quick edit** | `/app/store/draft/review?draftId=…` | MI Assistant + categories + “Tap a card to edit quickly” |
| **Store Edit** | `/preview/website/:draftId` | Choose a style + Change hero / avatar / Replace menu |

## What could break

1. Published stores without a draft row: Store Edit/Quick edit must fall back safely (toast + catalog or published edit fallback).
2. Extra navigations must not auto-publish or change live content.
3. Draft-only cards already use Continue editing — renaming/adding must not drop `generationRunId`.

## Why

My Stores currently only offers Manage catalog / Open dashboard / View storefront (published) or Continue editing (draft). Website editor and draft-review quick-edit have no account-level entry.

## Impact scope

- `MyStoresPage.tsx` (+ small helpers)
- Reuses `buildDraftReviewUrl`, `resolveCommittedStoreWebsiteEditorTarget`, `buildWebsitePreviewOwnerUrl`
- Optional Catalog header links for the selected store

## Smallest safe patch

1. Published card: **Quick edit** → resolve draft then draft review; **Store Edit** → website editor target.
2. Draft card: **Quick edit** (draft review); **Store Edit** (website preview by draftId).
3. Keep Manage catalog; no publish/API mutation from these buttons.

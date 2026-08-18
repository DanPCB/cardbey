# Impact Report: Prefer OCR over BUE + unlock sticky form on upload create-store

**Date:** 2026-08-13  
**Worktree:** `cardbey-wt-store-gen-p2`  
**Status:** ACK requested via user "proceed"

## Problem (live UI)

After End mission / new upload (TAI CHINH, PTH Furniture), Performer still kicked off **Create store: Mộc**. Same class as Coffee sticky after NOODLE/Handyman.

## Root causes

1. **`extractEvidenceBusinessName` prefers BUE brand over OCR lines** — wrong inventable brand can win.
2. **`formLocked` when `storeCreateForm.storeName` is set** — sticky UI form (prior mission name) disables `applyUploadEvidenceIdentityPreference`, so OCR never overrides Mộc/Coffee.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Form name ignored on upload create | We unlock form when OCR conflicts | Only unlock on upload-driven + hard identity conflict |
| BUE-only cards with empty OCR | Prefer OCR only when OCR yields a brand line | Fall back to BUE when OCR empty |
| False conflict (abbrev vs full name) | `identitiesHardConflict` token overlap | Existing helper; tokens overlapping = no conflict |

## Impact scope

- Upload-driven create_store handoff / TurnBelief evidence name
- Not: plain form submit without upload, publish, campaigns

## Smallest safe patch

1. `extractEvidenceBusinessName`: derive OCR name first; use BUE only if no OCR brand, or if BUE does not hard-conflict with OCR (prefer OCR on conflict).
2. `resolveCreateStoreHandoffFields`: on upload-driven turns, if form name hard-conflicts with OCR/evidence name, treat form as **not locked** so preference applies.
3. TurnBelief goal: when upload-driven and userMessage is generic, pass sticky `params.storeName` / form name as goal so conflict still surfaces if evidence wins inconsistently — optional if (2) is enough.

## Tests

- Unit: OCR vs conflicting BUE → OCR name
- Unit: upload + formLocked Mộc + OCR PTH → businessName PTH
- Existing five-business matrix + P1 TurnBelief tests

# MI Phase 1 UX — Impact Report (Safe + Reversible)

## STEP 0 — RISK CHECK

### Files to touch (no spine/backend)

| File | Purpose |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` | Gate plumbing behind `showDevDebug`; minimal status for normal users; contextual suggestions; hero suggestion can open modal via callback. |
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miSuggestions.ts` | `getSuggestionsForMode`: global → return max 2 (or []); product/category unchanged. |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx` | Hero chip: when `onOpenHeroModal` provided, call it (open hero modal) instead of opening panel. Optional label/tooltip "Change hero". |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Pass `onOpenHeroModal` to MICommandBar and MIHelperPanel; add `data-testid="hero-avatar-modal"` to branding modal; ref for hero modal callback if needed. |
| `docs/MI_UNIFIED_HELPER.md` | Phase 1 UX rules + rollback list. |
| `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` | Tests: non-debug hides plumbing; debug shows console; hero chip opens modal; progress row not rendered when no job. |

### Spine and backend — CONFIRMED UNTOUCHED

- **POST /api/mi/orchestra/start** — not modified; not called from changed code.
- **GET /api/stores/temp/draft?generationRunId** — not modified.
- **PATCH /api/draft-store/:draftId** — not modified (still only via MI executor gates).
- **POST /api/store/publish** — not modified.
- **GET /api/store/:id/preview** — not modified.

No new API endpoints. No new polling/intervals (only existing single setTimeout for progress auto-hide). No request/response shape changes.

### Risk summary

- **Low risk:** UI-only; all changes are gating, callbacks, or test/docs. Hero chip and hero suggestion route to existing "Change hero & avatar" modal (no new backend or orchestration).
- **Reversible:** Single commit or file-level revert per section below.

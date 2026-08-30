# Golden Path Day 4 Gate — Result-First Post-Create

**Gate ID:** `CARDBEY_V1_GOLDEN_PATH_DAY4_RESULT_FIRST_READY`  
**Baseline:** Day 3 `CARDBEY_V1_GOLDEN_PATH_DAY3_INTELLIGENCE_FIRST_INTAKE_READY` (staging `121472ea6`)

## Completion flow trace (before)

```
Performer intake → store_mission_started
  → deferred pipeline (structured_store_build → brand_assets checkpoint → analyze_store)
  → draftStore.status = ready (finalizeDraft)
  → inline iframe preview in Performer execution panel
  → user stays on /app?missionId=… (terminal completion chat)
```

**Gap:** Usable draft existed while mission could be `awaiting_input` at brand-assets, but user remained on Performer terminal UI.

## Chosen source of truth

| Signal | Authority |
|--------|-----------|
| Draft ready | `GET /api/public/store/temp/draft` → `status === 'ready'` + `draftId` |
| Pipeline hint | `storeDraftReviewReady` on mission pipeline state |
| **Not used alone** | `mission.status === completed` |

## Result surface selected

**Primary:** `/preview/website/:draftId` via `buildWebsitePreviewOwnerUrl`  
- Shows business name, hero, about, catalog sections  
- `returnTo=/app?missionId=…` preserves Performer correction access  

**Store-catalog intent:** `/app/store/draft/review?mode=draft&jobId=…` when `intentMode === 'store'` and `jobId` present.

## Implementation decisions

1. **`assessStoreResultReadiness`** — lightweight pre-reveal gate (identity, draft ready, no build failure)
2. **`attemptStoreResultReveal`** — session-deduped navigation + telemetry (`draft_ready_at`, `result_reveal_at`, `reveal_delay_ms`, `result_route`)
3. **Hook: `commitStoreDraftPreviewFromPipelineState`** — reveals as soon as build completes (includes brand-assets `awaiting_input`)
4. **Hook: terminal completion + draft poll** — fallback when terminal path runs first
5. **No core / intake / Day 1–3 changes**

## Files changed

- `src/lib/storeLaunch/assessStoreResultReadiness.ts` (new)
- `src/lib/storeLaunch/storeResultReveal.ts` (new)
- `src/lib/storeLaunch/*.test.ts` (new)
- `src/app/console/performer/storeDraftPreviewCommit.ts`
- `src/app/console/performer/waitForDraftPreview.ts`
- `src/app/console/performer/usePerformerConsole.ts`
- `scripts/golden-path-day4-staging-verify.mjs` (new)

## Before / after

| Scenario | Before | After |
|----------|--------|-------|
| Draft ready + brand-assets checkpoint | Inline preview in Performer; user on `/app` | Auto-navigate to `/preview/website/:draftId` |
| Draft still generating | Progress in Performer | No redirect (readiness gate blocks) |
| Build failed | Error in Performer | No redirect |
| User wants to edit | Manual CTA / inline preview | `returnTo` → Performer with missionId |

## Tests (local)

```
✓ assessStoreResultReadiness.test.ts (6)
✓ storeResultReveal.test.ts (5)
```

Covers: ready draft navigation, awaiting_input + ready draft, incomplete/failed block, dedup, route resolution.

## Live staging

Run after dashboard + core staging deploy:

```bash
node scripts/golden-path-day4-staging-verify.mjs
node scripts/golden-path-day3-staging-verify.mjs
node scripts/v1-promo-capture-check.mjs --full
```

| Case | API readiness | Browser reveal |
|------|---------------|----------------|
| A Market Lane Coffee | PENDING | PENDING |
| B URL-only | PENDING | PENDING |
| C Description-only | PENDING | PENDING |
| D Brand-assets checkpoint | PENDING | PENDING |
| E Incomplete build | PENDING | PENDING |

## Promo compatibility

PENDING — run `v1-promo-capture-check.mjs --full` after deploy.

## Known limitations

- Browser navigation proof requires dashboard staging deploy (API script validates draft-ready + expected route only)
- Guest sessions: same reveal path; guest storage handoff unchanged
- No Day 5 “Improve with AI” CTA

## Verdict

**CARDBEY_V1_GOLDEN_PATH_DAY4_PARTIAL** — implementation + local tests complete; live staging proof PENDING deploy.

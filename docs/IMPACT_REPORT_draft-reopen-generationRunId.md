# Impact Report — Draft reopen with generationRunId-only URL

**Date:** 2026-07-17  
**Symptom:** Continue editing lands on `/app/store/draft/review?mode=draft&generationRunId=…` without `draftId`, then “We couldn't reopen the exact store editing session.”

## Console noise (not the root cause)

| Message | Verdict |
|---------|---------|
| Stripe `m.stripe.network` blocked by Enhanced Tracking Protection | Browser privacy feature — ignore |
| CORS `store-engagement/stream/store/…` status `(null)` | EventSource network blip / Core cold start; engagement is soft-fail and does not gate draft review |

## What could break

1. Invalid generationRunId still shows recovery (correct).
2. Extra one-shot GET `/stores/temp/draft?generationRunId=` before draft-first load.

## Smallest safe patch

When draft mode has `generationRunId` and no `draftId`, resolve `draftId` from temp draft API and replace URL with canonical `buildDraftReviewUrl({ draftId, generationRunId })`, then let existing draft-first loader run.

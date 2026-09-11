# FOLLOW-UP — Global activity-row projection V2

**Status:** Deferred (not blocking Business Space Social V1)  
**Flag:** `GLOBAL_ACTIVITY_ROW_PROJECTION_V2 = DEFERRED`

## Current V1 (locked)

`GLOBAL_ELIGIBLE` Space updates bump `Business.publishedAt` so the **store card** ranks higher on `GET /api/public/stores/feed`.  
Space shows the `SPACE_UPDATE` card; Global does **not** emit a standalone activity feed row keyed by `StoreActivityEvent.id`.

Doc: `docs/SPACE_POST_GLOBAL_PROJECTION_V1.md`

## Future V2 question

Whether Business Space `StoreActivityEvent` rows should appear as first-class Global feed artifacts with the same activity ID.

Do not implement in Social V1.

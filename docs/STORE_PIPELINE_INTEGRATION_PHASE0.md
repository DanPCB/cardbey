# Store pipeline integration points (Phase 0)

## Current endpoints (no code changes in this doc)

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| POST /api/draft-store/generate | Create draft + run generation inline (optionalAuth) | draftId, status |
| GET /api/draft-store/:draftId | Get draft by id (optionalAuth for public link) | draftId, status, store, products, categories, preview |
| POST /api/draft-store/create-from-store | Create draft from existing store (requireAuth) | draftId, storeId, status |
| POST /api/draft-store/:draftId/commit | Commit draft to store (optionalAuth) | — |

DraftStore model: id, status ('draft'|'generating'|'ready'|'failed'|'committed'|'abandoned'), generationRunId?, input (JSON), preview (JSON), ownerUserId?, etc.

Services: createDraft({ mode, input, meta }), generateDraft(draftId, { userId }) in draftStoreService.js. Status transitions via kernel transitionDraftStoreStatus.

## Phase 0 additions

| Step | API | Notes |
|------|-----|------|
| validate-context (store Phase 0) | POST /api/draft-store (create only) | Body: name?, category?, missionId?. Creates row status 'draft'. Returns draftStoreId. requireAuth. |
| execute-tasks (store Phase 0) | POST /api/draft-store/:draftStoreId/generate | Runs generateDraft(draftId). Bounded wait or 202 + poll. requireAuth, owner check. |
| PhaseOutputs | GET /api/draft-store/:draftStoreId/summary | Read-only summary: status, businessName, category, productCount, categoryCount, imageCount, heroImageUrl?, missingImagesCount?, updatedAt. requireAuth. |

## Step → API mapping

- **validate-context (store, no jobId):** POST /api/draft-store with { name, category, missionId } → save artifacts.draftStoreId (and artifacts.draftId).
- **execute-tasks (store, draftStoreId, no jobId):** POST /api/draft-store/:draftStoreId/generate → poll GET summary until status in ['ready','failed'] or 60s → save storeGenerationRunId if returned.
- **report (store):** No API; PhaseOutputs shows "Next: publish (Phase 1)".

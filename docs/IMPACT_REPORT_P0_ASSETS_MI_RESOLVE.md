# P0 Fix: Assets Photo Search + MI Resolve 501 — Risk Assessment & Summary

## 0) Risk assessment (before coding)

**Store creation spine:** No changes to:
- POST /api/mi/orchestra/start, GET /api/stores/temp/draft, PATCH /api/draft-store/:draftId, POST /api/store/publish, GET /api/store/:id/preview

**Planned touch points:**
- **Core `src/routes/assets.js`** — GET /api/assets/photos only. Not part of store creation. Add `tags` to response, add `total`, optionally add static "roses" entry. No contract change for spine.
- **Core `src/routes/miRoutes.js`** — POST /api/mi/resolve only. Change 501 → 200 with minimal JSON. Spine uses /api/mi/orchestra/start and /orchestra/job, not /resolve. No spine impact.
- **Dashboard `src/lib/api/assets.ts`** — Response normalization + include tags in client-side relevance. Used only by Content Studio Assets panel. No shared fetch/baseURL used by store creation.
- **Dashboard `src/api/mi.api.ts`** — resolveMI: catch 501, return safe fallback. Callers (PropertiesPanel, PromotionPreview) are Content Studio only; no store creation flow uses resolveMI.
- **Dashboard PropertiesPanel.tsx** — Assets panel state + photoProviderError. No change to draft/store API calls.

**Conclusion:** No risk to store creation spine. Changes are scoped to Assets search and MI resolve only.

---

## Delivered changes

- **Assets:** Core returns `tags` and `total`; static entries for "roses"/flowers added; dashboard normalizes `results`/`items`/`photos` and uses `tags` in relevance; provider-not-configured shows clear message.
- **MI resolve:** Core returns 200 with minimal `ok: true`, intent, actions, renderHints; dashboard resolveMI catches errors and returns safe fallback.
- **Tests:** Core `assets.photos.routes.test.js`, `mi.resolve.routes.test.js`; dashboard `assetsPhotosSearch.test.ts`.
- **Doc:** `docs/ASSETS_PHOTOS_API.md` (response shape, PEXELS_API_KEY).

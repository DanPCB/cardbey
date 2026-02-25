# Assets Photos API (Core + Dashboard)

## Core: GET /api/assets/photos

- **Query params:** `q` (search), `page`, `perPage`.
- **Response shape (stable):**
```json
{
  "ok": true,
  "provider": "pexels",
  "query": "",
  "page": 1,
  "perPage": 24,
  "total": 8,
  "results": [
    {
      "id": "static-0-...",
      "type": "photo",
      "thumbUrl": "https://...",
      "fullUrl": "https://...",
      "photographer": "...",
      "attributionText": "...",
      "tags": ["roses", "flowers"]
    }
  ]
}
```
- **When provider not configured:** Core currently uses static curated results only. To enable live Pexels search, set **PEXELS_API_KEY** in the core app environment (e.g. `.env`). If you add a live Pexels path and the key is missing, return `{ "ok": false, "error": { "code": "provider_not_configured", "message": "..." } }` with 400/501 so the dashboard can show "Photo provider not configured" instead of "No photos found".

## Dashboard

- Uses Core proxy only; no frontend API keys. Search calls `GET /api/assets/photos?q=...&page=1&perPage=24`.
- Accepts response with `results`, `items`, or `photos` and normalizes to a single list. Relevance filtering uses `tags` when present so queries like "roses" match backend tag `roses` or `flowers`.

## PEXELS_API_KEY (optional)

- **Where:** Core app env (e.g. `apps/core/cardbey-core/.env`).
- **Value:** Your Pexels API key from https://www.pexels.com/api/.
- If unset, core continues to return static results; dashboard still shows them when the query matches (e.g. tags).

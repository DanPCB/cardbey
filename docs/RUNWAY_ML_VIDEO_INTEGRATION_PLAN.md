# Runway ML API – Video Creation Integration Plan

This document outlines a plan to integrate **Runway ML API** into Cardbey for AI-powered video creation (text-to-video, image-to-video). It follows the project’s Development Safety Rule: minimal, local changes and a clear impact scope.

---

## 1. Overview

**Goal:** Allow Cardbey users to generate short marketing/promo videos via Runway ML (e.g. from text prompts or from an image + text), then use those videos in existing flows (signage, promos, content studio).

**Runway API (relevant for video):**

| Endpoint | Purpose |
|----------|--------|
| `POST /v1/text_to_video` | Generate video from text only (models: gen4.5, veo3.1, veo3.1_fast, veo3) |
| `POST /v1/image_to_video` | Generate video from image + text (models: gen4.5, gen4_turbo, veo3.1, gen3a_turbo, etc.) |
| Task model | Each call returns `{ "id": "<taskId>" }`; output is obtained by polling task status until completion |

**Auth & version:**

- `Authorization: Bearer <RUNWAYML_API_SECRET>`
- `X-Runway-Version: 2024-11-06`

**Existing patterns in Cardbey:**

- **AI images:** `routes/aiImages.js` + OpenAI; env `OPENAI_API_KEY`; mounted at `/api/ai/images`.
- **External APIs:** `services/menuVisualAgent/pexelsService.ts` (env `PEXELS_API_KEY`), optional feature when key is set.
- **Async jobs:** Core uses job IDs + polling (e.g. `useJobPoll`, SSE); dashboard calls core via `apiPOST`/`apiGET`.
- **Media storage:** Upload → S3 via `lib/s3Client.js`; public URLs via `utils/publicUrl.js`.

---

## 2. High-Level Architecture

- **Backend (cardbey-core):** New Runway service + routes. No change to existing auth, draft, or publish flows.
- **Frontend (dashboard):** New UI to trigger video generation and show status/result; reuse existing API client and (optionally) job-polling patterns.
- **Security:** Runway API key only on the server; never exposed to the client.

```
Dashboard                    Core API                      Runway ML
   |                            |                              |
   | POST /api/runway/video      |                              |
   | (prompt / image + prompt)   |------------------------------>| POST /v1/text_to_video or image_to_video
   |                            |<------------------------------| 200 { id: taskId }
   | 202 { taskId }              |                              |
   |                            |  (poll or wait)               |
   | GET /api/runway/video/:id   | GET Runway task status       |
   |                            |------------------------------>|
   |                            |<------------------------------| output URL
   | 200 { status, outputUrl }   | (optional: download → S3)    |
   |                            |                              |
```

---

## 3. Backend Plan (cardbey-core)

### 3.1 New dependency

- Add **`@runwayml/sdk`** in `apps/core/cardbey-core/package.json` (optional at runtime if you gate by `RUNWAYML_API_SECRET`).

### 3.2 Environment

- **`RUNWAYML_API_SECRET`** (optional): When set, Runway video features are enabled; when unset, endpoints return 503 or a clear “not configured” response (same pattern as Pexels/OpenAI).

### 3.3 New service: `services/runway/runwayVideoService.js` (or `.ts`)

- **`createTextToVideo({ promptText, model?, ratio?, duration?, seed? })`**  
  - Call Runway `POST /v1/text_to_video` (or SDK equivalent).  
  - Return `{ taskId }`.  
- **`createImageToVideo({ promptText, promptImage, model?, ratio?, duration?, seed? })`**  
  - `promptImage`: HTTPS URL or data URI (Runway accepts both).  
  - Call Runway `POST /v1/image_to_video`.  
  - Return `{ taskId }`.  
- **`getTaskStatus(taskId)`**  
  - Call Runway task status endpoint (or use SDK’s polling helper).  
  - Return `{ status, outputUrl? }` (or equivalent; map Runway’s response to a simple shape).  
- **`isRunwayAvailable()`**  
  - Return `process.env.RUNWAYML_API_SECRET != null`.  
- Use **single source of truth**: one service module that all routes use; no duplicate Runway logic elsewhere.

Implementation details:

- Use **`@runwayml/sdk`** if it provides `client.textToVideo.create(...).waitForTaskOutput()` (or similar) to hide polling; otherwise use `node-fetch` with `X-Runway-Version` and `Authorization` and poll until terminal state.
- Timeouts: set a generous timeout for “wait for output” (e.g. 300s) and return a clear error on timeout.
- Rate limits: Runway returns 429; surface as 503 or 429 to the client with a clear message.

### 3.4 New routes: `routes/runwayVideo.js`

- **`POST /api/runway/video`** (auth required)  
  - Body: `{ type: 'text' | 'image', promptText, promptImage? (required if type === 'image'), model?, ratio?, duration? }`.  
  - Validate with Zod (promptText length 1–1000, ratio enum, duration 2–10).  
  - If `!isRunwayAvailable()` → 503 with `{ ok: false, error: 'runway_not_configured' }`.  
  - Call `createTextToVideo` or `createImageToVideo`; return `202 { ok: true, taskId }`.  

- **`GET /api/runway/video/:taskId`** (auth required)  
  - Call `getTaskStatus(taskId)`; return `{ ok: true, status, outputUrl? }` or 4xx/5xx with a clear error.  

- **`GET /api/runway/health`** (optional, for feature flag / UI)  
  - Return `{ ok: true, available: isRunwayAvailable() }`.  

Mount in **`server.js`**:  
`app.use('/api/runway', runwayVideoRoutes);`

### 3.5 Optional: persist output to S3

- After task completes, **optional** server-side step: `GET outputUrl` → stream to S3 → store in existing bucket/path pattern (e.g. same as other uploads) and return that S3 URL in `GET /api/runway/video/:taskId` so Cardbey owns the asset long-term.
- If not implemented in v1, the API can return Runway’s `outputUrl` only; document that it may be temporary and advise copying to S3 or re-downloading in a later phase.

---

## 4. Frontend Plan (dashboard)

### 4.1 API client

- New file: **`api/runwayVideo.api.ts`** (or under `features/.../api/`).  
  - `createVideo(payload)` → `apiPOST('/api/runway/video', payload)` → returns `{ taskId }`.  
  - `getVideoStatus(taskId)` → `apiGET('/api/runway/video/' + taskId)` → returns `{ status, outputUrl? }`.  
  - `getRunwayHealth()` → `apiGET('/api/runway/health')` (optional).

### 4.2 UI placement (minimal safe options)

- **Option A – Content Studio / AI panel:** Add a “Generate video” action that opens a small form (text prompt; optional image URL or upload). On submit → `createVideo` → poll `getVideoStatus(taskId)` (reuse pattern similar to `useJobPoll` or a simple `useEffect` poll) → show progress and then preview + “Use in project” when `outputUrl` is present.
- **Option B – Signage / MI flows:** “Create video from prompt” as an asset source alongside existing templates; same backend, different entry point in the UI.
- **Option C – Standalone “Runway” page:** Single page under `/runway` or `/tools/runway` for testing and power users; can be extended later.

Recommendation: start with **Option A or C** so the integration is contained and does not change existing promo/signage/draft behavior until you explicitly wire it in.

### 4.3 Feature flag (optional)

- Use existing feature-flag system to show “Runway video” only when enabled; backend already gates by `RUNWAYML_API_SECRET`.

---

## 5. Security & Configuration

- **API key:** Only in server env (`RUNWAYML_API_SECRET`). Never send it to the client or log it.
- **Input validation:** Server validates prompt length (1–1000 chars), ratio enum, duration 2–10; reject invalid payloads with 400.
- **Auth:** All `/api/runway/*` routes behind existing auth middleware (e.g. `requireAuth`), same as `/api/ai/images` and MI routes.
- **Rate limiting:** Consider reusing existing rate-limit middleware for `POST /api/runway/video` to avoid Runway 429 and cost spikes.

---

## 6. Risk & Impact (Development Safety)

| Risk | Mitigation |
|------|-------------|
| Runway API change (version/contract) | Pin `X-Runway-Version: 2024-11-06`; single service module so only one place to update. |
| Breaking existing flows | New routes and new UI only; no changes to draft, publish, signage, or promo save logic. |
| Cost / quota | Gate by env; optional rate limit and feature flag; document Runway pricing for the team. |
| Long-running requests | Prefer async: return 202 + taskId, poll for status; avoid long-held HTTP requests. |
| Reliance on Runway URL expiry | Optional S3 persistence step; document that outputUrl may be temporary if not copied. |

**Impact scope:** Runway integration is additive. Affected areas are only the new service, new routes, and new (or optionally feature-flagged) UI. Existing auth, store draft, promo, signage, and content studio behavior remain unchanged.

---

## 7. Smallest Safe Implementation Order

1. **Backend service**  
   - Add `RUNWAYML_API_SECRET` to env example (no default).  
   - Implement `runwayVideoService` with `createTextToVideo`, `createImageToVideo`, `getTaskStatus`, `isRunwayAvailable`.  
   - Use `@runwayml/sdk` or direct HTTP with polling; no UI yet.

2. **Backend routes**  
   - Add `routes/runwayVideo.js` with POST and GET above; mount at `/api/runway`; protect with `requireAuth`.  
   - Validate body with Zod; return 503 when Runway is not configured.

3. **Dashboard client**  
   - Add `api/runwayVideo.api.ts` with `createVideo` and `getVideoStatus` (and optionally `getRunwayHealth`).

4. **Dashboard UI (minimal)**  
   - Add a single entry point (e.g. Content Studio AI panel or standalone page) that:  
     - Calls `createVideo` with prompt (and optional image).  
     - Polls `getVideoStatus` until terminal state.  
     - Displays result and optional “Copy URL” or “Use in project” (without changing existing save flows in v1).

5. **Optional follow-ups**  
   - Persist Runway output to S3 and return that URL from `GET /api/runway/video/:taskId`.  
   - Add rate limiting and feature flag.  
   - Integrate “Use video” into existing content/signage flows with a second, small change set and impact check.

---

## 8. Runway API Quick Reference

- **Base URL:** `https://api.dev.runwayml.com` (or production base per Runway docs).
- **Text-to-video:** `POST /v1/text_to_video` — `model`, `promptText`, `ratio` (e.g. `1280:720`), `duration` (2–10).
- **Image-to-video:** `POST /v1/image_to_video` — `model`, `promptText`, `promptImage` (URL or data URI), `ratio`, `duration`.
- **Task status:** Use SDK’s `waitForTaskOutput()` or Runway’s task GET endpoint (see [Runway API docs](https://docs.dev.runwayml.com/api)) to get output URL.
- **Version header:** `X-Runway-Version: 2024-11-06` on all requests.

---

## 9. Docs and Checklist

- [ ] Add `RUNWAYML_API_SECRET` to `.env.example` (or internal env wiki) with a short comment.
- [ ] Update this plan when you add S3 persistence or new Runway endpoints (e.g. video-to-video).
- [ ] Before going live: confirm Runway pricing/quotas and set rate limits if needed.

This plan is the **smallest safe patch** for adding Runway ML video creation to Cardbey without changing existing behavior. Proceed with implementation in the order above; if you need to change auth, draft, or publish flows, generate a separate impact report first per the Development Safety Rule.

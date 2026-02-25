# Step 8 — Risk / Breakage Audit (working notes)

## Spine (unchanged)

- **POST /api/mi/orchestra/start** — not called by Step 8.
- **GET /api/stores/temp/draft?generationRunId** — read-only; used only when generationRunId in context; no shape change.
- **PATCH /api/draft-store/:draftId** — **only** endpoint we add for writes; already exists; we send a merge-friendly body `{ preview: { items: [...] } }` (tags only). No new route.
- **POST /api/store/publish** — forbidden; not called.
- **GET /api/store/:id/preview** — not touched.

## What could break

- **Backend PATCH contract:** If backend rejects our patch shape, PATCH will fail; we surface error and do not retry or change other flows. Mitigation: use minimal merge (preview.items with tags only); no new required fields.
- **Draft reload:** After PATCH, existing draft review may need refetch to show tags; that is existing behavior (user can refresh). We do not change how draft is loaded elsewhere.

## Isolation

- Changes are in: miExecutorWriteGate (new), miHttp (add miPatch), miExecutor (RealExecutor tags path), MIHelperPanel (messaging), tests, docs. sendMI and spine entry points unchanged except executor result handling already in place.
- No new polling/timers; no calls to /run or /publish.

## Confirmation

- Step 8 is isolated to MI executor and panel Send path only.
- Real mode write is gated: executor mode real AND write gate true; default both off.

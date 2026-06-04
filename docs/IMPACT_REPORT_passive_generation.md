# Impact Report — Passive Intent-to-Artifact Pipeline (Foundation Phase)

**Status:** Additive foundation layer. Low risk. No runtime/FSM refactor.

## What is being added

Self-contained passive generation pipeline under `src/lib/passiveGeneration/` plus
`POST /api/passive-generation/run` (advisory only).

### New files (all additive)
- `passiveGenerationTrace.ts`
- `acquisitionSourceRegistry.ts`
- `intentGapAnalyzer.ts`
- `acquisitionCoordinator.ts`
- `externalDataFusion.ts`
- `confidenceResolver.ts`
- `artifactExposurePlanner.ts`
- `passiveGenerationPipeline.ts`
- `index.ts`
- `passiveGenerationRoutes.js`
- `passiveGenerationPipeline.test.ts`

### Existing files (minimal additive edits)
- `src/server.js` — import + mount `/api/passive-generation`

## (1) What could break
- **Nothing in existing flows.** New prefix only; no changes to publish, auth, or FSM.
- Reuses existing services read-only: `businessDiscovery`, `VideoSearchService`, menu extract types.

## (2) Why it is safe
- Phase 1 constraints enforced in pipeline: **advisory/read-only acquisition**, **no autonomous publishing**, **no owner claims**, **no background crawling**, **`confirmationRequired` before public generation**.
- Acquisition only hits permitted sources (same ethics as business discovery + configured media APIs).

## (3) Impact scope
- New API + library only. Performer can consume pipeline output via HTTP; no agent pipeline edits in this phase.

## (4) Smallest safe patch
- Add modules + one route file + two lines in `server.js`.

---

## UI integration reverted / deferred (2026-06)

**Decision:** Passive Generation must run as an underground/background data agent. It must **not**
interrupt the seller store-creation runway in Performer.

**What was reverted (frontend only):**
- `PassiveGenerationSummaryCard` removed from the main Performer stream when `VITE_PASSIVE_GENERATION_UI_ENABLED=false` (default).
- No `/api/passive-generation/run` call on seller intake (`Create a mini website`, store form chips, etc.).
- No visible analysis text (confidence, missing fields, acquisition progress, sources).

**What remains:**
- Backend `src/lib/passiveGeneration/*` and `/api/passive-generation/*` endpoints unchanged.
- Re-enable UI only for future **consumer/general** flows (scan/upload, supplier demand, passive artifacts) via `VITE_PASSIVE_GENERATION_UI_ENABLED=true`.
- Dev-only `maybeSchedulePassiveGenerationBackgroundWork` placeholder — no-op today; does not block `create_store`.

**Flag:** `VITE_PASSIVE_GENERATION_UI_ENABLED=false` in `.env.example`.

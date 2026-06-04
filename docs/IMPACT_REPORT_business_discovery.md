# Impact Report — Business Discovery / Ingestion Layer (Phase 1)

**Status:** Additive feature. Low risk. No schema migrations. No changes to existing
auth / routing / publish contracts.

## What is being added

A self-contained discovery layer that lets Cardbey surface public business data and
create an **unclaimed** business profile/channel before the owner builds one.

### Backend (all new files, additive)
- `src/lib/businessDiscovery/businessDiscoveryTypes.ts`
- `src/lib/businessDiscovery/businessSourceAttribution.ts`
- `src/lib/businessDiscovery/businessClaimStatus.ts`
- `src/lib/businessDiscovery/businessDataNormalizer.ts`
- `src/lib/businessDiscovery/businessEntityResolver.ts` (dedup by name+phone+location+website)
- `src/lib/businessDiscovery/businessDiscoverySources.ts` (Google Places API if configured,
  user-supplied website/schema.org extraction, manual input)
- `src/lib/businessDiscovery/businessDiscoveryRepository.ts` (JSON-file persistence — no DB migration)
- `src/lib/businessDiscovery/index.ts`
- `src/routes/discoveryRoutes.js`

### Backend (1 existing file, minimal additive edit)
- `src/server.js` — two lines: `import discoveryRoutes` + `app.use('/api/discovery', discoveryRoutes)`.

### Frontend (marketing dashboard)
- `src/lib/businessDiscoveryApi.ts` (new API client)
- `src/pages/business/BusinessDiscoveryPanel.tsx` (new self-contained component)
- `src/App.jsx` — one new route line (additive)
- `src/pages/business/BusinessEntryRuntimePage.tsx` — one "Discover existing business" link (additive)

## (1) What could break
- **Nothing in existing flows.** New endpoints live under a new prefix `/api/discovery`.
  No existing route, middleware, or DB model is modified.
- The only existing-file edits are additive (a route mount + an import + a UI link + a route).

## (2) Why it is safe
- **No Prisma schema change.** Unclaimed discovery records are intentionally NOT written to
  the `Business` table (which requires a real `userId` owner and would imply ownership).
  They are stored in a JSON repository under `data/businessDiscovery/`. This keeps external,
  unverified data fully separated from owner-confirmed records.
- Discovery never marks data as owner-confirmed. Every record stores source attribution and
  a `claimStatus` of `unclaimed` / `pending_verification` / `claimed`.
- Channel generation reuses the existing, unchanged `createBuildStoreJob` service and only runs
  for authenticated users (same contract as `POST /api/business/create`).

## (3) Impact scope
- New surface only: `/api/discovery/*` and one new frontend panel/route.
- Existing business creation, auth, publish, and store flows are untouched.

## (4) Smallest safe patch
- Add new modules + one new route file; mount with two additive lines.
- No migration, no edits to shared types/contracts, no changes to existing endpoints.

## Ethics / safety guardrails (built in)
- **No Google page scraping.** Google data only via the official Places API (used only when
  `GOOGLE_PLACES_API_KEY` is configured). Website extraction only runs on URLs the user supplies.
- Source + sourceUrl + confidence stored on every candidate.
- Low-confidence candidates are imported as `draft` only.
- Owner must verify (claim) before editing as official owner.

## Deferred (needs confirmation before touching complex files)
- Deep Performer agent wiring ("Create a Cardbey page for MC Hair Salon" → auto-search) touches
  the performer chat/agent pipeline. The backend endpoints are ready for it; the agent hook is
  left as a documented integration point to avoid risky edits to the agent pipeline.

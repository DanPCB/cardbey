# Impact Report — Promote Resource Use + Federation V1 to main/live

**Date:** 2026-08-09  
**Request:** Deploy staging Library Use this + External Resource Federation V1 to live.

## Root cause on live

Live lacked **Universal Library Resource Use V1** (URI bridge + Use this UI). Federation intake alone cannot make “Use this” work without that stack.

## What could break

1. Core deploy without URI reuse tables → run `ensure-uri-reuse-tables.mjs` if routes error.
2. Prod DB has fewer Openverse/Wikimedia rows than staging until Sync now.
3. Missing `PEXELS_API_KEY` / Wikimedia User-Agent → provider MISCONFIGURED / DEGRADED (truthful).

## Smallest safe patch

Promote Resource Use + Federation from staging onto `main`; keep Originals absolute media URLs; expose `rightsStatus` on public Library DTO for Use this truth.

## Ops after merge

1. Deploy Core + Dashboard from `main`.  
2. Env: `PEXELS_API_KEY`, `ENABLE_FIRST_EXTERNAL_PROVIDER_V1=true`, `WIKIMEDIA_USER_AGENT` or `WIKIMEDIA_CONTACT`, URI flags as on staging.  
3. Optional: `node scripts/ensure-uri-reuse-tables.mjs`.  
4. Sources → Sync Openverse/Wikimedia.  
5. `cardbey.com/library` → Use this on a federated image.

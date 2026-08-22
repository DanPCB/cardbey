# Impact Report — Universal Library Resource Use V1

**Date:** 2026-08-08  
**Branch:** `feat/ul-resource-use-v1`  
**Audit:** `docs/AUDIT_UNIVERSAL_LIBRARY_RESOURCE_USE_V1.md`

## What could break

1. **Core mount surface** — restoring `/api/resource-intelligence` + URI services increases API surface; flags fail-closed when unset in production.
2. **Draft side effects** — confirmed Use may create inactive playlists / draft artifacts via URI destination adapters (never live publish).
3. **Public asset shape** — `rightsStatus` now included on public UL projection (enum only).
4. **Dashboard Library UX** — detail sheet gains Use this → destination chooser → Performer / draft navigation.

## Why

Library was browse-only. Product needs Find → Preview → Use → Draft without a parallel rights engine. Canonical URI reuse existed historically (`aa9a3f291`) but was missing on staging tip.

## Impact scope

- Core: URI restore, `libraryUseBridge`, `POST /assets/:id/use`, features, server mount
- Dashboard: ResourceDetailSheet, UseThisDestinationSheet, libraryResourceUse client, telemetry, Performer origin
- Ops: ensure URI flags + optional `ensure-uri-reuse-tables.mjs`

## Smallest safe patch

1. Restore URI from `aa9a3f291` (no rewrite of rights).  
2. Bridge UL asset → URI session/select/confirm → `materializeDestination`.  
3. Library UI: Use this chooser + Performer structured handoff.  
4. Save remains deferred (no new bookmark DB).  
5. No provider binary download; `binaryStored: false`.

## No-parallel-stack proof

Reuse validation and draft materialization call **existing** `selectResourceCandidate` / `confirmAndExecuteReuse` / `materializeDestination`. No new ExternalResourceUse store outside URI `reuseRepository`. No Library Assistant.

## Verdict

**UNIVERSAL_LIBRARY_RESOURCE_USE_V1_READY** — contingent on staging/prod enabling URI flags (`ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1`, `ENABLE_URI_REUSE_PILOT_V1`) alongside UL flags. Without those flags, Use destinations fail closed with `uri_reuse_unavailable` (Performer handoff still works).

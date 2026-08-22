# Impact Report — Phase 3 Content Editing Bridge Hardening

## What could break
- Prisma client regenerate / migrate if schemas diverge between sqlite and postgres.
- Existing bridge accept/discard if proposal IDs move from memory to durable store mid-session.

## Why
- Additive `ContentEditProposal` model + bridge service rewrite for durability, expiry, concurrency, audit.

## Impact scope
- Performer content-editing bridge routes/services only (flag default OFF).
- No create-store orchestra, publish path, or Shows public schema changes beyond existing lifecycle.

## Smallest safe patch
- Additive Prisma model + repository; keep API shapes; feature-flag remains fail-closed.

# Isolation manifest — Cloudflare Stream RTMPS pilot

Date: 2026-08-14

## Clean worktree

| Item | Value |
|------|-------|
| Path | `C:/Projects/cardbey-wt-cloudflare-rtmps` |
| Branch | `feat/cloudflare-stream-rtmps-pilot` |
| Base commit SHA | `a2d23913639cf5a8d31c6377b80dcc87271de330` |
| Base ref | `release/live-market-global-live-stg` (staging integration lineage) |

## Unrelated trees left untouched

- `C:/Projects/cardbey` (`fix/upload-ask-presentoptions-storename`, ~337 dirty paths) — **not modified by this batch**
- `C:/Projects/cardbey-wt-live-core` — source of Live Market foundation copy only; not rewritten
- No BI enrichment, Global Live EOI, claim OTP, or multisource packages copied into this worktree

## Live Market foundation restored (exact set)

### New / restored library

- `apps/core/cardbey-core/src/lib/liveMarket/**` (20 files including Cloudflare Slice A adapter + tests)

### Migrations (Live Market only; EOI migrations excluded)

- `prisma/postgres|sqlite/migrations/20260813120000_live_market_phase1_foundation/`
- `prisma/postgres|sqlite/migrations/20260813230000_live_market_storefront_publication/`
- `prisma/postgres|sqlite/migrations/20260814010000_live_market_participant_registration/`
- `prisma/postgres|sqlite/migrations/20260814020000_live_market_question_review_status/`

### Docs / scripts

- `apps/core/cardbey-core/docs/LIVE_MARKET_PHASE1.md`
- `apps/core/cardbey-core/docs/IMPACT_REPORT_LIVE_MARKET_*.md`
- `apps/core/cardbey-core/scripts/live-market-migrate-from-zero.mjs`
- `apps/core/cardbey-core/scripts/live-market-postgres-static-check.mjs`
- `docs/reports/IMPACT_REPORT_CLOUDFLARE_STREAM_RTMPS_PILOT.md`

### Surgical wiring (Live Market only)

- `prisma/schema.prisma`, `prisma/postgres/schema.prisma`, `prisma/sqlite/schema.prisma` — LiveMarket* models + User/Business relations (**no** `GlobalLiveEoi*`)
- `src/config/features.js` — `Features.liveMarket` (+ RTMPS/player/recording flag getters; recording/replay default off)
- `src/server.js` — mount Live Market routes only (no EOI mounts)
- `package.json` — `test:live-market*` scripts
- `.env.example` — Live Market + Cloudflare Stream placeholders (no secrets)
- `src/services/publishedArtifactProjection/resolvePublicStoreList.js` — attach liveMarket summaries

## Explicitly excluded

- `src/lib/globalLiveEoi/**`
- EOI migrations `20260814040000_*`, `20260814220000_*`, `20260814230000_*`
- BusinessCandidate enrichment / BI batch files
- Dashboard submodule changes (deferred to Phase E after core green)

## Proposed RTMPS implementation file manifest (this batch)

### Core provider / lifecycle / auth

- `src/lib/liveMarket/providers/cloudflareStreamConfig.js`
- `src/lib/liveMarket/providers/cloudflareStreamProvider.js`
- `src/lib/liveMarket/providers/cloudflareStreamProvider.test.js`
- `src/lib/liveMarket/providers/cloudflareStreamRedact.js`
- `src/lib/liveMarket/providers/cloudflareNotificationsAuth.js` (new — `cf-webhook-auth`)
- `src/lib/liveMarket/providers/cloudflareNotificationsAuth.test.js` (new)
- `src/lib/liveMarket/providers.js`
- `src/lib/liveMarket/domain.js` / `domain.test.js`
- `src/lib/liveMarket/service.js` / `service.test.js`
- `src/lib/liveMarket/routes.js`
- `src/lib/liveMarket/audit.js`
- `src/lib/liveMarket/reconcile.js` (new)
- `src/lib/liveMarket/reconcile.test.js` (new)
- `src/lib/liveMarket/publicPlayback.js` (new)
- `src/config/features.js`, `.env.example`, `src/server.js`

### Dashboard / public (after core tests)

- Dashboard Live Market control room + player components (separate submodule branch; not from dirty mono index)

### Not in this batch

- Recording persistence / 24h deletion schema hooks
- WHIP/WHEP enablement
- Production Cloudflare credentials

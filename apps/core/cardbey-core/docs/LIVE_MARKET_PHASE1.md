# Cardbey Live Market — Phase 1 Foundation

**Verdicts (after Batch E contract closure):**  
- Backend: `LIVE_MARKET_FOUNDATION_READY_BACKEND`  
- Pilot UI: `LIVE_MARKET_PHASE1_PILOT_UI_READY`  
- Overall: `PARTIAL_PENDING_DEPLOYMENT_VERIFICATION`  
- **Streaming is not operational**  
- Do **not** claim `LIVE_MARKET_FOUNDATION_READY` or pilot-operational broadcast

**Positioning:** Discover globally. Speak naturally. Trade instantly.  
Live Market is a capability of an existing Cardbey store — not a disconnected video app, and not Creator Studio `LIVESTREAM` content.

---

## Batch E — Owner status contract closure

### Status endpoint

`GET /api/stores/:storeId/live-market/status`

Auth: `requireAuth` + `requireStoreOwner` + Live Market master/owner flags.  
Does **not** require active enrolment. Non-owners → 403. Flags off → `LIVE_MARKET_DISABLED`.

Sanitized DTO fields: `enabled`, `storeId`, `enrolled`, `enrollmentState`, `capabilities` (`canCreateDraft`, `canEditDraft`, `canCancel`, `canSchedule`, `canPrepare`, `canStart`), language lists, `automaticReplayPublication`, `retention`, `providerReadiness` (`NOT_CONFIGURED`|`CONFIGURED`), `streamingOperational: false`.

Never exposes actor IDs, audit metadata, provider refs, secrets, or admin notes.

### Capability policy

| Enrolment | Draft create/edit | Cancel | Schedule | Prepare/Start |
|-----------|-------------------|--------|----------|---------------|
| ACTIVE | yes | yes | yes | only if provider configured |
| PAUSED | yes | yes | no | no |
| other / none | no | no | no | no |

Dashboard consumes this status endpoint; mutation probing is removed. Go Live remains hidden.

### Test evidence (Batch E)

- Core `npm run test:live-market`: **39 passed**
- Dashboard Live Market suite: **28 passed**
- `pnpm run build:dashboard`: success
- ESLint TS parse errors match pre-existing parser issues on other TS pages; lint config unchanged

---

## Batch D — Owner / Admin UI (dashboard)

### Routes

| Surface | Route | Gate |
|---------|-------|------|
| Owner | `/dashboard/stores/:storeId/live-market` | `ENABLE_LIVE_MARKET_V1` + `ENABLE_LIVE_MARKET_OWNER_V1` (+ matching `VITE_*`) |
| Admin | `/control-center/live-market` | Master + `ENABLE_LIVE_MARKET_ADMIN_V1` (+ matching `VITE_*`); `PlatformAdminRoute` |

Navigation: store sidebar `live-market`, Control Center governance `governance-live-market`, quick-access via `getControlCenterQuickAccess()` — all hidden when flags are off.

### Required flags (default OFF)

| Flag | Role |
|------|------|
| `ENABLE_LIVE_MARKET_V1` / `VITE_ENABLE_LIVE_MARKET_V1` | Master |
| `ENABLE_LIVE_MARKET_OWNER_V1` / `VITE_ENABLE_LIVE_MARKET_OWNER_V1` | Owner UI + APIs |
| `ENABLE_LIVE_MARKET_ADMIN_V1` / `VITE_ENABLE_LIVE_MARKET_ADMIN_V1` | Admin UI + APIs |
| `ENABLE_LIVE_MARKET_PUBLIC_V1` | Public API only — **no public discovery UI** in Phase 1 |

Backend authorization remains authoritative; UI visibility is not security.

### Screens implemented

**Owner**

- Pilot enrolment + capabilities from **`GET …/live-market/status`** (no mutation probing)
- List drafts / scheduled sessions + authoritative lifecycle state
- Create / edit draft (title, description, source + viewer languages)
- Select catalog Product rows as PRODUCT or SERVICE subjects (no price/checkout duplication)
- Schedule + cancel (server capabilities)
- Truthful provider-not-configured banner; **Go Live / prepare / start hidden**
- `streamingOperational: false` always surfaced

**Admin**

- Health panel: foundation readiness vs operational streaming readiness
- List / create enrolments; permitted state transitions (including pause / remove)
- Inspect sessions

### Known limitations

- No production video / chat / speech / translation / captions / replay UI
- No public Live Market discovery UI
- No operational Go Live experience
- Staging PostgreSQL migration deployment remains **pending**
- SQLite historical migration-chain repair remains **separate**

### Dashboard module map

| Path | Role |
|------|------|
| `src/lib/liveMarket/featureFlags.ts` | UI flags (fail closed) |
| `src/lib/liveMarket/api.ts` | Client including `fetchOwnerLiveMarketStatus` |
| `src/lib/liveMarket/policy.ts` | Display helpers + error copy (caps from server) |
| `src/pages/dashboard/StoreLiveMarketPage.tsx` | Owner UI |
| `src/pages/controlCenter/LiveMarketAdminPage.tsx` | Admin UI |

---

## Test commands (package-local Vitest)

From `apps/core/cardbey-core` (avoids broken monorepo-root `vitest` resolution):

```bash
npm run test:live-market
npm run test:live-market:integration
npm run live-market:migrate-proof
npm run live-market:postgres-static
```

Dashboard (from `apps/dashboard/cardbey-marketing-dashboard`):

```bash
npx vitest run src/lib/liveMarket src/pages/dashboard/StoreLiveMarketPage.test.tsx src/pages/controlCenter/LiveMarketAdminPage.test.tsx src/navigation/canonicalNavBuilders.test.ts src/components/controlCenter/controlCenterRoutes.test.ts
```

Integration tests use disposable DBs under `prisma/.live-market-it/` (gitignored via `*.db`), never `test.db` / `dev.db`.

Auth strategy: real `generateToken(userId)` JWTs + `requireAuth` DB user lookup against the disposable Prisma client (mocked `src/lib/prisma.js` singleton → disposable client).

---

## Migration diagnosis and safe baseline (do not auto-apply)

### Why shared SQLite DBs lack `_prisma_migrations`

`scripts/reset-test-db.mjs` rebuilds `prisma/test.db` with **`prisma db push`**, which syncs schema without writing migration history. Local/dev DBs similarly often use push. Therefore `migrate deploy` on those files returns **P3005** (non-empty DB, no history).

### Full migrate-from-zero (empty disposable SQLite)

**Fails (pre-existing):** migration `20260711080337_init` errors with `no such table: AccountProfile`.  
This is a historical chain break. **Do not rewrite or delete historical migrations** to unblock Live Market.

### Live Market additive SQL proof (disposable)

`npm run live-market:migrate-proof` part B: `db push` current schema → drop `LiveMarket*` → re-apply `20260813120000_live_market_phase1_foundation/migration.sql` → tables present. **OK.**

### Safe baseline procedure (manual, local only)

For a **local disposable or personal** SQLite file that was created via `db push` and must later use migrate:

1. Stop processes using the DB.
2. Confirm it is **not** staging/production.
3. Optionally snapshot the file.
4. Only after team approval: `prisma migrate resolve` / baseline per Prisma docs for that file alone.
5. Never mark migrations as applied on shared/staging/production automatically from this feature work.

Staging/production Postgres deploy of Live Market: **PENDING** (no authorized environment in Batch C/D). Static check: `npm run live-market:postgres-static` → schema valid + migration SQL contains expected tables.

---

## Configuration (all default OFF)

| Env | Meaning | Default |
|-----|---------|---------|
| `ENABLE_LIVE_MARKET_V1` | Master kill switch | `false` |
| `ENABLE_LIVE_MARKET_ADMIN_V1` | Admin enrolment APIs (requires master) | `false` |
| `ENABLE_LIVE_MARKET_OWNER_V1` | Owner session APIs (requires master) | `false` |
| `ENABLE_LIVE_MARKET_PUBLIC_V1` | Public session read (requires master) | `false` |
| `LIVE_MARKET_ALLOW_FAKE_PROVIDER` | Non-production fake video adapter only | unset/`false` |

Runtime accessors: `Features.liveMarket.*` and `snapshotFeatures().liveMarket` in `src/config/features.js`. Subflags cannot enable surfaces when the master flag is off.

### Reserved later-phase names (not implemented)

`ENABLE_LIVE_BROADCAST_V1`, `ENABLE_LIVE_CHAT_V1`, `ENABLE_LIVE_CHAT_TRANSLATION_V1`, `ENABLE_LIVE_CAPTIONS_V1`, `ENABLE_LIVE_COMMERCE_V1`, `ENABLE_LIVE_REPLAY_V1` — documented only; do not treat as operational.

---

## Schema variants (authoritative)

| Variant | Path | Role |
|---------|------|------|
| SQLite (runtime client-gen) | `prisma/sqlite/schema.prisma` | Local/dev + unit tests; migrations in `prisma/sqlite/migrations` |
| PostgreSQL | `prisma/postgres/schema.prisma` | Staging/production; migrations in `prisma/postgres/migrations` |
| Root SQLite | `prisma/schema.prisma` | Legacy/default `@prisma/client` output — kept in sync for model parity |

Migration added: `20260813120000_live_market_phase1_foundation` (postgres + sqlite SQL).

Apply SQLite (when `_prisma_migrations` is baselined):

```bash
cross-env DATABASE_URL=file:../dev.db npx prisma migrate deploy --schema prisma/sqlite/schema.prisma
```

Apply Postgres (via repo helper / `DATABASE_URL=postgresql://…`):

```bash
npm run prisma:migrate:postgres
```

**Note:** Empty or db-push-only SQLite DBs may hit Prisma `P3005` on migrate deploy until baselined. Additive `CREATE TABLE IF NOT EXISTS` SQL can be applied manually in that case. Do not conceal unrelated drift.

### Models

- `LiveMarketPilotEnrollment` — unique `storeId` → `Business` (`onDelete: Cascade`)
- `LiveMarketSession` — `storeId` → `Business` (`onDelete: Cascade`); no provider payload columns beyond optional `providerExternalRef`
- `LiveMarketSessionSubject` — `sessionId` → session (`onDelete: Cascade`); `subjectId` references `Product.id` **without** Prisma FK (catalog identity only)

Indexes: enrolment `(state)`, `(storeId, state)`; session `(storeId)`, `(storeId, state)`, `(hostUserId)`, `(state, scheduledStartAt)`, `(scheduledStartAt)`; subject unique `(sessionId, subjectType, subjectId)`.

Audit evidence lives in existing `AuditEvent` (no cascade from Live Market deletes).

---

## Domain states

### Pilot enrolment

`INVITED → APPROVED → ONBOARDING → ACTIVE → PAUSED → REMOVED`

### Session lifecycle

```text
DRAFT → SCHEDULED → READY → LIVE → ENDED → PROCESSING → REPLAY_READY
  │          │         │       │        └──────────────→ FAILED
  └──────────┴─────────┴──────→ CANCELLED
```

Prepare/start without a configured provider → `LIVE_PROVIDER_NOT_CONFIGURED` (no fake success). `FakeLiveVideoProvider` is test/dev-injection only; production resolve never selects it.

### Host actions vs enrolment

| Enrolment | Draft/subjects | Schedule | Prepare/start | Cancel |
|-----------|----------------|----------|---------------|--------|
| ACTIVE | yes | yes | yes | yes |
| PAUSED | yes | no | no | yes |
| other | no | no | no | no |

---

## Catalog subject mapping

No separate `Service` model. Both products and services are `Product` rows (`businessId` = store). `subjectType` is Live Market classification metadata only; `subjectId` = `Product.id`. Server validates `Product.businessId` and optional `Product.itemType` mismatch.

---

## API inventory

### Owner (`ENABLE_LIVE_MARKET_V1` + `OWNER`; `requireAuth` + `requireStoreOwner` + pilot checks)

| Method | Path |
|--------|------|
| GET | `/api/stores/:storeId/live-market/status` |
| POST | `/api/stores/:storeId/live-sessions` |
| GET | `/api/stores/:storeId/live-sessions` |
| GET | `/api/stores/:storeId/live-sessions/:sessionId` |
| PATCH | `/api/stores/:storeId/live-sessions/:sessionId` |
| POST | `.../schedule` \| `prepare` \| `start` \| `end` \| `cancel` |
| PUT | `.../subjects` |

### Admin (`MASTER` + `ADMIN`; `requireAuth` + `requireAdmin`)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/live-market/enrollments` |
| PATCH | `/api/admin/live-market/enrollments/:enrollmentId` |
| GET | `/api/admin/live-market/sessions` |
| GET | `/api/admin/live-market/health` |

### Public (`MASTER` + `PUBLIC`; `optionalAuth`)

| Method | Path |
|--------|------|
| GET | `/api/public/live-market/sessions/:sessionId` |

Public DTO excludes drafts/cancelled/failed (non-visible states), `hostUserId`, `providerExternalRef`, failure payloads, and audit data.

### Authorization matrix

| Actor | Enrol | Own store sessions | Public read |
|-------|-------|--------------------|-------------|
| Guest | no | no | yes if public flag + visible state |
| Signed-in non-owner | no | no | same as guest |
| Store owner, not enrolled | no | no (403 `LIVE_STORE_NOT_ENROLLED` on mutate) | n/a |
| Owner + ACTIVE pilot | no | yes | n/a |
| Owner + PAUSED | no | draft/subjects/cancel only | n/a |
| Platform admin | yes | inspect via admin APIs | n/a |

---

## Audit events (`AuditEvent`)

| Reason / action | When |
|-----------------|------|
| `LIVE_ENROLLMENT_TRANSITION` | enrolment create/transition |
| `LIVE_SESSION_CREATED` / `UPDATED` / `TRANSITION` / `CANCELLED` | session lifecycle |
| `LIVE_SUBJECTS_SET` | subjects replaced |
| `LIVE_PROVIDER_PREPARE_BLOCKED` / `START_BLOCKED` | provider not configured |

Metadata is secret-redacted; no provider tokens.

---

## Cloudflare Stream Slice A (2026-08-13)

Experimental provider adapter only — see `docs/CLOUDFLARE_STREAM_SLICE_A.md`.

- Verdict: **PARTIAL** (not `CLOUDFLARE_STREAM_TECHNICAL_PILOT_READY`)
- WebRTC WHIP/WHEP beta; recording unsupported per official docs
- Flags default OFF; owner prepare/start **not** unlocked
- Streaming remains **not operational** in the merchant UI

---

## Storefront scheduled publication (architecture)

**Product decision:** back office ≠ audience venue.

| Surface | Route | Responsibility |
|---------|-------|----------------|
| Merchant back office | `/app/back/live-market` | Setup/control room: plan, schedule, **Publish live session** / withdraw; later prepare/start/end media |
| Public storefront | `/s/:slug` (+ `#live`) | Authoritative audience venue: hero badge, scheduled card, countdown, later player/chat |
| Global Marketplace homepage | `/` | Discovery: compact Live Market badge on store heroes → `/s/:slug#live`. Not the full player |

### Two state dimensions

1. **Session lifecycle** — `DRAFT` → `SCHEDULED` → `READY` → `LIVE` → `ENDED` → …  
2. **Storefront publication** — `HIDDEN` | `PUBLISHED` | `WITHDRAWN` (singular; fans out to both surfaces)

Rules:

- **One publish action** — no separate `publishToGlobal` boolean
- **Published does not mean live**
- **Scheduled time does not mean live**
- **Only provider-confirmed connection means live** (later Slice B+)
- Cloudflare flags are **not** required to publish
- Global feed attaches compact `liveMarket` summaries in a **batched** query (no N+1)
- Ranking boost for confirmed LIVE is **deferred** until provider LIVE exists
- Recording/replay remains unsupported in the current WebRTC trial
- Staging PostgreSQL Live Market migrate remains pending

Flags (default OFF):

- `ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1` / `VITE_ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1`
- `ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1` / `VITE_ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1`
- `ENABLE_LIVE_MARKET_GLOBAL_FEED_V1` / `VITE_ENABLE_LIVE_MARKET_GLOBAL_FEED_V1`

Owner: `POST …/publish-storefront`, `POST …/withdraw-storefront`  
Public: `GET /api/public/live-market/stores/:slug/live-session`  
Feed: optional `store.liveMarket` on `GET /api/public/stores/feed`

---

## Module map

| Path | Role |
|------|------|
| `src/config/features.js` | Flags |
| `src/lib/liveMarket/domain.js` | Lifecycle, subjects, DTO, retention |
| `src/lib/liveMarket/providers.js` | Video ports + adapters |
| `src/lib/liveMarket/providers/cloudflareStream*.js` | Experimental Cloudflare adapter (Slice A) |
| `src/lib/liveMarket/audit.js` | AuditEvent helper |
| `src/lib/liveMarket/service.js` | Enrolment + session application service |
| `src/lib/liveMarket/routes.js` | Owner/admin/public routers |
| `src/server.js` | Mounts |
| `src/lib/liveMarket/*.test.js` | Domain + service/route tests |

---

## Explicitly deferred / not implemented

- Production video / chat / captions / translation / replay / discovery UI
- Creator Studio `LIVESTREAM` integration
- Destructive retention cleanup jobs
- Operational Go Live in owner UI

---

## Remaining acceptance gaps

1. Staging/production Postgres **migrate deploy** — see `docs/IMPACT_REPORT_LIVE_MARKET_STAGING_DEPLOYMENT.md` (`BLOCKED_PENDING_PROMOTE_AND_STAGING_DB_ACCESS`; static SQL review PASS; staging currently 404 for Live Market routes; migration not on `origin/staging`)
2. Full SQLite migrate-from-zero blocked by pre-existing `20260711080337_init` (separate repair track)
3. Production video provider integration not verified
4. Broader storefront/public-store HTTP regression beyond Product/Business Prisma smoke not run in this suite

Backend API/auth/domain criteria for Phase 1 foundation are covered by `npm run test:live-market` (**39 tests** after Batch E). Dashboard Batch D/E UI tests cover flags-off nav, status-driven enrolment gates, owner/admin flows, and provider-not-configured copy.

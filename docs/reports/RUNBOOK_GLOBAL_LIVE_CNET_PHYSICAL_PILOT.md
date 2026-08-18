# RUNBOOK — Global Live × Cnet physical pilot

ACK: `ACK GLOBAL_LIVE_CNET_PHYSICAL_PILOT_BATCH_C`  
Dedicated services only. Staging (`cardbey-core-staging`) and production (`cardbey-core`) stay untouched.  
Do not claim `GLOBAL_LIVE_CNET_PHYSICAL_PILOT_READY` until every evidence row is filled.

---

## Stop immediately if

1. Owner action directly produces **LIVE** (start-intent must stay **CONNECTING**).
2. Cloudflare authenticity cannot be verified (no account/live-input/webhook evidence).
3. Stream credentials appear in logs, browser storage, or public DTOs.
4. Screen manifest/QR exposes `deviceId`, `sessionId`, `storeId`, or stream keys.
5. HLS failure has no timed QR-card fallback.
6. Telemetry duplicates on retry (impression/QR/join).
7. Registrations, online viewers, and screen plays are combined into one “viewers” number.
8. A deploy or migrate targets staging or production.

---

## A. Git (this batch)

| Item | Value |
|------|--------|
| Worktree | `C:\Projects\cardbey-wt-live-cnet-contract` |
| Core branch | `feat/global-live-cnet-commercial-contract-a` |
| Dashboard branch | `feat/global-live-cnet-commercial-contract-a` |
| PR bases | RTMPS v3 feat branches — **not** `staging` / `main` |
| Blueprint | `render-global-live-pilot.yaml` (`autoDeploy: false`) |

---

## B. Provision dedicated Render services (manual)

Do **not** apply repo-root `render.yaml`.

1. In Render, create a **new** Postgres named `cardbey-global-live-pilot-db`. Do not attach the staging or production database.
2. Create services from `render-global-live-pilot.yaml` only:
   - `cardbey-core-global-live-pilot`
   - `cardbey-dashboard-global-live-pilot`
3. Confirm `autoDeploy: false` on both.
4. Confirm branch `feat/global-live-cnet-commercial-contract-a`.
5. Set `DATABASE_URL` to the **new** pilot Postgres.
6. First deploy with **all Live Market / Cnet flags false**.
7. Confirm health: `GET https://cardbey-core-global-live-pilot.onrender.com/api/performer/intake/v2`

### Approved migration (pilot DB only)

After the new `DATABASE_URL` is set, Core `prestart` / `prisma-bootstrap.js` runs `prisma migrate deploy` against `prisma/postgres`. Confirm logs show additive:

- `20260818010000_global_live_cnet_contract`
- `20260818020000_global_live_cnet_contract_b`

If bootstrap did not run, from a **pilot** shell only (never a staging URL):

```text
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

---

## C. Server-only Cloudflare credentials (Render secret manager)

Never `VITE_*`. Never commit values.

| Key | Where |
|-----|--------|
| `CLOUDFLARE_ACCOUNT_ID` | Core pilot service |
| `CLOUDFLARE_STREAM_API_TOKEN` | Core pilot service |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | Core pilot service (needed to *build* public HLS URL) |
| `CLOUDFLARE_STREAM_WEBHOOK_SECRET` | Core pilot service |
| `CLOUDFLARE_NOTIFICATIONS_WEBHOOK_AUTH` | Core pilot service |
| `CLOUDFLARE_STREAM_ALLOWED_ORIGINS` | Pilot dashboard + core origins only |

Webhook destination (pilot only):

```text
https://cardbey-core-global-live-pilot.onrender.com/api/webhooks/cloudflare/stream-live
```

Keep off: `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1`, `ENABLE_LIVE_RECORDING_V1`, `ENABLE_LIVE_REPLAY_V1`.

---

## D. Enable required flags (pilot services only, after secrets)

Core:

```text
ENABLE_LIVE_MARKET_V1=true
ENABLE_LIVE_MARKET_OWNER_V1=true
ENABLE_LIVE_MARKET_PUBLIC_V1=true
ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1=true
ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1=true
ENABLE_LIVE_MARKET_GLOBAL_FEED_V1=true
ENABLE_LIVE_MARKET_REGISTRATION_V1=true
ENABLE_LIVE_BROADCAST_V1=true
ENABLE_LIVE_CLOUDFLARE_STREAM_V1=true
ENABLE_LIVE_RTMPS_HOST_V1=true
ENABLE_LIVE_STOREFRONT_PLAYER_V1=true
ENABLE_LIVE_GLOBAL_PLAYER_V1=true
ENABLE_LIVE_CNET_CONTRACT_V1=true
LIVE_VIDEO_PROVIDER=cloudflare
```

Dashboard Vite (rebuild/redeploy dashboard after change):

```text
VITE_ENABLE_LIVE_MARKET_V1=true
VITE_ENABLE_LIVE_MARKET_OWNER_V1=true
VITE_ENABLE_LIVE_MARKET_PUBLIC_V1=true
VITE_ENABLE_LIVE_MARKET_STOREFRONT_PUBLISH_V1=true
VITE_ENABLE_LIVE_MARKET_STOREFRONT_CONSUME_V1=true
VITE_ENABLE_LIVE_MARKET_GLOBAL_FEED_V1=true
VITE_ENABLE_LIVE_MARKET_REGISTRATION_V1=true
VITE_ENABLE_LIVE_RTMPS_HOST_V1=true
VITE_ENABLE_LIVE_STOREFRONT_PLAYER_V1=true
VITE_ENABLE_LIVE_GLOBAL_PLAYER_V1=true
VITE_ENABLE_LIVE_CNET_CONTRACT_V1=true
```

Manual deploy (autoDeploy stays false).

---

## E. Physical rehearsal

One test store, one session, one campaign, one paired screen.

| Step | Expected | Evidence (fill) |
|------|----------|-----------------|
| Pair one controlled Cnet screen | Device online; no pairing code in owner Cnet DTO | ts / screenshot |
| Create session | DRAFT/SCHEDULED — not LIVE | ts / screenshot |
| Create Cnet campaign + placement + activate | Preview QR uses `/api/public/live-cnet/h/glt_…` only | ts / screenshot |
| OBS start | Session **READY → CONNECTING** (not LIVE) | ts / screenshot |
| Cloudflare confirms ingest | Session **LIVE** from provider/webhook, not host click | Cloudflare live-input id / webhook log (redact secrets) |
| Second device HLS | Storefront `#live` plays Cloudflare HLS | ts / screenshot |
| Physical screen HLS | TV shows live video + corner QR | ts / photo |
| Stop OBS / kill stream | Screen falls back to timed QR card (`STREAM_UNAVAILABLE` / live card) | ts / photo |
| Scan physical QR | Phone opens `/s/:slug?glc=&glp=&gld=&glt=#live` — no internal ids | ts / screenshot |
| Register | `registrations` increments only | metrics JSON |
| Online join | `onlineViewers` increments only | metrics JSON |
| Store action | `storeActions` increments only | metrics JSON |
| Retry QR/join | Duplicate suppressed (`recorded: false` / same dedupe) | logs |
| Pause campaign | Overlay omitted on next playlist fetch | ts |
| Withdraw placement | Health `WITHDRAWN`; overlay gone | ts |
| End session + credential cleanup | Credentials cleared from owner UI; not in public DTO | ts / DevTools Application |

Analytics must show three separate numbers. Never add them.

---

## F. Ready token

Only after every row above has evidence, record:

`GLOBAL_LIVE_CNET_PHYSICAL_PILOT_READY`

Until then the honest verdict is **PARTIAL**.

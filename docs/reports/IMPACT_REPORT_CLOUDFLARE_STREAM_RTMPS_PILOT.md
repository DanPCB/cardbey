# IMPACT REPORT — Cloudflare Stream RTMPS Pilot (Live Market)

Date: 2026-08-14  
Scope: First operational Cardbey video-broadcasting pilot (RTMPS host → Cloudflare Stream → storefront + global audience)  
Status: **AWAITING ACK** — no code changes applied for this batch  
Suggested ACK: `ACK CLOUDFLARE_STREAM_RTMPS_PILOT`  
Verdict if forced today: **PARTIAL** (foundations exist; RTMPS path and provider-confirmed LIVE are not operational)

---

## Discovery summary

### Repository / worktree

| Item | Finding |
|------|---------|
| Branch | `fix/upload-ask-presentoptions-storename` |
| Dirty scale | ~337 paths (Live Market + BI/EOI/enrichment/test fixtures mixed) |
| Live Market foundation | Present and reusable under `apps/core/cardbey-core/src/lib/liveMarket/` |
| Dashboard control room | `/app/back/live-market` via `StoreLiveMarketPage` |
| Creator Studio `LIVESTREAM` | Separate — must not be conflated |

**Stop condition — worktree isolation:** Unrelated dirty paths cannot be blindly staged. Implementation must touch only Live Market / Cloudflare / playback files and leave BI/EOI/enrichment untouched. Prefer a dedicated branch from a clean base if ACK requires it.

### Existing foundations (reuse — do not duplicate)

| Layer | Location | Status |
|-------|----------|--------|
| Domain states / transitions | `liveMarket/domain.js` | `DRAFT→SCHEDULED→READY→LIVE→ENDED→PROCESSING→REPLAY_READY` (+ `FAILED`, `CANCELLED`) |
| Provider port + resolver | `liveMarket/providers.js` | `NotConfiguredLiveVideoProvider`, `FakeLiveVideoProvider`, `resolveLiveVideoProvider` |
| Cloudflare adapter (Slice A) | `providers/cloudflareStreamProvider.js` | **WHIP/WHEP-centric**; not RTMPS-validated |
| Config | `providers/cloudflareStreamConfig.js` | Account + token + webhook secret; selection requires WebRTC flag |
| Webhook HMAC helper | `providers/cloudflareWebhookVerify.js` | Built for **Stream video-library** `Webhook-Signature` |
| Owner routes | `liveMarket/routes.js` | `prepare`, `start`, `end` exist; credentials / start-intent / provider-state missing |
| Service lifecycle | `liveMarket/service.js` | Prepare → `READY`; **start currently marks `LIVE`** |
| Schema | `LiveMarketSession.providerExternalRef` | String field; no Prisma enum for session state |
| Flags | `features.js` + `.env.example` | `ENABLE_LIVE_BROADCAST_V1`, `ENABLE_LIVE_CLOUDFLARE_STREAM_V1`, `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1` |
| Public surfaces | Storefront `#live` + global badge/feed | Waiting UI only; no player |
| Tests | `cloudflareStreamProvider.test.js`, `domain.test.js`, `service.test.js`, dashboard Live Market suite | Slice A / foundation coverage |

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Owner **Go Live / start** continues to mark session `LIVE` without Cloudflare connection evidence | **Critical** — violates product invariant |
| Public player activates on schedule/publication alone (fake live) | **Critical** |
| RTMPS stream keys leak into list/status/public DTOs, logs, analytics, URLs, or localStorage | **Critical** |
| Extending Cloudflare adapter for RTMPS while still requiring WHIP/WHEP breaks existing Slice A tests / WebRTC-deferred path | High |
| Renaming historical states (`READY`→`PREPARED`, `PROCESSING`→`REPLAY_PROCESSING`) without compatibility | High |
| Webhook route accepts forged Notifications payloads if wrong authenticity helper is reused | High |
| Provider selection still gated on `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1` blocks RTMPS pilot | High |
| Mixing this batch into the dirty worktree stages unrelated BI/EOI/enrichment | High |
| Enabling recording/replay flags accidentally creates retained videos | Medium |
| Allowed-origins / signed URL misconfig blocks legitimate playback | Medium |
| Checkout / store publish / Creator Studio paths touched by accidental shared-component edits | Medium |
| Viewer-count API misuse exposes noisy or wrong audience metrics | Low (prefer leave disabled) |

---

## (2) Why

### A. Adapter is WebRTC Slice A, not RTMPS pilot

Current `CloudflareStreamLiveVideoProvider`:

- Selected only when `LIVE_VIDEO_PROVIDER=cloudflare` **and** broadcast + Stream + **WebRTC** flags are all on.
- `prepareSession` **requires** `webRTC.url` + `webRTCPlayback.url` and fails without them.
- Sensitive capabilities expose WHIP/WHEP only — **no RTMPS URL/stream key normalization**.
- Missing: enable/disable as first-class ops, list videos by live input, active-video / completed-recording discovery, playback DTO, allowedOrigins, customer code.
- `unlocksOwnerPrepareStart = false` and `isOwnerCapabilityProviderReady` hard-blocks Cloudflare — intentional Slice A lock.

Official Live Inputs API returns `rtmps.url` + `rtmps.streamKey` and supports `recording.mode = off|automatic`, `allowedOrigins`, `enabled`, connection `status`. RTMPS pilot must extend this adapter (not invent a second one) and **stop requiring WebRTC**.

### B. Lifecycle invariant is already violated in service code

`startSession` in `service.js` today:

1. Requires `READY`
2. Calls `provider.startSession`
3. **Transitions to `LIVE` with `startedAt`**

That is exactly the forbidden pattern: user action marks LIVE. Target:

- Start intent → `CONNECTING`
- Cloudflare-confirmed connection → `LIVE`
- Disconnect / end → `ENDING` → `ENDED`

Fake provider also returns `status: 'live'` from `startSession` — must be corrected so tests cannot accidentally encode the bad invariant.

### C. State vocabulary gap (compatible mapping)

| Pilot vocabulary | Current schema string | Smallest safe approach |
|------------------|----------------------|------------------------|
| PREPARED | `READY` | **Keep `READY`** as prepared alias in docs/UI; do not rename historical rows |
| CONNECTING | *(missing)* | **Add** `CONNECTING` to `SESSION_STATES` + transition map |
| ENDING | *(missing)* | **Add** `ENDING` |
| REPLAY_PROCESSING | `PROCESSING` | Keep `PROCESSING`; map publicly to `REPLAY_PROCESSING` in playback DTO |
| REPLAY_READY | `REPLAY_READY` | Unchanged |

No Prisma enum migration required for state strings (field is `String`). Still need transition-map + DTO + test updates. Optional additive columns (below) for replay retention / video UID / event dedupe.

### D. Webhook authenticity mismatch (documented stop condition)

Two different Cloudflare mechanisms exist:

| Mechanism | Config | Payload | Authenticity |
|-----------|--------|---------|--------------|
| Stream video-library webhook | `PUT /accounts/{id}/stream/webhook` | `{ uid, status, readyToStream, … }` | `Webhook-Signature: time=…,sig1=…` HMAC-SHA256 with Stream webhook secret |
| **Stream Live Input notifications** (needed for connected/disconnected/errored) | Cloudflare **Notifications** → Destinations webhook | `{ data: { input_id, event_type }, ts, … }` | Generic Notifications: secret in **`cf-webhook-auth`** header (static compare) — **not** the Stream HMAC helper |

Existing `cloudflareWebhookVerify.js` implements the **video-library** HMAC only. Live Input docs explicitly say webhooks work differently from uploaded/on-demand video webhooks.

**Implication:** Do not wire Live Input events through the current HMAC helper unchanged. Pilot design must:

1. Accept Notifications-style payloads (`data.input_id` / `data.event_type`).
2. Verify with Notifications `cf-webhook-auth` (or document if a real Save-and-Test shows a different header).
3. Keep reconciliation polling as the authoritative backstop if webhook auth cannot be proven in staging.

This is a **design blocker to resolve in Phase D**, not a reason to abandon the pilot — but coding the wrong verifier would be a security defect.

### E. Credentials & public playback

- Provider port typedefs today have no RTMPS credential surface.
- Public DTOs correctly scrub `providerExternalRef`; must continue to scrub RTMPS/keys.
- Need dedicated `POST …/broadcast-credentials` (rate-limited, no-store, owner+ACTIVE pilot only).
- Public playback needs `CLOUDFLARE_STREAM_CUSTOMER_CODE` for player/HLS URLs — not present in config yet.
- Viewer count API (`https://customer-<CODE>.cloudflarestream.com/<INPUT_OR_VIDEO_ID>/views`) is documented for RTMPS/HLS; still leave **disabled** until server-side cache/rate-limit lands and staging proves it.

---

## (3) Impact scope

| Area | Impact |
|------|--------|
| Core provider adapter + config + flags | Extend (RTMPS); keep WebRTC flag off / deferred |
| Domain transitions + owner capabilities | Add CONNECTING/ENDING; change start-intent semantics |
| Owner APIs | Fix start; add start-intent, capabilities, provider-state, credentials |
| Webhooks + reconciler | New route + Notifications auth + bounded poller |
| Prisma | Additive fields only if needed (see below); dual sqlite/postgres migrate |
| Dashboard `/app/back/live-market` | Broadcast control room UI (prepare → OBS → connecting → live → end) |
| Storefront `#live` + global Marketplace | Player only when published + confirmed LIVE |
| Checkout / Creator Studio / unrelated BI | **Out of scope — do not touch** |
| Recording / replay / WHIP | Flags remain off; separate verdicts later |

---

## (4) Smallest safe patch (proposed, post-ACK)

### Phase A — Provider adapter (extend existing)

1. Decouple provider selection from WebRTC: select Cloudflare when `LIVE_VIDEO_PROVIDER=cloudflare` + master + `ENABLE_LIVE_BROADCAST_V1` + `ENABLE_LIVE_CLOUDFLARE_STREAM_V1` (+ new `ENABLE_LIVE_RTMPS_HOST_V1` for host credential issuance).
2. Keep `ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1=false`; do not require WHIP/WHEP on prepare.
3. Extend adapter methods against `/accounts/{accountId}/stream/live_inputs`:
   - create / get / enable / disable / delete
   - RTMPS credential read (normalize `rtmps.url` + `rtmps.streamKey`)
   - public playback info (customer code + live input / video uid → player URL)
   - list videos for input; discover active + completed recording
   - reconcile connected/disconnected/errored from live-input `status`
4. Create body: `recording.mode` from recording flag (default `off`); `allowedOrigins` from `CLOUDFLARE_STREAM_ALLOWED_ORIGINS`; no WebRTC/simulcast enablement.
5. Persist only Live Input UID in `providerExternalRef`.
6. Config additions (server-only): `CLOUDFLARE_STREAM_CUSTOMER_CODE`, `CLOUDFLARE_STREAM_ALLOWED_ORIGINS`; boot → `NotConfiguredLiveVideoProvider` if incomplete.
7. Unlock `unlocksOwnerPrepareStart` only when RTMPS host flag + config ok (still never auto LIVE).

### Phase B — Lifecycle (compatible strings)

```text
SCHEDULED → READY (prepare)
READY → CONNECTING (start-intent only)
CONNECTING → LIVE (provider connected evidence only)
LIVE → ENDING (host end)
ENDING → ENDED (provider disabled / confirmed down)
ENDED → PROCESSING → REPLAY_READY (recording path; flags off for now)
* → CANCELLED / FAILED where already allowed
```

Critical code change: **replace** service `startSession` LIVE transition with `CONNECTING`; introduce `confirmProviderConnected` / reconcile path for LIVE.

### Phase C — Owner APIs

| Endpoint | Role |
|----------|------|
| Existing `POST …/prepare` | Create/enable Live Input → `READY` |
| `POST …/start-intent` (new; deprecate auto-LIVE on `/start`) | → `CONNECTING` |
| `GET …/broadcast-capabilities` | Safe capability DTO |
| `GET …/provider-state` | Redacted provider status |
| `POST …/broadcast-credentials` | RTMPS URL + key on demand only |
| Existing `POST …/end` | → `ENDING` then disable input |

Auth: owner + ACTIVE pilot + flags. Credentials: no-store, rate limit, never log body, never persist key.

### Phase D — Confirmation

- Webhook: `POST /api/webhooks/cloudflare/stream-live` using **Notifications** auth (`cf-webhook-auth`) + Live Input payload shape; redacted audit; unknown IDs → generic 200/ack without existence leak.
- Reconciler: poll only `READY|CONNECTING|LIVE|ENDING` pilot sessions; lock/idempotency; per-run call budget; admin manual reconcile if patterns exist.
- If staging Save-and-Test proves a different signature, stop and amend report before shipping auth.

### Phase E–F — UI + public playback

- Control room: prepare → get OBS details → check connection → confirmed LIVE → end with confirm; clear credential React state on unmount.
- Canonical public playback DTO (`WAITING|CONNECTING|LIVE|ENDED|REPLAY_*|UNAVAILABLE`); player only when consume flags + `PUBLISHED` + confirmed `LIVE`.
- Withdrawal hides player immediately without necessarily killing private input.

### Phase G–H

- Viewer count: leave disabled until `/views` proven behind cache.
- Recording/replay: flags stay false; schema hooks optional now, worker later.

### Prisma (additive only — if needed in this batch)

Prefer minimal:

| Field / table | Why |
|---------------|-----|
| `providerVideoUid String?` | Active/replay video UID (not stream key) |
| `replayDeleteAfter DateTime?` | 24h retention worker (Phase H) |
| `LiveMarketProviderEvent` (eventId unique) | Webhook/reconcile dedupe |
| Index on `providerExternalRef` | Resolve session by Live Input UID |

Do **not** edit historical migrations; add new dual sqlite/postgres migrations only.

### Feature flags (reuse names; add missing only)

```text
ENABLE_LIVE_BROADCAST_V1                 # exists
ENABLE_LIVE_CLOUDFLARE_STREAM_V1         # exists
ENABLE_LIVE_RTMPS_HOST_V1                # ADD
ENABLE_LIVE_STOREFRONT_PLAYER_V1         # ADD
ENABLE_LIVE_GLOBAL_PLAYER_V1             # ADD
ENABLE_LIVE_RECORDING_V1                 # ADD, default false
ENABLE_LIVE_REPLAY_V1                    # ADD, default false
ENABLE_LIVE_CLOUDFLARE_WEBRTC_V1         # exists, stay false
```

`VITE_*` mirrors for UI visibility only — never authorize backend.

### Audit reasons (redacted)

Add: `LIVE_BROADCAST_PREPARED`, `LIVE_BROADCAST_CREDENTIALS_ISSUED`, `LIVE_BROADCAST_START_INTENT`, `LIVE_PROVIDER_CONNECTED`, `LIVE_PROVIDER_DISCONNECTED`, `LIVE_PROVIDER_ERROR`, `LIVE_BROADCAST_ENDED`, `LIVE_PROVIDER_RECONCILED`, (+ recording events deferred).

---

## Authorization matrix (target)

| Actor | Prepare / start-intent / credentials / end | Public playback | Admin reconcile |
|-------|--------------------------------------------|-----------------|-----------------|
| Store owner (ACTIVE pilot) | Yes (flags + provider) | N/A | No |
| Store owner (PAUSED) | Edit/cancel only | N/A | No |
| Non-owner | Deny | N/A | No |
| Admin | Enrolment/health; **no** owner RTMPS credentials unless explicit future grant | N/A | Manual reconcile yes |
| Anonymous / audience | No | Only published + confirmed LIVE + player flags | No |

---

## Cloudflare API contract (pilot)

```text
POST   /accounts/{accountId}/stream/live_inputs
GET    /accounts/{accountId}/stream/live_inputs/{uid}
PUT    /accounts/{accountId}/stream/live_inputs/{uid}   # enabled true/false, recording, origins
DELETE /accounts/{accountId}/stream/live_inputs/{uid}
GET    /accounts/{accountId}/stream/live_inputs/{uid}/videos
# Playback: customer-<CODE>.cloudflarestream.com/{uid} (player / HLS)
# Optional later: GET customer-<CODE>.cloudflarestream.com/{uid}/views
```

Persist: Live Input UID only. Credentials: ephemeral response only.

---

## Stop conditions (active)

| Condition | Status |
|-----------|--------|
| Provider ports cannot represent RTMPS credentials | **Addressable** by extending port + adapter (post-ACK) |
| Webhook authenticity mismatch | **Documented** — Notifications `cf-webhook-auth` ≠ Stream HMAC; must implement correct verifier + staging proof |
| Stream keys in public DTOs | Prevented by design; regression tests required |
| Schema drift / historical migration edits | Avoided — additive only |
| User action marks LIVE | **Present today** — must fix in Phase B |
| Unrelated dirty worktree | **Present** — isolate file set / branch before coding |
| Unapproved real Cloudflare cost | No live API calls until staging secrets authorised |
| Production credentials as only test creds | Forbidden |

---

## Test plan (post-implementation)

- Mocked Cloudflare HTTP: CRUD Live Input, RTMPS normalize, playback normalize, video discovery, errors/timeouts, redaction
- Lifecycle: prepare → CONNECTING → connected LIVE; user cannot LIVE; disconnect/end; reconcile; enrolment/cross-store guards; withdraw hides playback
- API/auth: credentials no-store; non-owner deny; public DTO scrub; webhook invalid/unknown/idempotent
- Dashboard: flag-off UI; OBS credential conceal/cleanup; connecting/live/end; storefront + global player gates
- Suites: `test:live-market`, Cloudflare operational suite, dashboard Live Market, `build:dashboard`, Prisma validate both schemas
- Real OBS + second-device pilot evidence required before `CLOUDFLARE_STREAM_RTMPS_TECHNICAL_PILOT_READY`

---

## Explicit non-claims for this batch

Chat, captions, translation, recording, replay, browser WHIP/WHEP broadcasting, and production operational readiness are **out of scope**.

---

## ACK required

Per development-safety and the request process: **no implementation until acknowledgment**.

Reply with:

```text
ACK CLOUDFLARE_STREAM_RTMPS_PILOT
```

Optionally specify:

1. Whether to create a clean branch from `main`/`master` first (recommended given dirty worktree).
2. Whether Phase H recording schema hooks may land now (flags still off) or wait entirely.
3. Confirmation that staging Cloudflare Stream tokens (not production) will be available for the real pilot.

# Realtime Signal Standard

**Status:** LOCKED operational standard  
**Scope:** Platform admin (Control Center) + business owner (Live Performance)  
**Goal:** When something meaningful happens, **emit an event → sanitize it → route it → update the right surface.** No silent features.

---

## Principle

Cardbey has two living command centers. Both follow the same pipeline:

```
Backend fact occurs
    → emit (typed event)
    → sanitize (strip PII / secrets)
    → store + broadcast (SSE)
    → client stream hook (SSE primary, polling fallback)
    → surfaces (feed · heartbeat · toast · metrics refresh)
```

**A feature that changes business or platform state but does not emit a realtime signal is incomplete.**

Polling-only dashboards, manual refresh, and “check back later” UX are fallbacks — not the primary experience.

---

## Two lanes (pick one or both)

| Lane | Audience | Emitter | Stream | Client hook | Primary UI |
|------|----------|---------|--------|-------------|------------|
| **Platform** | `platform_admin` / legacy `admin` | `emitPlatformActivity()` | `GET /api/admin/platform/activity/stream` | `usePlatformActivityStream` | Control Center |
| **Store** | Store owner (+ platform admin) | `emitStoreActivity()` | `GET /api/stores/:storeId/activity/stream` | `useStorePulseStream` | Live Performance |

### When to use which lane

| Event affects… | Emit to |
|----------------|---------|
| Platform ops, discovery ingestion, devices, global users, cross-tenant missions | **Platform** |
| A single store’s engagement, offers, campaigns, Performer actions for that owner | **Store** |
| Both (e.g. business activated) | **Platform** (operator view) **and** **Store** (owner view) when owner-visible |

Never broadcast store events on the platform bus without sanitization and never leak one store’s events to another store’s SSE clients.

---

## What counts as “meaningful”

Emit when the event is **user-visible, actionable, or metric-moving**:

- Customer / visitor interaction (view, click, scan, inquiry, claim)
- Campaign or offer traction change
- Performer recommendation created or mission step completed for a store
- Content published, profile completed, loyalty started
- Platform: user registered, business claim/activation, QA decision, device paired/offline, mission failed, ingest completed

**Do not emit** for:

- Internal retries, idempotent no-ops, debug-only state
- High-frequency noise without operator/owner value (use dedupe; see below)
- Raw DB writes that duplicate an already-emitted higher-level event

---

## Backend contract

### 1. Emit

**Platform** — `apps/core/cardbey-core/src/lib/platformActivity/platformActivityEmitter.js`

```js
import { emitPlatformActivity } from '../platformActivity/platformActivityEmitter.js';

emitPlatformActivity({
  type: 'business_activated',          // must exist in EVENT_TYPE_CATEGORY
  severity: 'success',                 // optional; defaults from types map
  actorType: 'system',
  actorId: null,                       // prefer null for customer-adjacent events
  entityType: 'business_seed',
  entityId: seedId,
  title: 'Business activated',
  message: 'A business completed activation.',
  route: '/admin',                     // deep link for “Open” CTA
  metadata: { storeId },               // IDs only — no PII
});
```

**Store** — `apps/core/cardbey-core/src/lib/storeActivity/storeActivityEmitter.js`

```js
import { emitStoreActivity } from '../storeActivity/storeActivityEmitter.js';

emitStoreActivity({
  storeId,                             // required
  type: 'offer_viewed',               // must be in STORE_ACTIVITY_TYPES
  entityType: 'offer',
  entityId: offerId,
  metadata: { signalType: 'offer_view' },
});
```

Prefer bridge helpers when mapping from existing signals:

- `emitStoreActivityFromIntentSignal()` — `storeActivityHooks.js`
- `emitStoreActivityFromMission()` — mission created / completed
- `emitCustomerInquiryActivity()` — inquiries

Hook emission **after** the authoritative write succeeds (e.g. `intentSignal.create`, mission transition). Use `void import(...).then(...)` for non-blocking emit in hot paths.

### 2. Register the type

Add the new `type` to the types module **before** shipping:

| Lane | File |
|------|------|
| Platform | `platformActivityTypes.js` — `EVENT_TYPE_CATEGORY`, `EVENT_TYPE_DEFAULT_SEVERITY`, action labels / routes |
| Store | `storeActivityTypes.js` — `STORE_ACTIVITY_TYPES`, category, severity, default title/message |

Unknown store types throw at emit time. Platform types fall back to `system_admin` category.

### 3. Sanitize

All events pass through sanitizers before buffer + broadcast:

| Lane | Sanitizer |
|------|-----------|
| Platform | `platformActivitySanitizer.js` |
| Store | `storeActivitySanitizer.js` (extends platform rules + strips customer fields) |

**Never include in title, message, or metadata:**

- Email, phone, full name, address
- `userAgent`, `referrer`, IP
- Tokens, passwords, cookies, API keys

Store lane: **`actorId` is always `null`** on emitted events.

Allowed metadata: opaque IDs (`storeId`, `offerId`, `missionId`, `missionType`, `signalType`).

### 4. Dedupe

| Lane | Window | Key |
|------|--------|-----|
| Platform | 60s | `type:entityType:entityId` |
| Store | 30s | `storeId:type:entityType:entityId` |

Repeated identical events within the window are dropped (returns `null`). Tune type/entityId so legitimate bursts still surface.

### 5. Store + broadcast

| Lane | Buffer | SSE event name |
|------|--------|----------------|
| Platform | In-memory ring + optional JSONL | `platform-activity` |
| Store | Per-`storeId` ring (max 100) | `store-activity` |

REST fallback (polling):

- `GET /api/admin/platform/activity?limit=30`
- `GET /api/stores/:storeId/activity?limit=40`

### 6. Access control (streams)

| Endpoint | Auth |
|----------|------|
| Platform stream | `requireAuth` + `requireAdmin` |
| Store stream | `requireAuth` + `assertStoreActivityAccess` (owner or platform admin) |

Unauthorized store stream → **403**. Unknown store → **404**.

---

## Frontend contract

### Stream hooks (single source per lane)

| Hook | Behavior |
|------|----------|
| `usePlatformActivityStream` | Fetch SSE + admin auth; 30s poll fallback; 403 → offline |
| `useStorePulseStream` | Fetch SSE + session auth; 30s poll fallback; 403 → offline; 45s stale reconnect |

**Do not** open parallel SSE connections or poll the same endpoint from individual components. Consume the hook at the page/shell level and pass `events`, `connection`, `lastLiveEvent` down.

### Connection states

Expose and render: **`live` · `polling` · `reconnecting` · `offline`**

Surfaces must show connection label (heartbeat bar, activity feed header, Live Performance section subtitle).

### Surface routing

When `lastLiveEvent` updates (stream only — not bootstrap history):

| Surface | Platform (Control Center) | Store (Live Performance) |
|---------|---------------------------|---------------------------|
| **Activity feed** | `CcActivityFeedV2` | `CcActivityFeedV2` (mapped events) |
| **Heartbeat ticker** | `PlatformHeartbeatBar` | `PlatformHeartbeatBar` + `buildStoreHeartbeatItems` |
| **Toast + sound** | `ControlCenterNotificationToast` | `LivePerformanceNotificationToast` |
| **Desktop notification** | `showControlCenterDesktopNotification` | Same prefs/sound helpers |
| **Metrics refresh** | Invalidate platform metrics queries | Invalidate `livePerformance/businessEvolution` + signals when event type ∈ evolution set |

Store evolution invalidation types: `storeActivity/mapStoreActivityEvent.ts` → `STORE_ACTIVITY_EVOLUTION_TYPES`.

### Toast allowlist

Not every event toasts (avoid noise). Add new **owner- or operator-facing** types to the allowlist in:

- `ControlCenterNotificationToast.tsx`
- `LivePerformanceNotificationToast.tsx`

Use **30s dedupe** on toast layer (already implemented). Sound/desktop only when user has enabled alerts.

### Mapping store → feed shape

Store SSE events include `storeId`. Map to `PlatformActivityEvent` for shared feed components:

`mapStoreActivityToPlatformEvent()` in `lib/storeActivity/mapStoreActivityEvent.ts`.

---

## Runtime authority (alerts & CTAs)

Realtime surfaces are **read → observe → recommend → launch**. They must not perform direct writes.

| Allowed | Forbidden |
|---------|-----------|
| `openProactiveIntelligenceIntent`, `openBusinessEvolutionAction`, `openBusinessIntelligenceIntent` | Direct `PATCH /api/stores`, campaign/offer publish, profile writes |
| Navigate to Performer / Live Performance / admin routes | `autoSubmit: true` on governed missions |
| Governed handoff with `confirmationState: pending` | Silent execution from feed CTAs |

See: `safeExecutionGovernance.ts`, `RUNTIME_AUTHORITY_DIRECT_WRITE_AUDIT.md`.

---

## Developer checklist (new feature)

- [ ] **Classify lane** — Platform, Store, or both?
- [ ] **Register type** in `*ActivityTypes.js` with category, severity, default copy
- [ ] **Emit after commit** from the authoritative code path (route, service, runner)
- [ ] **Sanitize** — no PII; IDs only in metadata
- [ ] **Test emit** — unit test in `platformActivity.test.js` or `storeActivity.test.js`
- [ ] **Test stream isolation** — store A event does not appear on store B stream
- [ ] **Test 403** — non-owner cannot subscribe to store stream
- [ ] **Frontend** — hook picks up event; feed + heartbeat update without refresh
- [ ] **Toast** — add type to allowlist if owner/operator should be notified
- [ ] **Metrics** — invalidate correct React Query keys on live event
- [ ] **No mock** — surfaces read from stream + real APIs only

---

## File map

### Core (emit + stream)

```
apps/core/cardbey-core/src/lib/platformActivity/
  platformActivityEmitter.js    emitPlatformActivity
  platformActivityStore.js      buffer, broadcast, list
  platformActivitySanitizer.js
  platformActivityTypes.js

apps/core/cardbey-core/src/lib/storeActivity/
  storeActivityEmitter.js       emitStoreActivity
  storeActivityStore.js         per-store buffer, broadcast
  storeActivitySanitizer.js
  storeActivityTypes.js
  storeActivityHooks.js         intent / mission / inquiry bridges
  storeActivityAccess.js        assertStoreActivityAccess

apps/core/cardbey-core/src/routes/admin/platformActivityRoutes.js
apps/core/cardbey-core/src/routes/stores.js                 /:id/activity, /:id/activity/stream
```

### Dashboard (consume)

```
apps/dashboard/.../src/hooks/usePlatformActivityStream.ts
apps/dashboard/.../src/hooks/useStorePulseStream.ts
apps/dashboard/.../src/lib/adminApi/fetchSse.ts             connectFetchSse (auth headers)
apps/dashboard/.../src/lib/storeActivity/
  storeActivityApi.ts
  mapStoreActivityEvent.ts

apps/dashboard/.../src/components/controlCenter/
  CardbeyControlCenter.tsx
  ControlCenterNotificationToast.tsx
  living/PlatformHeartbeatBar.tsx
  living/CcActivityFeedV2.tsx

apps/dashboard/.../src/components/livePerformance/
  LivePerformanceCenter.tsx
  commandCenter/LivePerformanceNotificationToast.tsx
```

---

## Testing standard

| Test | Command / file |
|------|----------------|
| Platform emit + sanitize + stream | `platformActivity.test.js` |
| Store emit + cross-store isolation + PII | `storeActivity.test.js` |
| Platform SSE hook + poll fallback | `usePlatformActivityStream.test.ts` |
| Store SSE hook + poll fallback + 403 | `useStorePulseStream.test.tsx` |
| Signal → Intelligence (5 questions) | `signalIntelligence.test.ts` |
| LP runtime authority (no direct writes) | `LivePerformanceCenter.runtime.test.ts` |

Use **`npx vitest run`** for CI-style runs (not watch mode).

---

## Signal → Intelligence Rule (LOCKED)

**Signals must not exist only as feed entries.** Every new meaningful signal must be capable of becoming an **observation** and a **recommendation** with a **governed mission** handoff.

### The five required answers

| # | Question | Field | Example (store `offer_viewed`) |
|---|----------|-------|--------------------------------|
| 1 | What happened? | `whatHappened` | Offer viewed |
| 2 | Why does it matter? | `whyItMatters` | Offer interest signals purchase intent |
| 3 | What opportunity or risk exists? | `opportunityOrRisk` | High-intent views — strengthen offer or add urgency |
| 4 | What recommendation should be presented? | `recommendation` | Optimize the viewed offer or launch follow-up campaign |
| 5 | Which governed mission can address it? | `governedMission` | `launch_campaign` → Performer (owner) or admin route (platform) |

### Intelligence pipeline

```
SSE event (typed)
    → resolveSignalIntelligence(event, { audience })
    → SignalIntelligenceProfile (5 answers)
    → Activity feed (impact · opportunity/risk · recommend)
    → Governed CTA (Performer handoff or Control Center route)
    → Optional: observation engine / opportunity ranker (future aggregate)
```

### Implementation

| Step | Platform lane | Store lane |
|------|---------------|------------|
| Resolver | `resolveSignalIntelligence(event, { audience: 'platform' })` | `resolveSignalIntelligence(event, { audience: 'store' })` |
| Registry | `signalIntelligenceRegistry.ts` → `PLATFORM_SIGNAL_PROFILES` | `signalIntelligenceRegistry.ts` → `STORE_SIGNAL_PROFILES` |
| Feed mapping | `mapActivityToFeedV2(event, { audience: 'platform' })` | `mapActivityToFeedV2(event, { audience: 'store' })` |
| Governed action | `buildCommandActionsForActivity` → CC routes | `openStoreSignalGovernedMission` → `openBusinessIntelligenceIntent` |

**Module root:** `apps/dashboard/.../src/lib/signals/`

### Adding a new signal type

1. Register backend emit type (see Backend contract above).
2. Add registry entry in `signalIntelligenceRegistry.ts` for the correct lane with all **five fields** populated.
3. Set `governedMission.proposedAction` to a key recognized by `safeExecutionGovernance.ts`.
4. Store lane: use `BusinessIntelligenceRecommendationType` + `openBusinessIntelligenceIntent` (`autoSubmit: false`).
5. Platform lane: use `governedMission.route` to a Control Center zone.
6. Add test in `signalIntelligence.test.ts` asserting all five answers are non-empty.
7. Verify feed card shows Impact, Opportunity/Risk, Recommend, and governed CTA — not title-only.

### Observation & recommendation surfaces

| Surface | How intelligence appears |
|---------|--------------------------|
| **Activity feed** | Impact, opportunity/risk line, recommendation, governed button |
| **Heartbeat** | Pulse label from live event type |
| **Toast** | High-signal types only (allowlist) |
| **Top Opportunities** | Aggregated from BI snapshot + evolution (not single-event) |
| **PIL / observation engine** | May consume `SignalIntelligenceProfile` batches (future); registry is the contract |

### Anti-pattern: feed-only signals

| Bad | Good |
|-----|------|
| Emit event with title/message only | Registry entry with impact, opportunity, recommendation, mission |
| Feed shows timestamp + title | Feed shows full intelligence block + CTA |
| CTA calls write API | CTA opens governed Performer intent or CC route |
| New type with platform fallback only | Explicit store + platform profiles when both lanes emit |

---

## Anti-patterns

| Anti-pattern | Why |
|--------------|-----|
| Feature ships with only a REST counter | Owner/admin must refresh; defeats command center |
| Component polls its own endpoint | Duplicate traffic, inconsistent connection state |
| Emit before DB commit | Ghost events on rollback |
| Customer email in `message` | PII leak over SSE |
| Store event on platform bus without `storeId` scoping | Cross-tenant confusion |
| Toast on every `info` event | Alert fatigue; use allowlist + dedupe |
| Feed CTA calls write API directly | Breaks Runtime Authority |

---

## Related docs

- [CONTROL_CENTER_PHASE_E_PIL.md](./CONTROL_CENTER_PHASE_E_PIL.md) — platform intelligence surfaces
- [RUNTIME_AUTHORITY_DIRECT_WRITE_AUDIT.md](./RUNTIME_AUTHORITY_DIRECT_WRITE_AUDIT.md) — write boundaries
- [apps/dashboard/.../LIVE_PERFORMANCE_V2_ARCHITECTURE.md](../apps/dashboard/cardbey-marketing-dashboard/docs/LIVE_PERFORMANCE_V2_ARCHITECTURE.md) — owner command center layout
- [PERFORMER_FRONTEND_INVARIANTS.md](../apps/dashboard/cardbey-marketing-dashboard/docs/PERFORMER_FRONTEND_INVARIANTS.md) — mission projection (separate from activity SSE)

---

## Version history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-06-16 | Initial standard — platform SSE + store SSE (Live Performance V2.1) |
| 1.1 | 2026-06-16 | Signal → Intelligence Rule — registry, feed enrichment, governed missions |

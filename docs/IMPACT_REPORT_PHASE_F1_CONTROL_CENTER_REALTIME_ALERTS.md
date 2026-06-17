# Impact Report — Phase F.1 Control Center: Discovery Agent Visibility + Realtime Alerts

Date: 2026-06-16  
Scope: Dashboard Control Center UI + realtime observation/notification only

## Runtime Authority Rule (non-negotiable)

- Control Center may **observe, notify, navigate, and launch governed runtime actions only**.
- Control Center must **not** mutate business/store/profile/media directly.
- Performer Runtime remains the hard boundary for any state-changing action.

## 1) What could break

1. **Control Center renders slower or becomes noisy**
   - If we add a high-volume toast feed without dedupe/throttle, admins could get spammed and miss critical items.

2. **SSE connection instability / reconnection loops**
   - If we add new subscriptions incorrectly, Control Center could flap between “live/polling/offline”.

3. **Navigation/badges drift out of sync**
   - If badge counts are driven by derived event streams without consistent mapping, the sidebar can show incorrect “unread/attention” indicators.

4. **Sound alerts violate browser autoplay rules**
   - Playing audio before a user gesture can fail silently or throw; can also annoy users if not gated/deduped.

5. **Desktop notification permission UX regressions**
   - Requesting permission at the wrong time (on load) can harm UX; denied permission must fall back cleanly to in-app toasts.

6. **Accidental boundary violation**
   - A rushed implementation might accidentally call direct mutation endpoints from Control Center instead of routing via Performer Runtime.

## 2) Why

- Phase F.1 adds a new “realtime alert layer” that reacts to platform activity and device/runtime events.
- It also reintroduces “Discovery Agent / Business Ingestion” as a top-level Control Center panel, plus live sidebar badges.
- These additions touch high-visibility UI surfaces (Control Center + sidebar) and realtime connectivity code paths.

## 3) Impact scope

- **Dashboard Control Center**
  - `CardbeyControlCenter.tsx` layout and new top panel placement
  - New toast component + sound/notification toggles
  - Connection-state indicator (Live/Reconnecting/Polling/Offline)
- **Realtime streams**
  - Platform Activity stream (already exists via `usePlatformActivityStream`)
  - Device admin stream (existing `sseClient` / device alerts)
- **Sidebar badges**
  - Existing attention badge plumbing updated to accept realtime deltas

## 4) Smallest safe patch (implementation strategy)

### A. Reuse existing realtime plumbing (no new transport)

- Use `usePlatformActivityStream` for:
  - SSE when available
  - automatic 30s polling fallback
  - connection state already reported as `live | polling | paused`
- Reuse existing device stream patterns for device-specific events already flowing through the system.

### B. Add “Discovery Agent / Business Ingestion” as first-class panel

- Add a new panel near the top of Control Center (not nested under Business Network).
- Display only **read-only** metrics already available via `useControlCenterMetrics()`:
  - sources active, last ingestion run, discovered, pending QA, claimable, stalled activation, activated, enrichment suggestions, runtime status
- Primary actions are pure navigation links (QA review, claims, discovery agent, data sources).

### C. Toast notifications (in-app)

- New `ControlCenterNotificationToast` layer consumes incoming activity events.
- Apply strict rules:
  - dedupe same `eventType + entityId` within 30 seconds
  - auto-dismiss info/warning (6–10s)
  - critical stays until dismissed
  - action button routes to the relevant admin page

### D. Sound alerts (optional)

- Disabled by default until user enables via explicit UI button.
- Persist setting in `localStorage`: `cardbey.controlCenter.soundAlerts.enabled`
- Respect mute + browser interaction gating (no audio until user gesture).
- Severity-based tones (info/warning/critical), and apply the same 30s dedupe to prevent spam.

### E. Desktop notifications (optional)

- Explicit “Enable desktop notifications” CTA.
- Request permission only on click.
- If denied, continue with in-app toast only.

### F. No-refresh requirement

- Primary updates come from SSE where available; fallback polling every 30 seconds is already implemented for platform activity.
- Surface connection state as:
  - Live / Polling / Offline (Paused when admin access forbidden)
  - “Reconnecting” can be modeled as transient state around reconnect attempts.

### G. Tests (minimal, high-signal)

- Panel exists near top of Control Center.
- SSE event → toast shown.
- Critical toast persists until dismissed.
- Sound does not play before enabled; plays after enabled; dedupe prevents spam.
- Sidebar badges update after receiving event.
- Polling fallback activates when SSE disconnects.

## Confirmation checkpoint

This report documents the safest minimal path. Implementation proceeds by adding read-only UI + notification overlays and reusing existing streams, without introducing any direct mutation paths from Control Center.


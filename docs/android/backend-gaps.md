# Backend Gaps — Android Blockers & Uncertainties

Items requiring backend clarification, mobile-specific endpoints, or adapter boundaries before full feature parity.

## Critical (blocks vertical slices)

| Gap | Impact | Workaround |
|-----|--------|------------|
| **No refresh token** | Session expires (7d); poor UX on long-lived installs | Re-login flow; optional biometric quick-unlock to stored credentials (local only) |
| **No `/api/spaces` API** | Spaces are client-composed | Resolve from `/api/auth/me` + store context; mirror `resolveSpaceData.ts` |
| **SSE on mobile** | OkHttp SSE works but background delivery limited | Foreground service during active mission; poll blackboard fallback |
| **Guest auth prod gate** | `GUEST_AUTH_ENABLED` required for anonymous Performer | Signed-out marketplace only until guest enabled or user signs in |
| **OAuth not configured** | Google/Facebook return 501 | Email/password only for v1 |

## Medium (adapter boundaries)

| Gap | Notes |
|-----|-------|
| Intake response evolution | `IntakeV2Response` has 50+ optional fields; use `action` discriminator + generic `data` bucket for forward compat |
| Upload resumability | Confirm whether `/api/uploads/create` supports chunked/resumable; queue locally until confirmed |
| Push notification payloads | No documented FCM payload schema for mission completion / approval required |
| Mobile-specific analytics | No server endpoint for non-sensitive event batching (use local abstraction first) |
| Certificate pinning ops | Pinning not mandated; document as optional in security.md |

## Low (later phases)

| Gap | Notes |
|-----|-------|
| Unified marketplace endpoint | Feed assembled from multiple routes; client composes |
| Tablet navigation spec | Responsive rail layouts need design review |
| Offline mission queue | Backend does not support offline mutation replay — read-only cache only |
| ML Kit vs server OCR | `/api/missions/extract-card` is authoritative; local ML is assistive only |

## Recommended backend follow-ups

1. Publish OpenAPI or JSON Schema for `/api/performer/intake/v2` response `action` variants.
2. Document FCM event types and deep-link payload fields.
3. Add `GET /api/spaces` aggregating personal + business spaces (optional convenience).
4. Consider `POST /api/auth/refresh` for mobile session continuity.
5. Expose mobile-friendly pagination on `/api/missions/recent-for-threads`.

## Contracts verified in Phase 0

- Auth: `/api/auth/login`, `/api/auth/me` — **verified** in `auth.js`, contract tests
- Health: `/api/ping` — **verified**
- Public feed: `/api/public/stores/feed` — **verified** in `publicUsers.js`
- Intake V2: `/api/performer/intake/v2` — **verified** in `performerIntakeV2Routes.js`
- SSE: `/api/stream` — **verified** in `sse.js`

# IMPACT REPORT — Dashboard store card hero/avatar

**Date:** 2026-08-24  
**Request:** Fix “Cửa hàng của tôi” store preview cards missing hero background and avatar on live account dashboard.

## What could break

- Clients that assume `/auth/me` `stores[]` only has `{ id, name, slug }` may see extra fields (additive only).
- Dashboard home issues one extra `GET /api/stores` to enrich media (same as existing fallback path).

## Why

`DashboardHome` preferred `useCurrentUser().stores` from `/api/auth/me`, which selected only `id/name/slug`. Thumb helpers always returned null → gray `ImageIcon` placeholders. Name-row used a Lucide `Store` icon, never `avatarImageUrl`.

## Impact scope

- `apps/core/cardbey-core/src/routes/auth.js` — `/me`, `/profile`, profile PATCH store select
- `apps/dashboard/.../DashboardHome.tsx` — My stores grid
- `apps/dashboard/.../MyStoresPage.tsx` — My Stores directory

No publish, billing, claims, or public storefront contract changes.

## Smallest safe patch

1. Expand `AUTH_ME_BUSINESS_SELECT` with `heroImageUrl`, `avatarImageUrl`, `logo`, `publishedAt`, `description`.
2. Enrich dashboard cards from `GET /api/stores` when `/me` list is used.
3. Render hero banner + circular avatar (logo fallback); keep Lucide icon when no URL.

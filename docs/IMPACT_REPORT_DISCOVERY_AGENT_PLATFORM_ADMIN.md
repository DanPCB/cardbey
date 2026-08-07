# Impact report — Discovery Agent platform_admin access

**Date:** 2026-08-07  
**Request:** Widen Discovery Agent route + Core discovery admin APIs from `super_admin` to `platform_admin`.

## What could break

1. Platform Admin accounts can enable/pause/run store-discovery crawls and edit TikTok/seed sources (previously super_admin only).
2. Mis-click / broader blast radius for crawl “Run Now” / seed CRUD if a platform admin is compromised.
3. Clients that assumed 403 for `platform_admin` on `/api/discovery/*` admin endpoints will now succeed.

## Why

Sidebar shows Discovery Agent to platform audience, but `SuperAdminRoute` + Core `requireSuperAdmin` silently bounce Platform Admin to `/dashboard`. Local `super_admin` sessions worked; staging/live Platform Admin did not.

## Impact scope

- Core: `/api/discovery/config|seeds|batches|run|stats` admin handlers only
- Dashboard: `/admin/discovery` route guard only
- No change to public discovery, claim, or library Content Acquisition auth

## Smallest safe patch

1. Core: swap `requireSuperAdmin` → existing `requireAdmin` (`isPlatformAdmin`: `platform_admin` | `super_admin` | legacy `admin`)
2. Dashboard: wrap `/admin/discovery` in `PlatformAdminRoute` (same gate as Content Acquisition / Control Center)
3. Copy: “Super admin” → “Platform admin” on Discovery Admin page subtitle

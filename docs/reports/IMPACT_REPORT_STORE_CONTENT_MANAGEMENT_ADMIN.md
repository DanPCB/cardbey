# Impact Report — Admin Store Content Management

**Date:** 2026-08-22  
**Scope:** Platform admin Control Center — browse/remove live store catalog and shows

## What could break

- **Accidental live data deletion** if admin reason + confirm gates are bypassed (mitigated: UI confirm + `confirmed: true` + min 8-char reason on server).
- **Public storefront stale cache** after unpublish/hide (mitigated: `bumpPublicFeedRankForStore` on mutations).
- **Show hide/archive on behalf of owner** without reason (mitigated: `requireAdminReasonIfNeeded` on hide/archive routes).

## Why

Admins need a governed path to remove test Assessment/Basic Package cards and catalog junk from live pages without a one-off hardcode.

## Impact scope

- New routes under `/api/admin/platform/store-content/*`
- New page `/control-center/store-content`
- Existing show lifecycle APIs reused for Shows tab

## Smallest safe patch

Dedicated admin service + governance page; no changes to owner catalog UX or publish pipeline.

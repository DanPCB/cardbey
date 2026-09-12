# IMPACT REPORT — Acquisition UI Reorganisation (V1 corrective slice)

**Date:** 2026-09-12  
**Scope:** Dashboard UI/navigation only. No backend rewrites, no RMA V2, no new SSOT.

## (1) What could break

- Bookmarks/links to `/admin/discovery` expecting the **business crawler** may land on **Rich Media Acquisition** after redirect (current page already is RMA + nested crawler).
- Control Center / attention CTAs labeled “Discovery Agent” that open `/admin/discovery` will need to open **Business Acquisition** instead.
- Tests asserting sidebar label `Discovery Agent`, quick-access `Content Discovery`, or crawler under RMA Sources will fail until updated.
- Content Acquisition feature-flag gate copy still mentions old product name if not updated.

## (2) Why

Labels and nesting currently mix three capabilities on overlapping URLs/nav. Reorganisation renames and splits hosts without changing `/api/discovery/*`, `/api/media-acquisition/*`, or universal-library population APIs.

## (3) Impact scope

| Area | Impact |
|------|--------|
| Routes / redirects | New business + RMA control-center paths; `/admin/discovery` alias |
| Sidebar / i18n | Three acquisition entries; remove ambiguous Discovery Agent |
| DiscoveryAdminPage | Remove business crawler from Sources |
| DiscoveryControlPanel | Rename headings only; APIs unchanged |
| ContentAcquisitionPage | Rename UI + tab labels; APIs unchanged |
| CC links / attention items | Point business-ingestion CTAs at Business Acquisition |

## (4) Smallest safe patch

1. Add `BusinessAcquisitionPage` hosting `DiscoveryControlPanel` only.  
2. Keep RMA page media-only; mount at `/control-center/rich-media-acquisition`; redirect `/admin/discovery`.  
3. Rename Content Acquisition UI to Library Population Operations; keep `/control-center/content-acquisition`.  
4. Update canonical nav + route constants + critical CC links.  
5. No backend, no migrations, no V2.

**Proceed:** Explicit user request for this corrective slice.

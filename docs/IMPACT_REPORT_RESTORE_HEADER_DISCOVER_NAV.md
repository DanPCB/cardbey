# Impact Report: Restore Discover in header nav

## Problem

Desktop header shows Marketplace + Cardbey Contents but no **Discover**. It was cleared from `PUBLIC_FRONT_SECONDARY_NAV` when Grow Your Business was added (`fc3ef6db`). Right-rail DISCOVER is unrelated.

## Smallest safe patch

Restore secondary nav entry → `/frontscreen` with `publicFeed.chrome.explore`. Update unit test. No chrome renderer changes (still maps secondary nav).

## Proceed

Ship dashboard → staging → live.

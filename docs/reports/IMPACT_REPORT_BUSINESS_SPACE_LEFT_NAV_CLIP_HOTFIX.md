# IMPACT REPORT — Business Space left-nav tab clip hotfix

**Date:** 2026-09-05  
**Issue:** Left rail under business name shows Content fully; next tab clipped to a sliver.

## Cause

In `PublicFeedShell`, theatre tabs live in `flex-1 overflow-y-auto` while `leftRailExtra` (Categories + Featured) is `shrink-0`. With a tall extras block, the tab column collapses below one row height and clips the second tab.

## What could break

Global left rail (many marketplace categories, no `leftRailExtra`) — must keep scrolling on the category list.

## Smallest safe patch

When `customNav` (Business Space / Creator lens): tabs `shrink-0`; `leftRailExtra` gets `flex-1 min-h-0 overflow-y-auto`. Global path unchanged.

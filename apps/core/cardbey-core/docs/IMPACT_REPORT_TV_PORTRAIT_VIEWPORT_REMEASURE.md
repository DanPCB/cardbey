# Impact Report: TV Portrait Viewport Remeasure (Letterbox / Crop)

**Date:** 2026-07-22  
**Scope:** Android TV player orientation rendering (`PlayerActivity`)  
**Risk class:** Signage display behavior change on TV devices only

## Problem

After Vertical orientation is applied, the physical portrait TV still shows a landscape strip with black bars and a cropped poster (logo/title/price missing). Dashboard preview shows the full 9:16 poster correctly.

## Root cause

Android TV keeps the activity window in landscape (`~1920×1080`). The previous fix only set `imageView.rotation = 90` without swapping layout width/height. A portrait poster was decoded into a landscape viewport, then rotated — producing letterboxing and crop. Expected logical canvas after portrait is `1080×1920`.

## What could break

1. **TV portrait playback** — root will use rotate + dimension swap (standard signage pattern). Devices that “looked OK” with video-only rotation may reflow.
2. **TV landscape** — clears transforms; should match prior landscape fill.
3. **Tablets** — unchanged path (activity / root rotation without TV swap).

## Smallest safe patch

In `PlayerActivity.applyScreenOrientation`:
1. Force `MATCH_PARENT` + `FIT_CENTER` on media views.
2. On TV portrait: size root to swapped display dims, translate, rotate root; do **not** also rotate ImageView/video.
3. Log measured sizes after layout.
4. `requestLayout` / `invalidate` + reload current slide only (no playlist restart).

## No-parallel-stack proof

Uses existing OrientationManager modes and PlayerActivity media surfaces. No new orientation store.

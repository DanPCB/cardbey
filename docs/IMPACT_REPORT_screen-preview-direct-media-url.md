# Impact Report: Recover ScreenPreview playback (“Not a direct media URL”)

## Problem

Device card preview shows **NOT A DIRECT MEDIA URL** while the remote Android TV plays the assigned playlist (`headspa`).

## Cause

In `ScreenPreview.tsx`, `resolveContentType()` marks any absolute `http(s)` URL as `notMedia: true` unless the URL string contains `window.location.hostname`, `localhost`, `192.168.`, or `127.0.0.1`.

Device Engine V2 `playlist/full` intentionally returns non-loopback media URLs via `DEVICE_PUBLIC_BASE_URL` and may return CloudFront/CDN URLs. Those hosts often fall outside the allowlist, so the preview refuses to mount `<video>`/`<img>` even when the file is playable.

## (1) What could break

- Preview no longer shows the static “Not a direct media URL” overlay for blocked external hosts.
- Truly non-media page URLs (e.g. YouTube watch pages) may briefly attempt load then fall through existing `onError` / empty-playlist handling instead of the dedicated overlay.

## (2) Why

Playback gating moves from “host allowlist” to “known non-media page patterns,” matching the existing comment that the browser element should load media and `onError` should handle failures.

## (3) Impact scope

- **Only** dashboard `ScreenPreview` (device cards / device detail inline preview).
- Does **not** change device heartbeat, playlist assign, publish, or Android player playback.
- No API contract changes.

## (4) Smallest safe patch

- File: `apps/dashboard/cardbey-marketing-dashboard/src/components/ScreenPreview.tsx`
- Change: `resolveContentType` — allow Core/LAN/CDN direct media; set `notMedia` only for clear HTML/page URL patterns.
- No parallel stack; reuse existing slide/`onError` path.

## Confirmed from production console (2026-07-18)

- Page: `https://cardbey.com` (deployed assets), Core: `https://cardbey-core.onrender.com`
- Playlist media host example: `https://pub-….r2.dev/media/...` (Cloudflare R2)
- Old `resolveContentType` host allowlist rejects `*.r2.dev` → **NOT A DIRECT MEDIA URL**
- Local source fix is not visible until dashboard is rebuilt/deployed or run locally

## Patch refinement

Reuse `isPersistedCdnMediaUrl` so R2 / `media.cardbey.com` / CloudFront match the rest of the dashboard media stack.

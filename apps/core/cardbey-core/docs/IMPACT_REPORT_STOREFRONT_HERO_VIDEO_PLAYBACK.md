# Impact Report — Storefront Hero Video Playback (iOS / Pexels hotlink)

**Date:** 2026-07-21  
**Store:** CA HANDYMAN SERVICE (`ca-handyman-service` / `cmrjy90vz00hznsb8luz4trzb`)  
**Live page:** `https://cardbey.com/s/ca-handyman-service`

## Evidence (production)

| Check | Result |
|-------|--------|
| Public DTO hero video | `https://videos.pexels.com/video-files/4729560/4729560-hd_1280_720_60fps.mp4` |
| Poster | Pexels JPEG — loads (matches screenshot) |
| `curl -I` | `200`, `Content-Type: video/mp4`, `Accept-Ranges: bytes`, `Content-Length: 6638697` |
| Range | `206` + valid `Content-Range` |
| CORS GET | `Access-Control-Allow-Origin: *` |
| **Content-Disposition** | **`attachment`** ← breaks iOS Safari `<video>` inline playback |
| ffprobe | H.264 High, yuv420p, AAC LC — codec-compatible |
| `heroVideoUrlIosSafe` | absent (hotlink, not Cardbey storage) |

## Root cause

The storefront persists a **third-party hotlink** (Pexels) as the canonical hero playback URL. Pexels serves the file with `Content-Disposition: attachment`. iPhone Safari refuses reliable inline/`playsInline` playback for that response, so the player surfaces “Video saved, but playback failed in your browser.” Poster still works because images are unaffected.

This is **not** primarily a missing H.264/faststart problem for this asset.

## What could break

| Risk | Mitigation |
|------|------------|
| Public proxy abuse | Allowlist hosts (pexels/coverr/mixkit/pixabay); size/timeout caps |
| First-request latency while caching | Cache to uploads/R2 after first fetch; subsequent hits local/R2 |
| DB rewrite races | Persist durable URL after successful ingest; DTO prefers durable |
| Public “Video saved” UX | Replace with non-blocking poster + optional tap-to-play |

## Smallest safe patch

1. Caching public playback endpoint that serves allowlisted remote heroes with `Content-Disposition: inline` + Range.  
2. Rewrite public store DTO hero URLs for allowlisted hotlinks to that endpoint.  
3. Persist durable `/uploads` (or R2) URL after cache/ingest; script for CA Handyman.  
4. Frontend: public-safe non-blocking failure UI; don’t treat autoplay `NotAllowedError` as corrupt media; structured `storefront_hero_video_failed` diagnostic.  
5. Ensure Cardbey-served videos set `Content-Disposition: inline`.

## Out of scope here

- Full historical re-encode of all R2 assets  
- Changing greeting / PIL delay work

## Implemented (code — awaiting production deploy + iPhone verify)

| Piece | Location |
|-------|----------|
| Caching proxy `GET /api/public/media/hero-playback/:token` | `routes/publicHeroPlaybackRoutes.js` |
| Hotlink rewrite on public slug DTO | `routes/publicUsers.js` |
| Allowlist + ingest helpers | `lib/media/externalHeroVideoPlayback.js` |
| `Content-Disposition: inline` on Cardbey `/uploads` video | `server.js`, `uploadsStatic.js` |
| Public non-blocking fallback UI + diagnostics | dashboard `HeroMediaBackground.tsx`, `cdnVideoPlaybackBlocked.ts`, `mediaDiagnostics.ts` |
| Reprocess script | `scripts/reprocess-external-hero-videos.mjs` |

### Deploy / verify

1. Deploy **core** (proxy + DTO rewrite) and **dashboard** (player UX).  
2. Optional durable migrate:  
   `node scripts/reprocess-external-hero-videos.mjs --slug=ca-handyman-service`  
3. Confirm public DTO hero URL is under  
   `https://cardbey-core.onrender.com/api/public/media/hero-playback/...`  
4. `curl -I` that URL → `200`, `video/mp4`, `Accept-Ranges: bytes`, **`Content-Disposition: inline`**.  
5. Real iPhone Safari: `https://cardbey.com/s/ca-handyman-service` — silent autoplay or poster without blocking CTA.

**Not complete until step 5 passes on a physical device.**

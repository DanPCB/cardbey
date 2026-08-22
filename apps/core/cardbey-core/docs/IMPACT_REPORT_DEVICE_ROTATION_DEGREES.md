# Impact Report: Device Rotation Degrees (360° Display Rotation)

**Date:** 2026-07-27  
**Scope:** Replace Device `orientation` (`horizontal` | `vertical`) with canonical `rotationDegrees` (0–359), apply once at display root across runtimes  
**Risk class:** Process / schema / wire-contract / signage runtime behavior change  
**Status:** A→B→C implemented (2026-07-27) — apply Postgres migration before deploying Core

## Problem

Device settings only expose Horizontal / Vertical. Commercial mounts need 90°, 180°, 270° (and later arbitrary angles). Example: portrait TV installed upside-down — content and overlays render inverted relative to the viewer.

Rotation must be a **device property**, not media or platform-specific orientation logic.

## Current SOT (what exists today)

| Layer | Shape | Location |
|-------|--------|----------|
| DB `Device.orientation` | `String?` default `"horizontal"` | Prisma (postgres / sqlite / root schemas) |
| DB `Screen.orientation` | legacy, same wire values | same |
| Update API | `POST /api/device/update` body `orientation?: "horizontal"\|"vertical"` | `deviceEngine.js` |
| Read paths | list, playlist/full, heartbeat, debug, device status | `deviceEngine.js`, `deviceAgentRoutes.js`, `deviceProjection.js` |
| Dashboard UI | Horizontal / Vertical select | `ScreenDeviceCard.tsx` |
| Preview | CSS `rotate(90deg)` for vertical | `ScreenPreview.tsx` + `index.css` |
| Shared runtime | maps to `LANDSCAPE` \| `PORTRAIT` on manifest | `normalizePlaylist.mapOrientation` |
| Browser player | `.is-portrait` → `rotate(90deg)` | `player/player.html` |
| Android | `OrientationManager` + TV root rotate / dim swap | `OrientationManager.kt`, `PlayerActivity.kt` |
| webOS | ingest only — **no viewport apply** | `apps/cardbey-display-webos` |
| Tizen / Windows player | not in-repo | — |

**Out of scope / do not conflate:** `PlaylistItem.displayOrientation` (`AUTO|LANDSCAPE|PORTRAIT`), creative/MI template orientation, per-item `rotation`.

## What could break

1. **Live signage orientation** — Android / browser players that currently treat `vertical` as 90° CW must keep that meaning after migration; wrong mapping → sideways or inverted TVs in production.
2. **Dashboard device list / preview** — removing `orientation` without dual-read breaks typed clients and live preview.
3. **Legacy Screen sync** — `POST /api/device/update` still mirrors orientation onto associated Screen; dropping that without a mapped `rotationDegrees`↔legacy sync can desync Screen admin.
4. **Playlist/full + heartbeat consumers** — Android, browser player, shared runtime fixtures/tests expect top-level `orientation` string today.
5. **Pairing flows** — `PairDeviceModal` / `pairingApi` / screen pair-complete still send `orientation`.
6. **webOS** — currently does not rotate; adding root transform changes visible behaviour on webOS TVs (intended, but must be fill-safe: no black bars / clipping).
7. **Arbitrary 0–359** — CSS rotate alone does not equal “fill TV” for non-multiples of 90; shipping free angles in UI before viewport math exists risks broken fills.

## Why

- Wire and DB are binary (`horizontal`/`vertical`); 180°/270° cannot be expressed.
- Orientation is applied inconsistently (Android + browser yes; webOS no; no shared apply helper).
- Hard-replacing the column/field without dual-write would break older app builds still reading `orientation`.

## Impact scope

| Area | Change |
|------|--------|
| Prisma `Device` (+ optional later `Screen`) | Add `rotationDegrees Int @default(0)` |
| Data migration | `horizontal`→`0`, `vertical`→`90`, null/invalid→`0` |
| Device Engine APIs | Accept/return `rotationDegrees`; keep `orientation` derived for one release |
| Dashboard Device Settings | Rotation 0/90/180/270 + preview |
| `@cardbey/display-runtime` | Canonical `device.rotationDegrees` + single apply helper |
| Browser player, webOS shell, Android | Consume degrees; apply at root |
| Diagnostics | Show Rotation / Viewport / Applied Transform |
| Docs / contracts | Device V2 contract map |

**Not changed in slice 1:** media authoring, playlist item orientation, creative templates, Tizen/Windows (no apps in-repo).

## Smallest safe patch (phased)

### Phase A — Canonical field + dual wire (no player behaviour change for 0/90)

1. **Schema:** Add `Device.rotationDegrees Int @default(0)` (do **not** drop `orientation` yet).
2. **SQL backfill:**  
   - `vertical` → `90`  
   - else → `0`
3. **API helpers (single SOT):**  
   - `normalizeRotationDegrees(n)` → integer in `0..359` (or reject)  
   - `rotationDegreesFromOrientation(o)` / `orientationFromRotationDegrees(d)`  
     - `0`↔`horizontal`, `90`↔`vertical`  
     - `180`/`270` → still return a derived `orientation` for old clients: prefer `vertical` for 90/270, `horizontal` for 0/180 (document; old clients cannot show 180 correctly until upgraded)
4. **`POST /api/device/update`:** Accept `rotationDegrees` (preferred) and/or legacy `orientation`. If both sent, `rotationDegrees` wins. Persist both columns for compatibility (`orientation` kept in sync for 0/90; for 180/270 set closest legacy label as above).
5. **Reads (list, playlist/full, heartbeat, projection, debug):** Add `rotationDegrees`; keep `orientation` derived so old Android/browser keep working for 0/90.
6. **Validation:** integer `0–359` (UI initially only offers 0/90/180/270).

### Phase B — Dashboard UI + preview

1. Replace Orientation Horizontal/Vertical with **Display Rotation** select: 0° / 90° / 180° / 270°.
2. `deviceClient` / `DeviceDto`: `rotationDegrees`; write via existing `POST /api/device/update` (not a new PATCH route unless we add an alias later).
3. `ScreenPreview`: apply `transform: rotate(Ndeg)` + dimension swap for 90/270 so preview matches device.
4. Pairing modals: map to degrees (default `0`); stop offering only H/V.

### Phase C — Shared runtime apply-once

1. Extend `DisplayManifest.settings` with `rotationDegrees: number` (keep `orientation` derived for one cycle).
2. Add **one** helper e.g. `applyDisplayRotation(rootEl, degrees)` in `@cardbey/display-runtime` (or platform-neutral util):  
   - `transform: rotate(${d}deg); transform-origin: center center;`  
   - for 90/270: swap logical width/height to fill viewport  
   - for 0/180: no swap  
3. Call from browser player + webOS display-root only; playlist/media renderers must not rotate individually.
4. Android: extend `OrientationManager` / `PlayerActivity` to map degrees (0/90/180/270) onto existing root/TV viewport path; prefer server `rotationDegrees`, fallback map from `orientation`.

### Phase D — Diagnostics + deprecate

1. Device diagnostics: Resolution, Rotation, Viewport, Applied Transform.
2. After all in-support clients read `rotationDegrees`: stop writing `orientation` (or make it read-only derived); eventual column drop in a later migration.

## API note (vs product brief)

Product brief says `GET/PATCH /device`. **In-repo Device V2 SOT is:**

- List: `GET /api/device/list`
- Update: `POST /api/device/update`
- Player: playlist/full + heartbeat

Slice 1 extends those contracts. A literal `PATCH /device` is **not** required for correctness and would add a parallel stack — avoid unless product explicitly needs a new REST surface.

## Migration mapping (locked)

| Old `orientation` | `rotationDegrees` |
|-------------------|-------------------|
| `horizontal` / null / invalid | `0` |
| `vertical` | `90` |

Meaning of **90°** must match today’s vertical behaviour (current Android/browser CW root rotate). Confirm on one physical TV before enabling 180/270 in production UI if any platform historically used CCW.

## Design constraints (locked)

- Rotate **display-root** once; playlist/media unaware.
- Media authored natural orientation; device adapts to mount.
- Architecture allows 0–359; **UI and “fill TV” guarantee** initially only for multiples of 90.
- No platform-specific rotation APIs unless CSS/transform path is proven broken on a target.

## No-parallel-stack proof

- One new column on existing `Device` row; no second device-config service.
- One normalize/apply helper in shared runtime; players call it (or Android equivalent), no per-renderer orientation forks.
- Legacy `orientation` remains a **derived compatibility field**, not a second SOT after Phase A write path always updates `rotationDegrees` first.

## Acceptance criteria mapping

| Criterion | Phase |
|-----------|--------|
| Remove H/V selector; add 0/90/180/270 | B |
| Backend stores `rotationDegrees` | A |
| Runtime rotates root container | C |
| All surfaces rotate together | C (browser + webOS + Android) |
| Persists across restart / re-pair | A (DB) + player read path |
| Existing devices migrate | A backfill |
| Supports future 0–359 | A validation + C helper signature |
| Identical across platforms | C shared helper; Android mirror |

## Recommended implementation order

1. Phase A (schema + API dual-write) — safest, additive  
2. Phase B (Dashboard) — unblocks operators for 180° mounts  
3. Phase C (runtimes) — fixes physical TVs including attached upside-down case  
4. Phase D (diagnostics + deprecation)

## Explicit non-goals (this report)

- Circular rotation wheel UI  
- Non-90° fill-perfect math  
- Dropping `orientation` column in the same PR as introduction  
- Building Tizen/Windows players from scratch  

## Acknowledgement gate

Per Development Safety Rule: **do not apply code until this report is acknowledged** and a phase set is chosen (recommend A→B→C in one coordinated PR series, or A alone first).

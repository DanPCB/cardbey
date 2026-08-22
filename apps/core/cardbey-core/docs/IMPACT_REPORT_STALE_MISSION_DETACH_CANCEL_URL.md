# Impact Report — Stale create-store identity after new upload (detach incomplete)

**Date:** 2026-07-30  
**Surface:** Performer create-store / upload Ask  
**Dashboard commit:** `a641393` (`main` / `fix/stale-mission-detach-cancel-url`)

See dashboard `docs/IMPACT_REPORT_STALE_MISSION_DETACH_CANCEL_URL.md` for full detail.

## Root cause (summary)

Detach binding already clears intake `missionId`, but UI only called `endActiveMission()`. The prior Core pipeline kept running and `?missionId=` URL sync re-hydrated **VIETNAMESE RESTAURANT** while a new County Cafe / Handyman upload was processed — producing OCR 0% blockers on the new image plus a stale draft preview.

## Fix

On store-mission detach for new upload: cancel Core session, strip URL `missionId`, end local mission, clear chat chrome; SingleRunwayUrlSync skips restore for mids marked ended for rehydrate.

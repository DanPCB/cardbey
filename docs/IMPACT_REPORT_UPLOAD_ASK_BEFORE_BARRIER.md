# Impact: Upload Ask before evidence barrier (500 fix)

## Symptom (live after #322)

HP card upload → **"Cardbey is temporarily unavailable"** (intake HTTP 500).
Direct POST to `/api/performer/intake/v2` with `(Image attached)` + `imageDataUrl` reproduces 500 after ~25s on cardbey-core.

## Root cause

Upload Ask ran **after** synchronous `runIntakeEvidenceBarrier` (OCR + vision + passive pipeline).
Barrier could throw or timeout on the Ask turn before the Ask panel returned → unhandled `intake_error` 500.

Secondary: unguarded `intakeEvidenceBarrierResult.status` when barrier failed.

## Patch

1. For attachment-only Ask (`(Image attached)`), return Upload Ask panel **before** evidence barrier using client `cardExtraction` / handoff belief.
2. Wrap early barrier in try/catch; optional-chain status checks.
3. Barrier/OCR remains on Create-store chip path.

## Not changed

- STRICT 70%
- No pixel-only bypass
- No fake identity

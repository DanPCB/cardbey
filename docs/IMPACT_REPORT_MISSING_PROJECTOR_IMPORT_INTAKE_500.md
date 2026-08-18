# Impact Report — Fix missing projectPerformerStatus import (intake 500)

**Date:** 2026-08-13  
**Symptom:** Upload ANISON logo → clarify chips → "Cardbey is temporarily unavailable"; proxy `intake/v2` ← 500. Also `extract-card` ← 502 (proxy/core unreachable mid-OCR).

## (1) What could break

- None expected: adding missing ESM imports only. Celebratory/status fields already intended by Agent C.

## (2) Why

`buildStoreMissionStartedDispatchResult` calls `projectPerformerStatus` / `performerStatusResponseFields` with **no import** → `ReferenceError` → intake catch → HTTP 500.

Secondary: dashboard `hasNewUploadImageNextRef` / `lastValidationCheckpointRef` used on End mission but never declared → `window.error` (seen in diagnostics).

## (3) Impact scope

- create-store mission-started response path
- End-mission client cleanup
- Not: publish, campaigns, payments

## (4) Smallest safe patch

1. Import projector helpers in `createStoreCheckpointDispatch.js`.
2. Declare the two missing `useRef`s in `useIntakeV2.ts`.

# Performer O→I→S→C→E — Testing Report (Wave 1)

**Date:** 2026-08-13  
**Worktree:** `C:\Projects\cardbey-wt-store-gen-p2`  
**Suite:** consolidated vitest spine  
**Result:** **97 passed / 0 failed** (9 files, ~13.7s)

Canvas: `performer-oisce-testing-report.canvas.tsx`

## Cross-agent conclusions

| Agent | Delivered | Conclusion |
|-------|-----------|------------|
| A | Fresh mission on upload≠mission identity; frozen evidence refuse | Sticky PTH-after-SPA class fixed at payload-guard + frozen replay |
| B | `persistTurnBeliefOnDispatchDeps` | One belief snapshot on gated create-store turns |
| C | `projectPerformerStatus` on blocked + mission-started | Shared `PERFORMER_STATUS` fields; celebratory gated |
| D | Full spine suite | A+B+C compose without regressions |

## Automated scenario bar

| ID | Scenario | Result |
|----|----------|--------|
| S1 | OCR vs sticky goal | Pass |
| S2 | SPA while PTH mission | Pass (unit) |
| S3 | Create-from-upload no pixels / stale frozen | Pass |
| S4 | Image ref mismatch | Pass |
| S5 | Five-business matrix | Pass (12) |
| S6 | Belief persist round-trip | Pass |
| S7 | Status projector BLOCKED/RUNNING | Pass |
| S8 | Same-brand continuation | Pass |
| S9 | Upload Ask vs stale create_store | Pass |
| L1 | Live PTH→SPA→AWE E2E | **Pending** (P5) |
| P3 | Runway consumes belief offerings | **Pending** |
| P4 | Delete dirty paths | **Pending** |

## File counts

| File | Tests |
|------|------:|
| createStoreCheckpointDispatch.test.js | 29 |
| intakePayloadGuard.test.js | 14 |
| earlyDecisionLoopGate.test.js | 12 |
| fiveBusinessUploadMatrix.test.js | 12 |
| intakeFrozenEvidenceReplay.test.js | 9 |
| buildTurnBeliefFromIntake.p1.test.js | 8 |
| projectPerformerStatus.test.js | 6 |
| turnBelief.p0.test.js | 4 |
| persistTurnBelief.test.js | 3 |
| **Total** | **97** |

## Verdict

Wave 1 (P1 finish + P2 backend projector) is **done and green**. Full designed Performer still needs wave 2: P3 runway binding, P4 dirty cleanup, P5 live E2E.

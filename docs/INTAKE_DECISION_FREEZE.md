# Intake Decision Freeze (Phase 0)

**Effective:** Phase 0 start — until Phase 4 route slimming completes.

## Policy

1. **No new intent regex or `message.includes()` decision logic** in `performerIntakeV2Routes.js`.
2. **No new `_classificationOverride` paths** outside `uploadIntakePhase.js` (existing consolidation module).
3. **New intake behavior** must go through:
   - A named advisor under `lib/decision/advisors/` (Phase 2+), or
   - Belief loader / delta fields (Phase 1+), or
   - A documented bypass with `recordIntakeBypass()` telemetry and a removal ticket.

## Allowed without review

- Bug fixes that do not change classification outcomes
- Belief shadow logging and diagnostics
- Golden test fixtures and documentation
- Governance / validation guards (no intent change)

## PR checklist

- [ ] Does this PR add route-level intent matching?
- [ ] Does it bypass `IntentIntegration.processIntake` for NL automation mode?
- [ ] If yes to either → requires architecture review + bypass inventory update

## P0 bypass inventory (must die in Phase 4)

| ID | Location | Trigger | Telemetry key |
|----|----------|---------|---------------|
| `BYPASS_IMAGE_CHAT_CAMPAIGN_AUTOSUBMIT` | `performerIntakeV2Routes.js` ~5022 | `general_chat` + image + `/creat\|campaign/` | `recordIntakeBypass` |
| `BYPASS_UPLOAD_ASK_ENFORCE` | `enforceUploadAskIntentClassification` | Attachment-only upload | `recordIntakeBypass` |
| `BYPASS_LEGACY_SMART_STORE_OCR` | ~1979 | OCR + explicit create store + legacy env | `recordIntakeBypass` |
| `BYPASS_CAMPAIGN_ORCHESTRATION_PRE_GATE` | ~1733 | `isCampaignOrchestrationIntent` | `recordIntakeBypass` |
| `BYPASS_AGENT_LOOP_DIRECT_CHAT` | ~3326 | Agent loop direct_chat before reasoner | `recordIntakeBypass` |

See `lib/decision/bypassTelemetry.js` for structured logging.

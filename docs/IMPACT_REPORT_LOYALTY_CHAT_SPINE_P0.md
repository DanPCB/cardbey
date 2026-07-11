# IMPACT REPORT: P0 Loyalty Chat → Compiler Spine

## Date: 2026-07-08

## What could break
- Loyalty chat without active store now asks store picker instead of soft-chat clarify (UX change; intended).
- With `USE_LOYALTY_SPINE=true`, chat returns TopologyReview (`show_execution_plan`) instead of immediate proactive runtime.
- Mis-classify into create_store/website paths should reduce but any residual dual-mission risk remains if upload create-store shortcuts fire first.

## Why
- Remove `storeId &&` gate on loyalty IntentReasoner fast-path.
- Prefer active/session store before picker; keep locked `setup_loyalty_program` on clarify options.
- Route chat loyalty through `generateExecutionPlan` when spine flag on.

## Impact scope
- `intentReasoner.js`, `intentDetectors.js`, `intentIntegration.js`
- New `dispatchLoyaltyFromIntake.js`
- `performerIntakeV2Routes.js` loyalty compile branch
- Path telemetry `loyalty_chat_compile` / `loyalty_classify_miss`

## Smallest safe patch
P0 only. Killswitch: `USE_LOYALTY_SPINE=false` keeps legacy proactive_plan path. No P1 perception UI.

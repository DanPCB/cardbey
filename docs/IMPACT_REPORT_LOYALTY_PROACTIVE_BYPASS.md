# Impact Report: Loyalty classified → proactive_plan instead of compiler topology

**Date:** 2026-07-09  
**Scope:** Intake V2 handoff after `setup_loyalty_program` classification when `USE_LOYALTY_SPINE=true`.

## Problem

Loyalty intent is classified correctly (`tool: setup_loyalty_program`, high confidence), but the UI still renders the legacy ProactivePlan card (“Processing your message…”) instead of `show_execution_plan` / TopologyReviewCard.

Root cause (with local `ENABLE_DYNAMIC_PLANNER=true` + `USE_LOYALTY_SPINE=true`):

1. Classifier stores loyalty with `executionPath: proactive_plan` (registry default).
2. Dynamic planner runs **before** the loyalty compiler branch and has **no `setup_loyalty` template**, so it falls back to `general_chat` → step label “Processing your message…”.
3. That plan is merged into classification and later dispatched as `action: proactive_plan`.
4. The existing loyalty compile branch at end-of-route is too late / can be skipped once the proactive plan path owns the response.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Loyalty turns no longer use ProactivePlanCard | Intentional: they must use TopologyReviewCard when spine flag is on | Loyalty chat / card upload with spine on |
| Store picker shape changes to `clarify_store` + `lockedTool` | Client must honor locked intent on store select | Multi-store owners without active store |
| Dynamic planner skipped for loyalty when spine on | Prevents general_chat fallback pollution | Only `setup_loyalty_program` / `create_loyalty_program` |
| Compiler failure returns error instead of empty Processing plan | Avoid silent wrong UX | Spine compile failures |

## Smallest safe patch

1. **Hydrate store** before missing-context / loyalty dispatch (body → context → runway → session).
2. **Hard-route loyalty before dynamic planner and before `proactive_plan`** when `USE_LOYALTY_SPINE=true`.
3. **Return TopologyReview shape** from loyalty dispatch (`action: show_execution_plan` + `executionPlan`).
4. **Store missing** → `clarify_store` + `lockedTool` (no rephrase).
5. **Telemetry** for `loyalty_chat_compile`, `loyalty_store_required`, `loyalty_proactive_bypass_prevented`, `loyalty_compile_failed_fallback`.
6. **Regression tests** for store / no-store / not-proactive_plan.

Killswitch: `USE_LOYALTY_SPINE=false` restores prior proactive_plan path.

## Out of scope

- OCR provider setup
- New loyalty intent patterns
- Routing via `/runtime/ui-action`

# Capability-Aware Performer v1 — Risk Confirmation & Architecture Compliance

## 1. Authoritative execution path (unchanged)

User-driven execution remains:

`handleSendGuarded` → `handleSend` → `usePerformerConsole.trigger` → **Intake V2** (`POST /api/performer/intake/v2`) and/or `runMissionTrigger`.

No new dashboard submission path is added. Capability-aware code runs **inside** `performerIntakeV2Routes.js` as **read-only enrichment** of the JSON response when `CAPABILITY_AWARE_V1=true`.

## 2. Files extended vs added

**Added (fresh):**

- `src/lib/capabilityAware/types.ts` — canonical contracts
- `src/lib/capabilityAware/capabilityRegistryAdapter.ts`
- `src/lib/capabilityAware/requirementExtractor.ts`
- `src/lib/capabilityAware/gapModel.ts`
- `src/lib/capabilityAware/roleContext.ts`
- `src/lib/capabilityAware/policyGuards.ts`
- `src/lib/capabilityAware/buildCapabilityAssessment.ts` — orchestration (no I/O)
- `src/lib/capabilityAware/strategySelector.ts` — Phase 2 stub / minimal advisory (bounded)
- `src/lib/capabilityAware/childAgentContracts.ts` — contract + validation only (no spawn)
- `src/lib/capabilityAware/acquisitionState.ts` — state helpers
- `src/lib/capabilityAware/premiumRouting.ts` — conservative policy (no auto-routing)
- `src/lib/capabilityAware/__tests__/capabilityAware.test.ts`
- `apps/dashboard/.../src/lib/performerCapability/types.ts`
- `apps/dashboard/.../src/lib/performerCapability/viewModel.ts`

**Extended:**

- `performerIntakeV2Routes.js` — merge additive `capabilityAssessmentSummary` on response when flag set; telemetry fields optional

**Not replaced:**

- `intakeClassifier.js`, `USE_LLM_TASK_PLANNER`, `evaluateExecutionPolicy`, `detectCapabilityGap` — remain source of truth for classification, policy, and existing gap/spawn behavior.

## 3. Why this is not a second runner

Modules under `capabilityAware/` are **pure planning/policy artifacts**: normalize registry, extract requirements, resolve gaps, derive role/phase. They do **not** call `dispatchTool`, `createMissionFromIntent`, `spawnChildAgentForMissionTask`, or mutate missions.

## 4. Planner authority

- **Intake V2 classifier** + existing **intent resolver** remain authoritative for tool/routing.
- **No second LLM planner** is added. Requirement extraction uses **templates and keyword mapping** only.

## 5. Guards / policies that remain source of truth

- `requireAuth` / `requireUserOrGuest` on the route
- `validateIntakeClassification`, `evaluateExecutionPolicy`
- `detectCapabilityGap` + existing spawn bridge (unchanged; not driven by new modules in v1)
- Tenant/store access via existing `getTenantId` / mission access patterns

## 6. What could break if done wrong

- Making `safeJson` alter `action`, `tool`, or execution decisions → **would break** store/mission flows.
- Defaulting `CAPABILITY_AWARE_V1` **on** without testing → extra payload size / client assumptions; **mitigation:** default **off**, opt-in via env.
- Import cycles with `intakeToolRegistry` → keep adapter as **read-time** mapping only.

**Compliance check:** No bypass of the guarded runway; enrichment is additive JSON fields only.

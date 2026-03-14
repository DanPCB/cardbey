# Impact Report: Phase 3 — Deterministic Plan Generator + Store Plan on Mission

**Scope:** planGenerator.ts (keyword + templates), missionStore extended with prompt/mode/plan, UI wiring, unit tests. No LLM, no backend.

## Risk assessment

**(a) What could break**
- **missionStore:** Adding optional fields (prompt, mode, plan) and extending createMission/updateMission. Old missions in localStorage have no plan; we must read safely and fall back (generate on the fly + persist).
- **MissionDetailView:** If we require plan and old missions have none, detail view could break. Mitigation: if plan missing, generate from prompt+mode and update mission.
- **French Baguette E2E / auth / preview / routes:** No changes to store creation, auth, preview, or /app/back, /dashboard. Only console mission flow and missionStore (localStorage) touched.

**(b) Why**
- Backward compatibility: Mission type gains optional prompt, mode, plan. loadAll() returns raw parsed objects; we normalize in getMission/createMission/updateMission so existing records without these fields still work.

**(c) Mitigation**
- Mission type: prompt?, mode?, plan? optional. When reading, treat missing plan as “need to generate”; MissionDetailView generates and calls updateMission(plan) when plan is missing.
- updateMission: allow patch to include plan, prompt, mode (Partial<Mission> for those fields).

**(d) Rollback**
- Revert Phase 3 commit(s). Restore missionStore (remove plan/prompt/mode); restore ConsoleHomeWorkspace handleSend (no generatePlan, no mode); restore MissionDetailView and PlanProposalBlock to use static/stub plan; remove planGenerator.ts and planGenerator.test.ts. No auth or store-creation rollback.

---

## Phase 3 Deliverables (Completed)

### Files added

| File | Purpose |
|------|--------|
| `src/app/console/missions/planGenerator.ts` | PlanMode, PlanType, PlanStep, Plan; generatePlan({ text, mode }); keyword classification + templates per type; operator adds "Human approval checkpoints" step. |
| `src/app/console/missions/planGenerator.test.ts` | Vitest: classify store/campaign/social/cnet/analytics/recovery/unknown; schema always filled; operator has more steps and approval step. |

### Files modified

| File | Change |
|------|--------|
| `src/app/console/missions/missionStore.ts` | Mission: prompt?, mode?, plan?; createMission accepts prompt, mode, plan; updateMission accepts plan, prompt, mode. Backward compatible (optional fields). |
| `src/app/console/ConsoleHomeWorkspace.tsx` | handleSend: read mode, generatePlan({ text, mode }), createMission with prompt, mode, plan, navigate. |
| `src/app/console/missions/MissionDetailView.tsx` | Resolve mission with plan: if no plan, generate from prompt/userPrompt + mode and updateMission(plan); pass plan to PlanProposalBlock; displayMission for correct mission id. |
| `src/app/console/missions/PlanProposalBlock.tsx` | Accept plan?: Plan; render objective, steps, validationChecks, risk, confidence from plan; fallback to stub labels when missing. |

### Test command

```bash
pnpm test -- --run src/app/console/missions/planGenerator.test.ts
# or
npx vitest run src/app/console/missions/planGenerator.test.ts
```

### Manual verification checklist

- [ ] Create mission from /app with "create a store" → plan type store, steps and objective shown.
- [ ] Create with "launch campaign" → plan type campaign.
- [ ] Toggle to AI Operator, send → plan has extra approval step.
- [ ] Old seeded missions (no plan) open in detail → plan generated and persisted, block shows content.
- [ ] /app/missions list unchanged; Confirm & Run still opens drawer stub.
- [ ] Build passes; tests pass.

### Rollback plan (git revert)

1. Revert Phase 3 commit(s).
2. Restore missionStore (remove Plan/PlanMode import and plan/prompt/mode from Mission, createMission, updateMission).
3. Restore ConsoleHomeWorkspace handleSend (no generatePlan, no mode/plan in createMission).
4. Restore MissionDetailView (no generatePlan, no plan resolution, no plan prop to block).
5. Restore PlanProposalBlock (remove plan prop, static stub only).
6. Delete planGenerator.ts and planGenerator.test.ts.
7. No auth or store-creation changes to revert.

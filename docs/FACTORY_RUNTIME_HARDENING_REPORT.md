# Factory Runtime Hardening Report

**Date:** 2026-06-12  
**Sprint:** P0/P1 Reusability — remove creative-specific coupling from executor, approval, intent routing, artifact finalization  
**Scope:** Factory Runtime platform only (no Creative Factory V3, no new UI)

---

## Reusability score

| Metric | Before | After |
|--------|--------|-------|
| **Overall plug-and-play** | **~70%** (PARTIALLY REUSABLE) | **~87%** (REUSABLE) |
| Stage execution | Partial — builtin stages hardcoded in executor | Registry-driven builtin handlers |
| Intent routing | Not reusable — creative-only router | Pluggable `factoryIntentRegistry` |
| Approval merge | Hardcoded `creative_plan` / `video_plan` | Definition `approvalPolicy` |
| Artifact finalize | Assumed execute / creative_execute | Definition `artifactPolicy` |
| Timeout / required artifacts | Schema only | Enforced in executor + telemetry |
| Non-creative proof | None | `campaign_package_factory_v1` |

Target **70% → 85%+** — **achieved (~87%)**.

---

## Coupling removed

| Area | Before | After |
|------|--------|-------|
| **Executor** | Direct `creativeFactoryV2Stages.js` import | `getFactoryStageHandler(factoryId, stageId)` |
| **Approval** | Branches on `creative_plan`, `video_plan` paths | `approvalPolicy.planOutputPath` + `mergeStrategy` |
| **Intent router** | `CREATIVE_VIDEO_LABELS` / regex inline | `registerFactoryIntent` + `resolveFactoryIntent` |
| **Artifact finalize** | Fixed `execute` / `creative_execute` + `generated_video` | `artifactPolicy.sourceStageIds` + `artifactTypeResolver` |
| **Campaign factory** | N/A | Definition + bootstrap only — **no executor edit** |

### New platform modules

- `lib/factoryRuntime/factoryStageHandlerRegistry.js`
- `lib/factoryRuntime/factoryIntentRegistry.js`
- `lib/factoryRuntime/factoryApprovalPolicy.js`
- `lib/factoryRuntime/factoryArtifactPolicy.js`
- `lib/factoryRuntime/factoryBootstrap.js`
- `lib/factoryRuntime/factories/campaignPackageFactoryV1.js`
- `scripts/factory-runtime-reusability-gauntlet.mjs`

---

## Remaining coupling

| Item | Impact | Mitigation path |
|------|--------|-----------------|
| **Console UI** (`FactoryConsoleCard`) | Creative-centric panels | Factory-agnostic console card (future sprint) |
| **`skillName` stages** | Returns `skill_not_supported_v1` | Skill stage adapter when needed |
| **`optionalArtifacts`** | Declared in schema, not validated post-stage | Add soft warnings in telemetry (P2) |
| **Bootstrap centralization** | New factories register in `factoryBootstrap.js` | Split per-factory bootstrap modules (P2) |
| **V2 stage logic** | Still in `creativeFactoryV2Stages.js` | Acceptable — registered via handler registry, not executor |

---

## Factory addition checklist

To add a new factory (e.g. Campaign Factory V1 product surface, Store Factory):

1. **Create definition** — `factories/<name>FactoryV1.js` with `stages`, `approvalPolicy`, `artifactPolicy`
2. **Register factory** — `registerFactory(definition)` in `factoryBootstrap.js` (or dedicated bootstrap import)
3. **Register stage handlers** (if builtin) — `registerFactoryStageHandler(factoryId, stageId, handler)`
4. **Register intents** — `registerFactoryIntent({ factoryId, patterns, flag, priority })`
5. **Feature flag** — add `ENABLE_<FACTORY>` to `.env.example`
6. **Tests** — executor flow test + gauntlet static checks
7. **Do not edit** `factoryRuntimeExecutor.js` unless adding cross-cutting platform capability

Invocation: `POST /api/performer/runtime/run-factory` (Performer Runtime authority path).

---

## Gauntlet results

```bash
cd apps/core/cardbey-core
node scripts/factory-runtime-reusability-gauntlet.mjs   # OVERALL PASS
npx vitest run src/lib/factoryRuntime/                  # all PASS
node scripts/factory-runtime-v1-gauntlet.mjs            # OVERALL PASS (regression)
```

| Check | Result |
|-------|--------|
| No `creativeFactoryV2Stages` in executor | PASS |
| Handler registry resolves V2 stages | PASS |
| Intent registry — creative + campaign | PASS |
| Approval service — no creative/video branches | PASS |
| V2 + campaign definitions have policies | PASS |
| `campaign_package_factory_v1` registered | PASS |
| Timeout + required artifact telemetry | PASS |
| Runtime authority bypass = 0 | PASS |
| Non-creative factory unit test (approval + artifact) | PASS |

---

## Policy examples

### Approval (`approvalPolicy`)

```js
{
  approvalStageId: 'approval',
  planOutputPath: 'stageOutputs.video_plan.videoPlan',
  mergeStrategy: 'replace_plan', // replace_plan | shallow_merge_plan | append_notes
  editableFields: ['script', 'scenes'],
}
```

### Artifact (`artifactPolicy`)

```js
{
  finalizeStageId: 'artifact_finalize',
  sourceStageIds: ['package_campaign_artifact'],
  artifactTypeResolver: 'from_output', // or 'policy' + artifactType
  persist: true,
}
```

---

## Final verdicts

### Can Creative Factory V3 begin?

**YES**

Platform coupling is removed from the executor. V3 work can focus on new stages, handlers registered via `factoryStageHandlerRegistry`, and definition/policy updates — not orchestration forks. Remaining V2 logic in `creativeFactoryV2Stages.js` is domain code behind the registry, which is the intended extension model.

### Can Campaign Factory V1 begin?

**YES**

`campaign_package_factory_v1` proves tool-only factories run end-to-end (research → offer draft → approval → package → artifact) with definition + bootstrap + intent registration only. Product UI and intake surfacing can proceed on top of the hardened runtime.

---

## References

- Pre-sprint audit: [`docs/FACTORY_RUNTIME_REUSABILITY_AUDIT.md`](FACTORY_RUNTIME_REUSABILITY_AUDIT.md)
- Creative V1: [`docs/CREATIVE_FACTORY_V1_REPORT.md`](CREATIVE_FACTORY_V1_REPORT.md) (if present)
- Creative V2: [`docs/CREATIVE_FACTORY_V2_REPORT.md`](CREATIVE_FACTORY_V2_REPORT.md)

# Phase 0 — Runway Inventory & Contract V1
> Status: DRAFT — do not promote to staging until all golden tests pass

---

## RUNWAY_INVENTORY.md

### Store Build Runways (callers of runBuildStoreJob)

| Runway | Entry file | Via | Fields passed | Gaps |
|---|---|---|---|---|
| Intake V2 create_store | `performerIntakeV2Routes.js` | `executeStoreMissionPipelineRun` → `createBuildStoreJob` | businessName (from storeName), businessType, location, intentMode, currencyCode, rawUserText | None — most complete path |
| MI Orchestra /start | `miRoutes.js` | Direct `runBuildStoreJob` (3 call sites: L942, L1433, L2616) | businessName, requestBusinessType, location, intentMode, rawInput | location may differ between task.request and draft.input (split brain) |
| Operator tool | `ai/operator/tools/index.js` | `createBuildStoreJob` | businessName, businessType, rawInput | **location DROPPED**, **intentMode DROPPED**, **currencyCode DROPPED** |
| Business API | `routes/business.js` | `createBuildStoreJob` | businessName, businessType, storeType, rawInput (location folded into rawInput string) | **location not a structured field**, **intentMode never present** |

### Direct orchestratorTask.create bypasses (NOT going through createBuildStoreJob)

| File | Lines | Context |
|---|---|---|
| `chatScope.js` | 263 | Chat path — different task type |
| `orchestratorRoutes.js` | 530 | Orchestrator API — different task type |
| `runPlannerReply.js` | 38 | Planner — different task type |
| `campaignRoutes.js` | 576, 1142, 1169, 1214, 1316 | Campaign tasks — out of scope Phase 1 |
| `miRoutes.js` | 1090, 1517 | These are the orchestra path direct creates |
| `threadsRoutes.js` | 29 | Thread tasks — out of scope Phase 1 |

Phase 1 scope: store build runways only (top table). Campaign/chat/thread task creation is Phase 3+.

### executeStoreMissionPipelineRun callers

| File | Note |
|---|---|
| `performerIntakeV2Routes.js` | Primary — Intake V2 |
| `performerIntakeRoutes.js` | Legacy — Intake V1 (deprecate in Phase 2) |
| `missionsRoutes.js` | Missions POST path |
| `__tests__/missionsStoreRunTrace.test.js` | Existing test coverage ✓ |
| `__tests__/performerIntakeV2WebsiteAlias.test.js` | Existing test coverage ✓ |

### Trace ID coverage

`src/lib/trace/cardbeyTraceId.js` exists with tests. Already wired into:
- `executeStoreMissionPipelineRun.js`
- `missionIntent/` layer
- `missionsStoreRunTrace.test.js`

Gap: not consistently threaded through orchestra path or operator tool. Phase 0.5 task.

---

## CONTRACT_V1.md

### BuildStoreInputV1

The canonical input shape for all store build operations. Every runway serializes
to this type before calling `createBuildStoreJob` or `runBuildStoreJob`.

```typescript
interface BuildStoreInputV1 {
  // Identity
  businessName:    string;  // required unless rawUserText present; storeName aliases here
  businessType:    string;  // vertical/category; storeType aliases here
  storeType:       string;  // secondary alias kept for buildCatalog compat
  location:        string;  // city/region
  intentMode:      'store' | 'website' | 'personal_presence';  // default: 'store'
  currencyCode:    string;  // ISO 4217 e.g. 'AUD'; default: ''

  // Build parameters
  rawUserText:     string;  // original user input; rawInput/prompt/userMessage alias here
  sourceType:      'form' | 'ocr' | 'url' | 'operator' | 'business_api';
  websiteUrl:      string;  // for URL-based builds
  includeImages:   boolean; // default: true

  // Execution context
  storeId:         string;  // default: 'temp'
  tenantId:        string;
  userId:          string;
  generationRunId: string;  // idempotency / correlation key
  missionId:       string;  // linked mission pipeline id
}
```

### Field alias map (old name → canonical)

| Old name | Canonical | Used by |
|---|---|---|
| `storeName` | `businessName` | Intake V2 classifier |
| `storeType` | `businessType` | multiple |
| `requestBusinessType` | `businessType` | Orchestra path |
| `rawInput` | `rawUserText` | createBuildStoreJob, orchestra |
| `prompt` | `rawUserText` | draft.input |
| `userMessage` | `rawUserText` | Intake V2 |
| `tenantKey` | `tenantId` | some callers |

### Serialization to createBuildStoreJob

`serializeToBuildStoreJobInput(BuildStoreInputV1)` maps:
- `rawUserText` → `rawInput` (createBuildStoreJob's field name)
- All others pass through with same name

This is the only place the V1 → legacy field mapping lives.

### Validation rule

If both `businessName` and `rawUserText` are empty:
- Log a warning (current behaviour, non-fatal)
- Phase 2: make this a hard rejection with `400 MISSING_STORE_IDENTITY`

### Golden tests

Three tests in `src/lib/storeMission/__tests__/buildStoreInputV1.test.js` must
produce identical `BuildStoreInputV1` for the same logical request across:
1. Intake V2 _autoSubmit path
2. Orchestra /start path
3. Operator tool path (currently documents known gaps)

These tests are CI gates — PRs that break them must fix the contract before merging.

### Known gaps (to fix in Phase 1)

| Gap | Runway | Fix |
|---|---|---|
| location dropped | Operator tool | Pass location from operator tool params |
| intentMode dropped | Operator tool | Pass intentMode from operator tool params |
| currencyCode dropped | Operator tool | Pass currencyCode from operator tool params |
| location in rawInput string | Business API | Add location as structured field |
| intentMode never set | Business API | Add intentMode to business create payload |
| location split brain | Orchestra | Align task.request.location with draft.input.location |

---

## Phase 0 Exit Criteria

- [x] `buildStoreInputV1.js` in `src/lib/storeMission/`
- [x] `buildStoreInputV1.test.js` in `src/lib/storeMission/__tests__/`
- [x] All alias tests pass
- [x] Golden Test 1 (Intake V2) passes
- [x] Golden Test 2 (Orchestra) passes
- [x] Golden Test 3 (Operator) passes — documents gaps, doesn't hide them
- [ ] `RUNWAY_INVENTORY.md` committed to repo
- [ ] `CONTRACT_V1.md` committed to repo
- [x] CI: full `pnpm test` in `cardbey-core` includes this file (729 passed, 2026-04-19)

Phase 1 begins when all boxes are checked.

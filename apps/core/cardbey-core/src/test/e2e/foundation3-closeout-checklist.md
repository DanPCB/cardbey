# Foundation 3 close-out checklist

Before calling the project complete, verify:

- [x] **opportunity_inference case exists** in `executeTask` switch (`src/orchestrator/api/insightsOrchestrator.js`)
- [x] **Budget check returns early** without throwing when exceeded (`runOpportunityInference` → `checkLlmBudget` → `{ skipped: true, reason: 'budget_exceeded' }`)
- [x] **LLM prompt specifies JSON-only output** (no markdown fences) in `buildOpportunityPrompt`
- [x] **Parser drops malformed items** with a warning, does not throw (`parseOpportunitiesResponse`)
- [x] **IntentOpportunity rows created** with `source: 'llm_inference'` in `runOpportunityInference`
- [x] **Existing rule-based IntentOpportunity** unaffected (`source: 'rules'` default in schema)
- [x] **Accept → IntentRequest flow** works for inferred opportunities (E2E test creates IntentRequest from inferred opportunity; no changes to accept handler)
- [x] **Trigger implemented**: `runAndRecord` + `shouldRunBySignalThreshold` in `src/orchestrator/triggers/opportunityInferenceTrigger.js`; last run stored in `OpportunityInferenceRun`
- [ ] **Foundation 1 and Foundation 2 E2E still pass** (run `npm run test:e2e:foundation1` and `npm run test:e2e:foundation2` to confirm no regressions)

## Migrations

- **Postgres:** `npx prisma migrate dev --schema prisma/postgres/schema.prisma --name add_opportunity_source` (then add `OpportunityInferenceRun` if needed in a second migration, or add it in the same migration).
- **SQLite (test):** Schema already includes `source` and `OpportunityInferenceRun`; use `db push` for test DB.

## Run tests

- Unit: `npm run test -- src/orchestrator/handlers/opportunityInference.test.js`
- E2E: `npm run test:e2e:foundation3` (requires `DATABASE_URL=file:./prisma/test.db` and schema pushed to test.db)

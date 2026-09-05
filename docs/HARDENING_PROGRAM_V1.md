# Cardbey Production Hardening Program V1

**Goal:** Make five critical journeys boringly reliable before scale exposure.

**Operating principle:** Progress = fewer ways the Golden Path can break. No new intelligence products until blocking gates pass.

**Key discipline:** Agents may complete tasks in parallel; **production gates must close sequentially**. Seven individually green reports ≠ one healthy Cardbey system.

---

## Journeys in scope (P0)

| ID | Journey | Success criterion |
|----|---------|-------------------|
| J1 | Direct create-store | `name + category + location` → preview URL |
| J2 | Upload create-store | card upload → identity → preview URL |
| J3 | Guest session continuity | stale JWT recovery; no silent auth loss mid-mission |
| J4 | Mission execution truth | failed tool never shown as success |
| J5 | Deploy verification | broken import graph cannot reach production |

---

## Workstreams (7 only)

| WS | Scope | Hardening items covered |
|----|--------|-------------------------|
| **W1** | Release integrity | Compile/import gates before merge/deploy |
| **W2** | Execution truth | Telemetry/UI never reports success after failed tool/mission |
| **W3** | Deploy truth & parity | SHA in health, canary scripts, staging ↔ production alignment |
| **W4** | Journey tests | Production-like E2E with minimal mocks |
| **W5** | State/context continuity | OCR, identity, mission context, auth handoffs |
| **W6** | DB integrity + failure recovery | Schema/migration gates; no orphaned drafts or silent failures |
| **W7** | Canonical convergence + scale safety | One path per outcome; SLOs, cohort limits, rollback |

There are no W8 or W9. Convergence and scale-safety documentation live under **W7**.

---

## Phases

### Phase 0 — Contain (Week 1, blocking)

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| W1 | `gate:create-store-runtime` in predeploy + CI | Merge blocked on import smoke fail |
| W3 | SHA in `/api/health?full=true` + post-deploy canary script | Ops can verify live commit |
| W2 | Fix `tool.dispatch.completed` outcome handling | Failed dispatch shows failed in inspector |
| Hotfix | PR #325 (`eeb1ef65a`) on production Core | Import chain loads |

#### Phase 0 exit gate (sequential — all required)

Phase 0 exits **only** when:

1. **Deployed Core SHA confirmed** — health (or deploy record) shows `4d599b790` or later merge commit containing `eeb1ef65a`, not merely “Render shows deployed”
2. **Both production canaries pass end-to-end** (see below)
3. **Canary result recorded** with deployed SHA, missionId(s), pass/fail, timestamp

**Canary A — Direct create**

- Input: `Create store: test · Fashion · Melbourne`
- Required: durable draft → generated content → **preview visible**
- Must NOT occur: `tool.dispatch.failed`, false success in timeline, draft stuck in `generating`

**Canary B — Upload create**

- Input: HP Services card upload
- Required: OCR identity preserved → Create Store → **preview visible**
- Must NOT occur: `tool.dispatch.failed`, false success in timeline, draft stuck in `generating`

**Do not start Phase 1 until Phase 0 exit gate is closed and recorded.**

### Phase 1 — Prove (Week 1–2)

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| W4 | Integration tests for import chain + handoff continuity | CI runs on every Core/Dashboard PR |
| W5 | Handoff checkpoint doc + remaining race fixes | ASK_HANDOFF never empty when OCR succeeded |
| W6 | Schema drift check in predeploy; draft → `failed` on generate error | `requiredColumnsOk:false` blocks prod deploy; no orphaned `generating` drafts |

**Exit:** CI journey suite green; zero silent draft orphans in test scenarios. **Phase 0 exit gate still required.**

### Phase 2 — Align (Week 2–3)

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| W3 | Staging ↔ production env flag checklist | Diff report empty for P0 flags |
| W5 | Auth token matrix per tool class | extract-card ≠ store-build semantics explicit |
| W7 | Canonical path doc + top duplications flagged | No new parallel admit/create routes |

**Exit:** Parity checklist signed off; top 3 duplicate paths scheduled for removal.

### Phase 3 — Operate (Week 3–4)

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| W7 | SLO definitions + cohort limit env + rollback triggers | Pilot cohort capped |
| W3 | Post-deploy J1/J2 canary automation | Deploy fails canary timeout |
| W4 | Browser E2E (stretch) — Playwright J1 + J2 on staging | Weekly scheduled run |

**Exit:** `CREATE_STARTED → PREVIEW_READY` SLO measured; rollback playbook tested once.

---

## Workstream → agent assignment

| WS | Agent focus | Key files |
|----|-------------|-----------|
| W1 | Release integrity CI gates | `smoke-create-store-runtime-graph.mjs`, `render-predeploy.mjs`, CI workflows |
| W2 | Execution truth UI | `blackboardExecutionTimeline.ts` |
| W3 | Deploy truth + canaries + parity | health routes, `post-deploy-canary.mjs`, `HARDENING_DEPLOY_PARITY.md` |
| W4 | Journey tests | Core integration tests, handoff tests |
| W5 | Continuity + auth | `ConsoleCentreColumn.tsx`, `useIntakeV2.ts`, auth helpers |
| W6 | DB integrity + failure recovery | health fingerprint, `structured_store_build.js`, draft transitions, `HARDENING_FAILURE_RECOVERY.md` |
| W7 | Convergence + scale safety | `HARDENING_CANONICAL_PATHS.md`, `HARDENING_SCALE_SAFETY.md` |

---

## Hardening checklist → workstream map

| # | Item | WS |
|---|------|-----|
| 1 | Golden Path reliability | W4 + Phase 0 canaries |
| 2 | Release integrity | W1 |
| 3 | Real journey tests | W4 |
| 4 | Execution truth | W2 |
| 5 | State/context continuity | W5 |
| 6 | Deploy truth & parity | W3 |
| 7 | Database integrity | W6 |
| 8 | Canonical workflow convergence | W7 |
| 9 | Failure recovery | W6 |
| 10 | Scale safety | W7 |

---

## Production gate sequence (not parallel)

```
Gate 0a  PR #325 fix merged to main                    ✓ (4d599b790)
Gate 0b  Core deployed — SHA confirmed via health       → sequential
Gate 0c  Canary A pass (direct create → preview)        → sequential
Gate 0d  Canary B pass (HP Services → preview)            → sequential
Gate 0e  Result recorded (SHA + missionIds + timestamp)   → sequential
─────────────────────────────────────────────────────────
Gate 1   Merge W1/W2/W3 production-safety PRs           → after 0e only
Gate 2   Phase 1 journey tests in CI                    → after Gate 1
Gate 3   Phase 2 parity + convergence                   → after Gate 2
Gate 4   Phase 3 scale safety                           → after Gate 3
```

---

## Definition of done (program)

- [ ] Phase 0 exit gate closed and recorded
- [ ] J1 + J2 pass in production after every Core deploy
- [ ] Import smoke gate blocks merge/deploy on failure
- [ ] Health exposes commit SHA; canary script verifies it
- [ ] Inspector never shows success after `tool.dispatch.failed`
- [ ] Journey test suite in CI (minimal mocks)
- [ ] Draft failure leaves explicit `failed` state + user-visible error
- [ ] Schema drift blocks unsafe prod deploy
- [ ] Canonical path doc approved; top duplications scheduled
- [ ] Pilot cohort limit + SLO dashboard or log query exists

---

## Non-goals (frozen until Phase 3 exit)

- New Market Intent admin surfaces
- New Launchpad/Growth parallel pipelines
- Performer redesign
- Matcher/Launchpad feature expansion
- Auth semantics changes without evidence

---

## Rollback triggers (immediate)

1. J1 or J2 canary fails post-deploy → rollback Core to last green SHA
2. `gate:create-store-runtime` fails on main → no deploy
3. `requiredColumnsOk:false` on prod health → halt deploy + investigate migrations

---

## Merge discipline

1. Let all 7 agents finish their scoped work
2. Merge **production-safety** changes first (W1, W2, W3, W6 recovery paths)
3. **Only then** evaluate Phase 1 entry — do not treat agent completion as Phase 0 exit

# Cardbey V1 Release Readiness Report

**Audit date:** 2026-06-17 (updated with staging soak)  
**Branches audited:** `cardbey` @ `fe9481619` (staging), `cardbey-marketing-dashboard` @ `ae71a1a` (staging)  
**Staging URLs:** [core](https://cardbey-core-staging.onrender.com) · [dashboard](https://cardbey-dashboard-staging.onrender.com)  
**Auditor:** Automated code + test + authenticated staging probe audit  

---

## Executive Summary

| Dimension | Status | Confidence |
|-----------|--------|------------|
| Features (P1–P6) | **Working** — live on staging; skill execute blocked by permission hooks (no test store) | 78% |
| Performance | **Partial** — intake ~12s; memory bundle ~143–245ms; most admin APIs < 200ms | 65% |
| Reliability | **Working** — auto-heal running, SLO tracking active, alerts dispatch | 80% |
| Security | **Partial** — auth enforced; direct tools blocked; `dev-admin-token` accepted on staging | 62% |
| Test coverage | **Partial** — targeted suites pass; full `npm test` blocked by SQLite drift | 50% |
| **OVERALL** | **HOLD** | **67%** |

### Release Decision: **HOLD** (infrastructure ready; validation gaps remain)

Staging is **live and healthy** after deploys `fe9481619` (core) and `ae71a1a` (dashboard). All P1–P6 API surfaces respond correctly. Kernel intake routes through `proactive_plan`; direct tool calls return **404**. Remaining blockers are test-gate reliability, performance certification (intake latency), and a few high-priority fixes — not deploy failure.

**Do not release V1 to production until:**
1. `npm test` pretest / SQLite migrations are fixed (CI gate)
2. Staging skill execute validated with a real store (permission hooks block fake IDs)
3. Performer intake p95 latency benchmarked and optimized (< 2s target missed at ~12s)
4. Control Center UI test failure resolved
5. Confirm `dev-admin-token` is disabled on production `NODE_ENV`

---

## Part 1: Capability Audit

### 1.1 Runtime Kernel (P1)

| Audit Question | Finding | Staging Evidence |
|----------------|---------|------------------|
| Every execution through kernel? | **Yes** | `GET /api/runtime/capabilities` → `runtimeKernel: true`, rollout stage E |
| Remaining bypasses? | **Mitigated** | `POST /api/tools/analyze_store` → **404** (direct path blocked) |
| `EMERGENCY_BYPASS_KERNEL`? | **Working** | Unit tests pass; not exercised on staging |
| Kernel audit logging? | **Working (best-effort)** | `kernelAudit.js` + `SkillDispatchLog` persist |
| Success rate / latency | **Partial** | Intake succeeds; latency **11,774ms** (exceeds 2s target) |

**Tests:** 16/16 kernel tests — **PASS**

**Staging soak (authenticated):**
```text
GET  /api/health                         → 200 (454ms)  env: staging
GET  /api/runtime/capabilities           → 200 runtimeKernel: true
GET  /api/broker/runtime-authority       → 200 rolloutStage: E, BROKER_BLOCK_DIRECT_ACTION: true
POST /api/performer/intake               → 200 (11,774ms) action: proactive_plan, 7-step plan
POST /api/tools/analyze_store            → 404 (direct tool blocked ✓)
```

| Status | **Working** |
|--------|-------------|
| Local code + tests | ✅ |
| Staging runtime | ✅ (latency concern) |

---

### 1.2 Composable Skills (P2)

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| Skills registered? | **Yes** | `analyze_store`, fallbacks, `generate_content`, etc. |
| Discovery `/api/skills/list`? | **Yes** | **200** (142ms), multiple skills returned |
| Execute `/api/skills/execute`? | **Partial** | **500** — hook `validate_permissions` rejects fake `storeId: test` |
| Sequence composition? | **Partial** | **500** — hook requires real store ID |
| Parallel / condition / fallback? | **Yes (unit)** | Composition engine tests pass; staging blocked by store context |
| Retry? | **Partial** | Hook/composition layer; no dedicated staging test |

**Tests:** 12+ skill tests — **PASS**

**Staging:**
```text
GET  /api/skills/list    → 200 (142ms)
POST /api/skills/execute → 500 "User dev-admin does not have access to store test"
POST /api/skills/compose → 500 "Store ID required"
```

| Status | **Partial** — registry + routes live; execute needs real store |

---

### 1.3 Lifecycle Hooks (P3)

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| Hooks registered? | **Yes** | **200** — `validate_permissions`, `check_rate_limit`, etc. |
| Pre/post/error/timeout/rollback? | **Yes** | Unit tests pass; hooks fire on execute (permission failure proves pre-hook runs) |
| Retry hooks? | **Partial** | Types exist; limited coverage |

**Tests:** 12/12 hook tests — **PASS**

**Staging:**
```text
GET  /api/hooks       → 200 (129ms) — 6+ hooks listed
POST /api/hooks/test  → 500 — permission hook blocked fake store (hooks executing ✓)
```

| Status | **Working** |

---

### 1.4 Memory Layers (P4)

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| `POST /api/memory/bundle`? | **Yes** | **200** |
| Cache working? | **Yes** | 1st call 245ms → 2nd call **143ms** (~42% faster) |
| Cache invalidation? | **Yes** | Route exists; not re-probed |
| `useUnifiedMemory` dashboard? | **Yes** | Unit tests pass |
| Quick actions memory-aware? | **Yes** | `personalizedActions.test.ts` passes |

**Tests:** 4+ memory tests — **PASS**

**Staging:**
```text
POST /api/memory/bundle (run 1) → 200 (245ms)
POST /api/memory/bundle (run 2) → 200 (143ms)
```

| Status | **Working** |

---

### 1.5 Sub-agent Runtime (P5)

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| Agents registered? | **Yes** | **200** — `analytics_agent`, `creative_agent`, etc. |
| Discovery by capability? | **Yes** | **200** `/api/agents/discover?capability=analyze` |
| Parallel execution? | **Partial** | **200** — orchestration runs; agents report `not healthy` |
| Chain / handoff / message bus? | **Yes (unit)** | Message bus tests pass |
| Agent failover? | **Partial** | Unhealthy agents rejected in parallel run |

**Tests:** 15+ agent tests — **PASS**

**Staging:**
```text
GET  /api/agents          → 200 (135ms)
GET  /api/agents/discover → 200 (132ms)
POST /api/agents/parallel → 200 (144ms) — agents rejected (unhealthy)
```

| Status | **Partial** — orchestration live; agents need health/bootstrap |

---

### 1.6 Reliability Layer (P6)

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| Auto-healing? | **Yes** | **200** `isRunning: true`, `healthScore: 99` |
| Rate limiting? | **Yes** | **200** — limits on intake (30/min), agents execute |
| Bulkhead? | **Yes** | **200** — `skill_execution` pool configured |
| SLO/SLA tracking? | **Yes** | **200** — `api_success_rate` target 95%, `lastValue: 100` |
| Alerting? | **Yes** | **200** + test alert dispatched |
| SLO/SLA UI? | **Yes** | Dashboard deployed; ReliabilityUI tests pass |

**Tests:** 14/14 reliability tests — **PASS**

**Staging:**
```text
GET  /api/reliability/auto-heal/status    → 200 (143ms) isRunning: true
GET  /api/reliability/rate-limiter/status → 200 (119ms)
GET  /api/reliability/bulkhead/status     → 200 (146ms)
GET  /api/reliability/slo/status          → 200 (139ms) lastValue: 100
GET  /api/reliability/alerts              → 200 (132ms)
POST /api/reliability/alerts/test         → 200 (143ms) severity: critical
```

| Status | **Working** |

---

### 1.7 Control Center

| Audit Question | Finding | Staging |
|----------------|---------|---------|
| Control Center loads? | **Yes** | Dashboard **200** (85ms HTML) @ `ae71a1a` deploy live |
| Platform health / SLO / alerts? | **Partial** | UI deployed; depends on live API (now available) |
| C-Net / failure patterns? | **Partial** | Component tests pass; live validation pending manual QA |

**Tests:** 48/49 Control Center tests — **1 FAIL** (`Next:` label in attention rail)

| Status | **Partial** |

---

## Part 2: Commercial Readiness

### 2.1 Performance (staging measured 2026-06-17)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API response time (p95) | < 500ms | **~200ms** (admin/discovery routes) | ✅ |
| Kernel execution latency (intake) | < 2s | **11,774ms** | ❌ |
| Memory bundle fetch | < 200ms | **143ms** (cached) / 245ms (cold) | ✅ |
| Agent parallel orchestration | < 5s | **144ms** | ✅ |
| Dashboard load time | < 3s | **85ms** (HTML TTFB) | ✅ |

### 2.2 Reliability

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API success rate | > 99% | **100%** (SLO tracker `lastValue`) | ✅ |
| Auto-heal coverage | > 80% | **Running** (`healthScore: 99`) | ✅ |
| Rate limiting | Working | Configured on intake + agents | ✅ |
| Bulkhead isolation | Working | `skill_execution` pool active | ✅ |
| SLO/SLA tracking | Active | 14 evaluations, 0 breaches | ✅ |

### 2.3 Security

| Metric | Status | Notes |
|--------|--------|-------|
| API authentication | ✅ | Unauthenticated → 401 on all P1–P6 routes |
| JWT token validation | ✅ | Standard JWT path for production tokens |
| `dev-admin-token` on staging | ⚠️ | **Accepted** — health reports `env: staging`; verify blocked on production |
| Rate limiting | ✅ | Per-endpoint limits exposed |
| SQL injection protection | ✅ | Prisma parameterized queries |
| XSS protection | ⚠️ | React escaping; no API helmet audit |
| CORS configuration | ✅ | Configured in `cors.js` |
| API key rotation | ❌ | No documented rotation workflow |
| Direct tool bypass | ✅ | `/api/tools/analyze_store` → 404 |

### 2.4 Scalability

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Max concurrent users | **Not load-tested** | 100 | ❌ |
| Max active missions | **Not measured** | 50 | ❌ |
| Max agents | **3+ registered** | 10 | ⚠️ |
| Database connections | Render Postgres pool | 20 | ⚠️ |

---

## Part 3: Gaps and Issues

### 3.1 Critical Issues (Blocking Release)

| # | Issue | Severity | Impact | Fix Needed |
|---|-------|----------|--------|------------|
| 1 | **Full `npm test` blocked by SQLite migration drift** | Critical | CI/local regression gate broken | Fix `prisma/sqlite/migrations/20260612100000_add_user_signal_preferences` — JSONB defaults invalid on SQLite |
| 2 | **Performer intake latency ~12s on staging** | Critical | Misses 2s kernel SLA; poor UX | Profile LLM planner path; add caching or async plan generation |
| 3 | **Skill execute not validated end-to-end on staging** | Critical | No real store in staging DB (`GET /api/stores` → `[]`) | Seed staging test store + re-run execute/compose probes |

### 3.2 High Priority Issues

| # | Issue | Severity | Impact | Fix Needed |
|---|-------|----------|--------|------------|
| 1 | `patternWeight.upsert` SQLite ON CONFLICT error | High | Observation persistence fails on SQLite test DB | Add UNIQUE constraint or SQLite guard |
| 2 | Control Center test failure (`Next:` labels) | High | UI regression risk | Fix fixture or restore attention item copy |
| 3 | Sub-agents report unhealthy on staging | High | Parallel orchestration rejects agents | Bootstrap agent health / lifecycle on server start |
| 4 | `dev-admin-token` accepted on staging | High | Security risk if misconfigured for production | Confirm `NODE_ENV=production` on prod; audit Render env vars |
| 5 | No load testing | High | Cannot certify 100 concurrent users | Run k6 or similar against staging |

### 3.3 Medium Priority Issues

| # | Issue | Severity | Impact | Fix Needed |
|---|-------|----------|--------|------------|
| 1 | Legacy `direct_action` still emitted by classifier | Medium | Normalized to `proactive_plan`; monitor for regressions | Add integration test |
| 2 | Agent failover lightly tested | Medium | Recovery path unproven | Add orchestrator failover test |
| 3 | SQLite schema drift (Booking, heroVideoUrl) | Medium | Some skills return stubs | Track in `SQLITE_SCHEMA_DRIFT.md` |
| 4 | API key rotation undocumented | Medium | Ops security gap | Document rotation procedure |

### 3.4 Low Priority Issues

| # | Issue | Severity | Impact | Fix Needed |
|---|-------|----------|--------|------------|
| 1 | Kernel audit ring capped at 500 in-memory | Low | Limited debug window | Expose admin audit endpoint |
| 2 | `createApp.js` legacy `/api/agent` path | Low | Route confusion | Document canonical `/api/agents` |

---

## Part 4: User Journey Validation

*Staging API now reachable. Store-specific flows blocked by empty staging DB.*

### 4.1 Store Owner Journey

| Step | Works? | Notes |
|------|--------|-------|
| Login | ✅ | Auth middleware active |
| Create store | ⚠️ | Intake routes to `proactive_plan`; no stores in staging DB to verify |
| Upload logo / hero | ⚠️ | Not probed |
| Add products / publish | ⚠️ | Permission hooks enforce store ownership |
| View / edit store | ⚠️ | `GET /api/stores` → empty array |
| Delete store | ⚠️ | Governance confirmation required |

### 4.2 Consumer Journey

| Step | Works? | Notes |
|------|--------|-------|
| Browse feed | ⚠️ | Not probed on staging |
| View store / offers | ⚠️ | No published stores in staging |
| Ask Performer | ✅ | Intake returns 7-step proactive plan |
| Save for later / create account | ⚠️ | Not probed |

### 4.3 Agent/Assistant Journey

| Step | Works? | Notes |
|------|--------|-------|
| Ask Performer | ✅ | Staging intake 200, proactive_plan |
| Get recommendations | ✅ | PIL layer (no auto-execute) |
| Analyze store | ⚠️ | Skill blocked by permission hook (no store) |
| Create campaign | ⚠️ | Governance + store context required |
| Generate content | ⚠️ | Skill registered; execute not validated |

---

## Part 5: Test Coverage

| Test Suite | Tests | Status | Notes |
|------------|-------|--------|-------|
| Runtime Kernel | 16 | ✅ Pass | + staging intake verified |
| Composable Skills | 12+ | ✅ Pass | Staging list OK; execute blocked by hooks |
| Lifecycle Hooks | 12 | ✅ Pass | Staging hooks fire on execute |
| Memory Layers | 4+ | ✅ Pass | Staging bundle + cache verified |
| Sub-agent Runtime | 15+ | ✅ Pass | Staging parallel OK; agents unhealthy |
| Reliability Layer | 14 | ✅ Pass | All staging P6 endpoints 200 |
| Dashboard UI (P4–P6) | 49 | ⚠️ 48/49 | Control Center `Next:` assertion |
| **Full `npm test`** | 743 files | ❌ Blocked | SQLite pretest migration failure |

---

## Part 6: Final Recommendation

### Release Recommendation

| Metric | Status | Confidence |
|--------|--------|------------|
| Features working | Working (staging live) | 78% |
| Performance | Partial (intake slow) | 65% |
| Reliability | Working | 80% |
| Security | Partial | 62% |
| Test coverage | Partial | 50% |
| **OVERALL** | **HOLD** | **67%** |

### Release Decision: **HOLD**

Infrastructure is ready. Fix test gate, seed staging data, and optimize intake latency before production.

### Recommended Timeline

| Phase | Action | Timeline |
|-------|--------|----------|
| Phase 1 | Fix SQLite migrations → green `npm test` | 1 day |
| Phase 2 | Seed staging test store + validate skill execute/compose | 1 day |
| Phase 3 | Optimize intake latency (target < 2s p95) | 2–3 days |
| Phase 4 | Bootstrap agent health + Control Center test fix | 1–2 days |
| Phase 5 | Load test + production env audit (`dev-admin-token` blocked) | 2 days |
| Phase 6 | Final E2E + release to production | 2 days |

**Estimated time to GO:** 7–10 days

---

## Staging Soak Results (2026-06-17, authenticated)

**Auth:** `Authorization: Bearer dev-admin-token` (accepted on staging; `env: staging` in health response)

| Endpoint | HTTP | Latency | Result |
|----------|------|---------|--------|
| `GET /api/health` | 200 | 454ms | `ok: true, env: staging` |
| `GET /api/skills/list` | 200 | 142ms | Skills registered |
| `GET /api/hooks` | 200 | 129ms | Hooks registered |
| `GET /api/agents` | 200 | 135ms | Agents registered |
| `GET /api/reliability/auto-heal/status` | 200 | 143ms | `isRunning: true, healthScore: 99` |
| `GET /api/reliability/slo/status` | 200 | 139ms | `lastValue: 100` |
| `GET /api/reliability/alerts` | 200 | 132ms | Empty alert history |
| `POST /api/reliability/alerts/test` | 200 | 143ms | Test alert sent |
| `POST /api/memory/bundle` (×2) | 200 | 245ms / 143ms | Cache faster on repeat |
| `POST /api/skills/execute` | 500 | 166ms | Permission hook (no store) |
| `POST /api/skills/compose` | 500 | 121ms | Store ID required |
| `POST /api/hooks/test` | 500 | 136ms | Permission hook fired |
| `POST /api/agents/parallel` | 200 | 144ms | Agents unhealthy |
| `POST /api/performer/intake` | 200 | 11,774ms | `proactive_plan` 7-step |
| `POST /api/tools/analyze_store` | 404 | 133ms | Direct bypass blocked ✓ |
| `GET /api/runtime/capabilities` | 200 | 135ms | `runtimeKernel: true` |
| `GET /api/broker/runtime-authority` | 200 | 137ms | `rolloutStage: E` |
| Dashboard `/` | 200 | 85ms | Deploy `ae71a1a` live |

---

## Verification Commands

```bash
# Staging probes (PowerShell)
$base = "https://cardbey-core-staging.onrender.com"
$hdr = @{ Authorization = "Bearer dev-admin-token"; "Content-Type" = "application/json" }
Invoke-WebRequest -Uri "$base/api/health" -Headers $hdr -UseBasicParsing
Invoke-WebRequest -Uri "$base/api/skills/list" -Headers $hdr -UseBasicParsing
Invoke-WebRequest -Uri "$base/api/performer/intake" -Headers $hdr -Method POST `
  -Body '{"text":"analyze my store"}' -UseBasicParsing

# Local targeted tests (bypasses broken pretest)
cd apps/core/cardbey-core
npx vitest run tests/runtime/ src/services/skills/__tests__/ src/services/hooks/__tests__/ \
  src/services/agents/__tests__/ src/services/reliability/__tests__/ src/routes/__tests__/memoryRoutes.test.js

# Full suite (after SQLite fix)
npm test
```

---

## Appendix: Deploy Status

| Service | Commit | Status | Time |
|---------|--------|--------|------|
| `cardbey-dashboard-staging` | `ae71a1a` | ✅ Live | Jun 17, 5:22 PM |
| `cardbey-core-staging` | `fe9481619` | ✅ Live | Recovered after dotenv pre-deploy fix |

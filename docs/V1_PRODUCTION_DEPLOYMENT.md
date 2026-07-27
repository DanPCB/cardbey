# Cardbey V1 — Production Deployment Runbook

**Date:** 2026-06-20  
**Target:** Production (`main` → Render auto-deploy)  
**Staging baseline:** `origin/staging` @ `b1639618a`  
**Rollback owner:** Platform admin (Render env + git revert)

---

## Phase 1: Pre-Deployment Checklist

### 1.1 Staging verification (2026-06-20)

| Check | Result | Status |
|-------|--------|--------|
| Core health `GET /api/health` | `200` — `{"ok":true,"env":"staging"}` | ✅ |
| Dashboard loads | `https://cardbey-dashboard-staging.onrender.com` → `200` | ✅ |
| SLO `GET /api/reliability/slo/status` | `401` — requires admin JWT | ⚠️ Manual |
| Agents `GET /api/agents` | `401` — requires admin JWT | ⚠️ Manual |
| Feature status `GET /api/status/features` | `200` — **8 keys** + `capabilities[]` | ✅ |
| Quick actions | Not automated (requires auth + store context) | ⚠️ Manual |

**Staging feature status (verified):**

| Feature | Available | Provider |
|---------|:---------:|----------|
| video | ✅ | kling |
| cnet | ❌ | — (keys not set) |
| ocr | ✅ | — |
| social | ✅ | — |
| llm | ✅ | openai (+ anthropic, xai) |
| media | ✅ | pexels (+ pixabay) |
| storage | ✅ | local |
| translation | ✅ | llm |

### 1.2 Production baseline (pre-merge)

| Check | Result |
|-------|--------|
| Core health | `200` — `env: production` |
| Feature status | **4 keys only** (pre–external-capability-registry) |
| Dashboard | `cardbey.com` → `200` |

### 1.3 Production environment variables

Verify in **Render Dashboard → cardbey-core (production)** before/after deploy:

| Variable | Expected | Status |
|----------|----------|--------|
| `NODE_ENV` | `production` | ☐ Render |
| `NODE_VERSION` | `20.18.0` | ☐ Render |
| `NODE_OPTIONS` | `--max-old-space-size=4096` | ☐ Render |
| `DATABASE_URL` | Production Postgres | ☐ Render |
| `OPENAI_API_KEY` | Valid | ☐ Render |
| `GROQ_API_KEY` | Valid | ☐ Render |
| `ANTHROPIC_API_KEY` | Valid | ☐ Render |
| `JWT_SECRET` | Valid (rotated, not default) | ☐ Render |
| `RELIABILITY_AUTO_HEAL` | `true` | ☐ Render |
| `RELIABILITY_SLO_LOOP` | `true` | ☐ Render |

### 1.4 Feature flags (production)

| Flag | Expected | Status |
|------|----------|--------|
| `ENABLE_RUNTIME_KERNEL` / runtime flags | Enabled per staging soak | ☐ Render |
| `BROKER_BLOCK_DIRECT_ACTION` | `true` | ☐ Render |
| `USE_UNIFIED_MEMORY` | `true` | ☐ Render |
| `ENABLE_HYBRID_ROUTING` | `true` | ☐ Render |
| `LANG_AUTO_FIX` | `false` | ☐ Render |

---

## Phase 2: Deploy

### 2.1 Monorepo — merge staging → main

```powershell
cd C:\Projects\cardbey
git fetch origin
git checkout main
git pull origin main
git merge origin/staging -m "Release Cardbey V1: P0 fixes, external capabilities, scan card, runtime kernel."
git push origin main
```

**Note:** `main` and `staging` had diverged; merge commit required (do not force-push).

### 2.2 Dashboard submodule

`origin/main` and `origin/staging` both point to dashboard `aeda538` — **no separate dashboard merge required** unless submodule bump lands on staging after core merge.

### 2.3 Monitor Render

| Service | URL | Check |
|---------|-----|-------|
| Core prod | `https://cardbey-core.onrender.com/api/health` | `ok: true` |
| Core features | `https://cardbey-core.onrender.com/api/status/features` | 8 feature keys |
| Dashboard | `https://cardbey.com` | Loads, login, Performer console |

---

## Phase 3: Post-Deployment Verification

```bash
# Core health
curl https://cardbey-core.onrender.com/api/health

# Feature status (public)
curl https://cardbey-core.onrender.com/api/status/features

# SLO (admin JWT required)
curl -H "Authorization: Bearer <admin-jwt>" \
  https://cardbey-core.onrender.com/api/reliability/slo/status

# Agents (admin JWT required)
curl -H "Authorization: Bearer <admin-jwt>" \
  https://cardbey-core.onrender.com/api/agents
```

### Quick actions (manual smoke)

| Action | Expected | Status |
|--------|----------|--------|
| Create store | ✅ | ☐ |
| Ingest document | ✅ | ☐ |
| Launch campaign | ⚠️ confirm flow | ☐ |
| Improve store | ✅ | ☐ |
| Create video | ⚠️ provider-dependent | ☐ |
| Fix issues | ✅ | ☐ |
| Generate social | ✅ | ☐ |
| Scan card | ⚠️ OCR keys | ☐ |

---

## Phase 4: Rollback Plan

### Option A — Environment (fastest, no redeploy)

Set on Render **production** core service:

```
EMERGENCY_BYPASS_KERNEL=true
```

Or disable subsystems:

```
USE_UNIFIED_MEMORY=false
RELIABILITY_AUTO_HEAL=false
RELIABILITY_SLO_LOOP=false
```

### Option B — Git revert

```bash
git checkout main
git revert -m 1 <merge-commit-sha>
git push origin main
```

### Option C — Feature flags

```
LANG_AUTO_FIX=false
ENABLE_HYBRID_ROUTING=false
BROKER_BLOCK_DIRECT_ACTION=false   # emergency only
```

**Rollback decision tree:**

1. SLO breach + mission failures → Option A first (minutes)
2. Bad release artifact → Option B (Render rebuild ~10–15 min)
3. Single feature regression → Option C (targeted)

---

## Phase 5: 24h Monitoring

| Metric | Target | Status |
|--------|--------|--------|
| API success rate | ≥ 95% | ☐ |
| API latency p95 | < 5s | ☐ |
| Error rate | < 1% | ☐ |
| Agent health | All healthy | ☐ |

Alerts: SLO breach, auto-heal trigger, agent failure, circuit breaker.

---

## Phase 6: V1 Release Notes

See [V1_SOFT_LAUNCH.md](./V1_SOFT_LAUNCH.md) plus:

### New in this production cut

- External capability registry + `/api/status/features` (8 providers)
- Dashboard infra badges (LLM, media, storage)
- Opt-in tool dispatch retry (`TOOL_DISPATCH_RETRY_TOOLS`)
- Scan card → create product pipeline
- Vision camera capture fixes
- `generate_social_posts` real executor
- Fix issues → store audit routing

### Known limitations

- C-Net requires `CNET_API_KEY` + `CNET_ENDPOINT`
- Video requires Kling/OpenAI/mock provider
- Scan card requires vision API keys
- SLO/agents endpoints require admin auth

---

## Success Criteria

- [ ] All services deployed to production
- [ ] Core API healthy
- [ ] Dashboard loads
- [ ] SLO ≥ 95% (admin verify)
- [ ] All agents healthy (admin verify)
- [ ] Quick actions smoke passed
- [ ] External capabilities API returns 8 keys
- [ ] Rollback plan documented (this doc)
- [ ] 24h monitoring active

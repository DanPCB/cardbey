# Deploy Truth & Parity Checklist

Minimal ops checklist to verify staging and production deploy the same **P0** runtime surface.

## 1. Verify live commit (deploy truth)

After any Core deploy:

```bash
cd apps/core/cardbey-core
API_BASE=https://cardbey-core.onrender.com \
  EXPECTED_COMMIT_SHA=$(git rev-parse HEAD) \
  npm run canary:post-deploy
```

Staging:

```bash
API_BASE=https://cardbey-core-staging.onrender.com \
  EXPECTED_COMMIT_SHA=$(git rev-parse HEAD) \
  npm run canary:post-deploy
```

Or read SHA directly:

```bash
curl -s "$API_BASE/api/health?full=true" | jq '.deploy'
```

Expected shape:

```json
{
  "commitSha": "abc123…",
  "buildTime": "2026-09-02T…",
  "environment": "production",
  "source": "RENDER_GIT_COMMIT"
}
```

## 2. Schema / DB parity

From full health:

```bash
curl -s "$API_BASE/api/health?full=true" | jq '{db: .database, fingerprint: .dbFingerprint}'
```

**Gate:** `dbFingerprint.requiredColumnsOk` must be `true` before promoting to prod.

## 3. P0 feature-flag parity (staging ↔ production)

Compare `features` from full health on both environments. These **must match** unless intentionally staging-only:

| Flag / env | Production | Staging | Notes |
|------------|------------|---------|-------|
| `USE_LLM_TASK_PLANNER` | `true` | `true` | Planner on both |
| `ENABLE_OPENCLAW_AGENT_RUNTIME` | `true` | `true` | |
| `OPENCLAW_MISSION_STEPS` | `true` | `true` | |
| `LANGCHAIN_ENABLED` | `true` | `true` | |
| `CREWAI_ENABLED` | `false` | `false` | Until Python on image |
| `NODE_ENV` | `production` | `production` | Render uses prod mode |
| `CARDEY_DEPLOY_ENV` | *(unset)* | `staging` | Staging identity only |

**Staging-only soak flags** (expected diff — do not copy to prod without review):

- `PHASE1_*`, `PHASE2_*` graph/reasoning flags
- `ENABLE_MISSION_001_*` store fidelity pilot
- `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1`
- `GUEST_COOKIE_SAMESITE=none` (staging cross-site testing)

Quick diff:

```bash
curl -s "$STAGING/api/health?full=true" | jq '.features' > /tmp/staging-features.json
curl -s "$PROD/api/health?full=true" | jq '.features' > /tmp/prod-features.json
diff /tmp/staging-features.json /tmp/prod-features.json
```

## 4. Readiness gate

```bash
curl -s "$API_BASE/api/readyz" | jq .
```

**Gate:** `ok: true` before routing traffic or closing deploy ticket.

## 5. Optional — import graph smoke (same commit)

Confirms create-store runtime modules resolve under plain Node ESM (catches TS-loader-only imports):

```bash
npm run canary:post-deploy -- --smoke-imports
# or
npm run smoke:create-store-runtime
```

## 6. Build-time SHA wiring

Core writes `data/build-metadata.json` during `npm run build` (Render: `render-build.mjs`). Runtime prefers `RENDER_GIT_COMMIT` → `GIT_COMMIT` → file.

Local dev:

```bash
npm run build   # writes data/build-metadata.json
npm run dev
curl -s http://localhost:3001/api/health?full=true | jq .deploy
```

## Sign-off template

- [ ] `canary:post-deploy` passed with matching `EXPECTED_COMMIT_SHA`
- [ ] `dbFingerprint.requiredColumnsOk === true`
- [ ] P0 flags match checklist (staging-only diffs documented)
- [ ] `/api/readyz` returns `ok: true`

#!/usr/bin/env bash
# Intelligence Foundation migration — flag verification, parity tests, canary rollout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASHBOARD="$ROOT/apps/dashboard/cardbey-marketing-dashboard"
CORE="$ROOT/apps/core/cardbey-core"
CANARY_PCT="${CANARY_PCT:-10}"
CORE_URL="${CORE_URL:-http://localhost:3001}"
ALERT_FALLBACK_RATE="${ALERT_FALLBACK_RATE:-0.5}"

log() { echo "[migrate-intelligence] $*"; }
warn() { echo "[migrate-intelligence] WARN: $*" >&2; }

verify_flags() {
  log "Verifying intelligence flags in .env.example files..."
  local required_dashboard=(
    VITE_INTELLIGENCE_FOUNDATION
    VITE_INTELLIGENCE_SURFACE_BRIEFING
    VITE_INTELLIGENCE_SURFACE_PIL
    VITE_PIL_CONCIERGE_LLM
  )
  local required_core=(
    INTELLIGENCE_LLM_EXPRESSION
    OPENAI_API_KEY
  )

  for key in "${required_dashboard[@]}"; do
    if ! grep -q "^${key}=" "$DASHBOARD/.env.example" 2>/dev/null; then
      warn "Missing $key in dashboard .env.example"
      return 1
    fi
  done

  for key in "${required_core[@]}"; do
    if ! grep -q "^${key}=" "$CORE/.env.example" 2>/dev/null; then
      warn "Missing $key in core .env.example"
      return 1
    fi
  done

  log "Flag documentation OK"
}

run_parity_tests() {
  log "Running Phase 0 parity tests (non-blocking)..."
  (cd "$DASHBOARD" && npm run test -- --run src/lib/intelligence/__tests__/parity.test.ts)
  log "Parity tests completed"
}

check_metrics_alert() {
  log "Checking LLM metrics at ${CORE_URL}/api/intelligence/metrics ..."
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl not available — skipping metrics alert check"
    return 0
  fi

  local metrics
  metrics="$(curl -sf "${CORE_URL}/api/intelligence/metrics" || true)"
  if [[ -z "$metrics" ]]; then
    warn "Could not fetch metrics — is core running?"
    return 0
  fi

  local high_fallback
  high_fallback="$(echo "$metrics" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const j=JSON.parse(d);
        const bad=(j.surfaces||[]).some(s=>s.fallbackRate>${ALERT_FALLBACK_RATE});
        process.exit(bad?1:0);
      } catch { process.exit(0); }
    });
  " && echo no || echo yes)"

  if [[ "$high_fallback" == "yes" ]]; then
    warn "Fallback rate exceeds ${ALERT_FALLBACK_RATE} — triggering rollback guidance"
    echo "  Run in browser console: emergencyRollbackAll() from @/lib/intelligence/rollback"
    echo "  Or: sessionStorage.setItem('cardbey.intelligence.overrides.v1', JSON.stringify({foundation:false}))"
    return 1
  fi

  log "Metrics within alert threshold"
}

deploy_canary() {
  local pct="$1"
  log "Canary rollout guidance (${pct}% traffic) — set in deployment env:"
  echo "  VITE_INTELLIGENCE_FOUNDATION=true"
  echo "  VITE_INTELLIGENCE_SHADOW_MODE=true"
  if [[ "$pct" -le 10 ]]; then
    echo "  VITE_INTELLIGENCE_SURFACE_BRIEFING=false"
    echo "  VITE_INTELLIGENCE_SURFACE_PIL=false"
  elif [[ "$pct" -le 50 ]]; then
    echo "  VITE_INTELLIGENCE_SURFACE_BRIEFING=true"
    echo "  VITE_INTELLIGENCE_SURFACE_PIL=false"
  else
    echo "  VITE_INTELLIGENCE_SURFACE_BRIEFING=true"
    echo "  VITE_INTELLIGENCE_SURFACE_PIL=true"
    echo "  VITE_INTELLIGENCE_SHADOW_MODE=false"
  fi
  log "Rebuild dashboard after updating env vars"
}

rollback() {
  warn "Executing rollback instructions"
  echo "  1. Set VITE_INTELLIGENCE_FOUNDATION=false in dashboard env"
  echo "  2. Or use runtime override: window.__INTELLIGENCE_OVERRIDES = { foundation: false }"
  echo "  3. Set INTELLIGENCE_LLM_EXPRESSION=false on core to disable server LLM"
  echo "  4. Redeploy / restart services"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  verify-flags     Check .env.example documentation
  parity           Run Phase 0 parity tests
  canary [pct]     Print canary env guidance (10|50|100)
  full             verify-flags + parity + canary stages
  metrics-check    Alert if fallback rate too high
  rollback         Print rollback steps

Environment:
  CANARY_PCT       Default 10
  CORE_URL         Default http://localhost:3001
  ALERT_FALLBACK_RATE  Default 0.5
EOF
}

cmd="${1:-full}"
case "$cmd" in
  verify-flags) verify_flags ;;
  parity) run_parity_tests ;;
  canary) deploy_canary "${2:-$CANARY_PCT}" ;;
  metrics-check) check_metrics_alert ;;
  rollback) rollback ;;
  full)
    verify_flags
    run_parity_tests
    deploy_canary 10
    deploy_canary 50
    deploy_canary 100
    check_metrics_alert || rollback
    ;;
  *)
    usage
    exit 1
    ;;
esac

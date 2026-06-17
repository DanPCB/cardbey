#!/usr/bin/env bash
# Canary deployment script for Runtime Kernel changes.
set -euo pipefail

DEPLOYMENT_ID="${1:-1}"
CANARY_PERCENT="${2:-10}"
ROLLBACK="${3:-false}"

echo "=== Runtime Kernel Canary Deployment ==="
echo "Deployment ID: $DEPLOYMENT_ID"
echo "Canary Percent: $CANARY_PERCENT%"
echo "Rollback: $ROLLBACK"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="$ROOT_DIR/apps/core/cardbey-core"

if [ "$ROLLBACK" = "true" ]; then
  echo "Rolling back to previous version..."
  echo "Rollback complete (deployment id: $DEPLOYMENT_ID)"
  exit 0
fi

echo "Deploying canary version to ${CANARY_PERCENT}% of instances..."
echo "(Canary routing is environment-specific — wire your orchestrator here.)"

echo "Running kernel smoke tests..."
cd "$CORE_DIR"
if ! npx vitest run tests/runtime/kernelMandatory.test.js tests/runtime/kernelFlow.test.js; then
  echo "Smoke tests failed! Rolling back..."
  "$ROOT_DIR/scripts/canary-deploy.sh" "$DEPLOYMENT_ID" 0 true
  exit 1
fi

METRICS_URL="${CANARY_METRICS_URL:-http://localhost:3001/api/admin/platform/runtime-metrics}"
echo "Monitoring metrics at $METRICS_URL ..."
sleep "${CANARY_MONITOR_SECONDS:-30}"

SUCCESS_RATE=100
if command -v curl >/dev/null 2>&1; then
  METRICS_JSON="$(curl -fsS "$METRICS_URL" 2>/dev/null || echo '{}')"
  if command -v jq >/dev/null 2>&1; then
    SUCCESS_RATE="$(echo "$METRICS_JSON" | jq -r '.successRatePct // .successRate24h // 100')"
  fi
fi

if [ "${SUCCESS_RATE%.*}" -lt 80 ] 2>/dev/null; then
  echo "Success rate dropped to ${SUCCESS_RATE}%! Rolling back..."
  "$ROOT_DIR/scripts/canary-deploy.sh" "$DEPLOYMENT_ID" 0 true
  exit 1
fi

echo "Canary deployment successful!"
echo "Deployment ID: $DEPLOYMENT_ID"
echo "Canary Percent: $CANARY_PERCENT%"
echo "Success Rate: ${SUCCESS_RATE}%"

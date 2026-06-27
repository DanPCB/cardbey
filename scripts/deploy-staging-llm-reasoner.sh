#!/usr/bin/env bash
# Deploy Cardbey Core + Dashboard with LLM Reasoner enabled on staging.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="$ROOT_DIR/apps/core/cardbey-core"
DASH_DIR="$ROOT_DIR/apps/dashboard/cardbey-marketing-dashboard"

echo "=== Cardbey LLM Reasoner — Staging Deploy ==="

export ENABLE_LLM_REASONER="${ENABLE_LLM_REASONER:-true}"
export LLM_REASONER_ROLLOUT_PERCENTAGE="${LLM_REASONER_ROLLOUT_PERCENTAGE:-0}"
export LLM_REASONER_MAX_TOKENS="${LLM_REASONER_MAX_TOKENS:-2000}"
export LLM_REASONER_MAX_HISTORY_TURNS="${LLM_REASONER_MAX_HISTORY_TURNS:-50}"
export ENABLE_LLM_TOOL_LOOP="${ENABLE_LLM_TOOL_LOOP:-false}"
export ENABLE_LLM_THINKING="${ENABLE_LLM_THINKING:-false}"
export LLM_REASONER_PROVIDER="${LLM_REASONER_PROVIDER:-anthropic}"

echo "ENABLE_LLM_REASONER=$ENABLE_LLM_REASONER"
echo "LLM_REASONER_ROLLOUT_PERCENTAGE=$LLM_REASONER_ROLLOUT_PERCENTAGE"
echo "ENABLE_LLM_TOOL_LOOP=$ENABLE_LLM_TOOL_LOOP"
echo "ENABLE_LLM_THINKING=$ENABLE_LLM_THINKING"

echo ""
echo "Running LLM reasoner unit tests..."
cd "$CORE_DIR"
npx vitest run \
  src/lib/intent/__tests__/llmReasoner.test.js \
  src/lib/intent/__tests__/llmReasonerIntegration.test.js \
  src/lib/intent/__tests__/llmReasonerIntegration.intent.test.js

echo ""
echo "Installing and building Core..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm run build 2>/dev/null || echo "(no build script — skipping)"

echo ""
echo "Installing and building Dashboard..."
cd "$DASH_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
VITE_MAX_HISTORY_TURNS="${VITE_MAX_HISTORY_TURNS:-50}" pnpm run build

echo ""
echo "Restart services (wire your process manager):"
echo "  pm2 restart cardbey-core"
echo "  pm2 restart cardbey-dashboard"
echo ""
echo "Health check:"
STAGING_URL="${STAGING_URL:-http://localhost:3001}"
sleep 2
if command -v curl >/dev/null 2>&1; then
  curl -fsS "$STAGING_URL/api/health?full=true" | head -c 500 || echo "(health check failed — is core running?)"
fi

echo ""
echo "Monitor: node $ROOT_DIR/scripts/monitor-staging-llm-reasoner.mjs"
echo "Rollback: ENABLE_LLM_REASONER=false && pm2 restart cardbey-core"
echo "=== Deploy prep complete ==="

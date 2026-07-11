#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies"
npm install

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "Please update .env with your DEEPSEEK_API_KEY"
fi

echo "==> Running multi-agent tests"
npm run test:multi-agent

echo "==> Setup complete"
echo "Run: npx tsx src/multiAgent/examples/basic_mission.ts"

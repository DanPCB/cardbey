# Multi-Agent DeepSeek Installation Guide

## Prerequisites

- Node.js 20+
- Cardbey Core (`apps/core/cardbey-core`)
- DeepSeek API key

## Installation

The module is included in Cardbey Core. Dependencies (`openai`, `dotenv`, `zod`) are already in `package.json`.

```bash
cd apps/core/cardbey-core
npm install
```

## Configuration

1. Copy environment template if needed:
   ```bash
   cp .env.example .env
   ```

2. Set your DeepSeek API key:
   ```bash
   DEEPSEEK_API_KEY=sk-your-actual-key-here
   DEEPSEEK_ENABLED=true
   ```

3. Configure agent models (defaults to `deepseek-v4-flash`):
   ```bash
   AGENT_PLANNER_MODEL=deepseek-v4-flash
   AGENT_CRITIC_MODEL=deepseek-v4-flash
   ```

4. Enable multi-agent pipeline:
   ```bash
   MULTI_AGENT_ENABLED=true
   HITL_REVIEW_ENABLED=true
   ```

## Verify Installation

```bash
npm run test:multi-agent
```

Expected: all tests pass (mocked LLM — no API key required for tests).

## Live Smoke Test

```bash
npx tsx src/multiAgent/examples/basic_mission.ts
```

## Shadow Mode Rollout

1. Set `MULTI_AGENT_SHADOW=true`
2. Monitor logs for `shadow_comparison` entries
3. Compare intent match rates before full cutover

## A/B Testing

Set `DEEPSEEK_AB_TRAFFIC_PERCENT=25` to route 25% of missions to DeepSeek (deterministic per mission ID).

## Setup Script

```bash
bash scripts/setup-multi-agent.sh
```

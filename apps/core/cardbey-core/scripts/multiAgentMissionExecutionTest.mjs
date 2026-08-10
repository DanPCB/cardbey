/**
 * Local multi-agent mission execution harness (does NOT change Render env).
 *
 * Usage (from apps/core/cardbey-core):
 *   node --import tsx scripts/multiAgentMissionExecutionTest.mjs
 *
 * Safe: plan steps use an in-process mock stepExecutor (no store writes / publish).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(__dirname, '..');
dotenv.config({ path: join(coreRoot, '.env') });

process.env.MULTI_AGENT_ENABLED = 'true';
process.env.MULTI_AGENT_EXECUTE = 'true';
process.env.MULTI_AGENT_SHADOW = 'false';
process.env.AGENT_TRACE_ENABLED = 'true';
process.env.AGENT_TELEMETRY_ENABLED = 'true';
process.env.HITL_REVIEW_ENABLED = 'true';
process.env.MULTI_AGENT_MAX_REFINEMENTS = '1';
process.env.DEEPSEEK_AB_TRAFFIC_PERCENT = '100';
process.env.DEEPSEEK_ENABLED = 'true';

const MISSION_INPUT =
  process.env.MULTI_AGENT_TEST_MESSAGE?.trim() ||
  'Create a store for AWE Financial, a finance broker in Footscray VIC';

const outDir = join(coreRoot, '..', '..', '..', 'docs');
const outJson = join(outDir, 'MULTI_AGENT_MISSION_EXECUTION_TEST_RESULTS.json');

async function main() {
  const { Orchestrator } = await import('../src/multiAgent/orchestrator/orchestrator.ts');
  const { resolveDeepSeekBaseUrl, resolveDeepSeekModel } = await import(
    '../src/lib/llm/deepseekEnv.ts'
  );

  const executedSteps = [];
  const stepExecutor = async (step) => {
    const record = {
      stepId: step.id,
      action: step.action,
      parameters: step.parameters ?? {},
      at: new Date().toISOString(),
    };
    executedSteps.push(record);
    return { result: { ok: true, mode: 'harness_mock_executor', ...record } };
  };

  console.log('[harness] config', {
    MULTI_AGENT_ENABLED: process.env.MULTI_AGENT_ENABLED,
    MULTI_AGENT_EXECUTE: process.env.MULTI_AGENT_EXECUTE,
    HITL_REVIEW_ENABLED: process.env.HITL_REVIEW_ENABLED,
    DEEPSEEK_ENABLED: process.env.DEEPSEEK_ENABLED,
    DEEPSEEK_MODEL: resolveDeepSeekModel(),
    DEEPSEEK_BASE_URL: resolveDeepSeekBaseUrl(),
    DEEPSEEK_API_KEY_SET: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    note: 'Process-local overrides only; staging/live Render env unchanged.',
  });
  console.log('[harness] mission input:', MISSION_INPUT);

  const orchestrator = new Orchestrator({ stepExecutor });
  const wallStart = Date.now();
  let result = null;
  let fatalError = null;
  try {
    result = await orchestrator.processMission(MISSION_INPUT);
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
  }
  const totalLatencyMs = Date.now() - wallStart;

  const agents = result?.telemetry?.agentsUsed ?? [];
  const tokensByAgent = result?.telemetry?.tokenUsage?.byAgent ?? {};
  const payload = {
    missionId: result?.missionId ?? null,
    status: result?.status ?? 'failed',
    success: Boolean(result && (result.status === 'completed' || result.status === 'pending_human_review')),
    totalLatencyMs,
    intent: result?.intent ?? null,
    agentsUsed: agents,
    tokensByAgent,
    planSteps: result?.plan?.steps?.length ?? 0,
    reviewApproved: result?.review?.approved ?? null,
    reviewIssues: result?.review?.issues ?? [],
    executedSteps: executedSteps.map((s) => s.action),
    fatalError,
    meetsLatencyTarget: totalLatencyMs < 8000,
    deepseek: {
      baseURL: resolveDeepSeekBaseUrl(),
      model: resolveDeepSeekModel(),
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log('[harness] wrote', outJson);
  console.log(JSON.stringify({
    missionId: payload.missionId,
    status: payload.status,
    success: payload.success,
    totalLatencyMs: payload.totalLatencyMs,
    agents: payload.agentsUsed,
    meetsLatencyTarget: payload.meetsLatencyTarget,
    reviewApproved: payload.reviewApproved,
  }, null, 2));
}

main().catch((err) => {
  console.error('[harness] fatal', err);
  process.exitCode = 1;
});

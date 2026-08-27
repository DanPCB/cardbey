#!/usr/bin/env node
/**
 * Operator-only MiniMax H3 paid smoke test.
 *
 * Requires BOTH:
 *   ENABLE_MINIMAX_H3_VIDEO_V1=true
 *   ALLOW_PAID_MINIMAX_SMOKE_TEST=true
 *
 * Submits exactly one 768P / 6s / 9:16 generation (~US$0.48 estimate).
 * Never prints MINIMAX_API_KEY.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/minimax-h3-smoke.mjs
 *   node scripts/minimax-h3-smoke.mjs --confirm
 */
import { estimateMinimaxCostUsd, isMinimaxH3Enabled, isMinimaxConfigured, redactMinimaxSecrets } from '../src/lib/video/minimax/minimaxConfig.js';
import { generateVideoViaMiniMax } from '../src/lib/video/generateVideoViaMiniMax.js';

const confirm = process.argv.includes('--confirm');
const allowPaid = String(process.env.ALLOW_PAID_MINIMAX_SMOKE_TEST ?? '').trim().toLowerCase();
const paidOk = allowPaid === 'true' || allowPaid === '1' || allowPaid === 'on';

function fail(message) {
  console.error(`[MINIMAX_SMOKE] ${message}`);
  process.exit(1);
}

async function main() {
  if (!isMinimaxH3Enabled()) {
    fail('ENABLE_MINIMAX_H3_VIDEO_V1 must be true. Aborting with zero paid submissions.');
  }
  if (!paidOk) {
    fail('ALLOW_PAID_MINIMAX_SMOKE_TEST must be true. Aborting with zero paid submissions.');
  }
  if (!isMinimaxConfigured()) {
    fail('MINIMAX_API_KEY is missing. Aborting with zero paid submissions.');
  }
  if (!confirm && process.env.CI === 'true') {
    fail('CI must pass --confirm together with both flags. Aborting.');
  }
  if (!confirm) {
    fail('Refusing to spend credit without --confirm. Re-run with --confirm after reviewing the estimate.');
  }

  const cost = estimateMinimaxCostUsd({ durationSeconds: 6, resolution: '768P' });
  console.log('[MINIMAX_SMOKE] plan', {
    model: 'MiniMax-H3',
    resolution: '768P',
    durationSeconds: 6,
    aspectRatio: '9:16',
    maxSubmissions: 1,
    estimatedCost: cost.label,
    costIsEstimate: true,
  });

  const result = await generateVideoViaMiniMax({
    prompt:
      'A clean 6-second vertical Cardbey storefront promo: morning light on a cafe window, slow push-in, no logos invented.',
    duration: 6,
    aspectRatio: '9:16',
    resolution: '768P',
    selectionReason: 'operator_paid_smoke',
    onPoll: (info) => {
      console.log(
        '[MINIMAX_SMOKE] poll',
        redactMinimaxSecrets({
          status: info.status,
          stage: info.stage,
          taskId: info.taskId,
          estimatedCost: info.costEstimate?.label,
        }),
      );
    },
  });

  console.log(
    '[MINIMAX_SMOKE] result',
    redactMinimaxSecrets({
      provider: result.provider,
      providerModel: result.providerModel,
      providerTaskId: result.providerTaskId,
      status: result.status,
      videoUrl: result.videoUrl,
      durationSeconds: result.durationSeconds,
      resolution: result.resolution,
      aspectRatio: result.aspectRatio,
      estimatedCostUsd: result.costEstimateUsd,
      usage: result.usage,
      audioIncluded: result.audioIncluded,
    }),
  );
}

main().catch((err) => {
  console.error(
    '[MINIMAX_SMOKE] failed',
    redactMinimaxSecrets({
      code: err?.code,
      message: err?.userMessage || err?.message,
      providerCode: err?.providerCode,
    }),
  );
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Fetch /api/intelligence/metrics and print a go/no-go verdict for staging bake.
 * Usage: node scripts/foundationGoNoGo.js [--base-url https://cardbey-core-staging.onrender.com]
 */
import { evaluateGoNoGo, DEFAULT_THRESHOLDS } from '../src/lib/metrics/foundationGoNoGo.js';

const args = process.argv.slice(2);
const baseUrl =
  process.env.FOUNDATION_METRICS_BASE_URL ??
  (args.find((a) => a.startsWith('--base-url='))?.split('=')[1]) ??
  'http://localhost:3001';
const minSamplesArg = args.find((a) => a.startsWith('--min-samples='))?.split('=')[1];
const minExpressSamples = minSamplesArg
  ? Number(minSamplesArg)
  : Number(process.env.FOUNDATION_MIN_EXPRESS_SAMPLES ?? 50);

async function main() {
  const url = `${baseUrl.replace(/\/$/, '')}/api/intelligence/metrics`;
  let payload;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[foundationGoNoGo] HTTP ${res.status} from ${url}`);
      process.exit(1);
    }
    payload = await res.json();
  } catch (err) {
    console.error(`[foundationGoNoGo] fetch failed: ${err?.message ?? err}`);
    process.exit(1);
  }

  const metrics = payload.ok ? payload : payload;
  const verdict = evaluateGoNoGo(metrics, {
    ...DEFAULT_THRESHOLDS,
    minExpressSamples,
  });

  console.log('\nIntelligence Foundation — Go/No-Go (last 1h window)\n');
  console.log(`Source: ${url}`);
  console.log(`Generated: ${metrics.generatedAt ?? 'unknown'}`);
  console.log(`Min express samples: ${minExpressSamples}\n`);
  console.log('Check                          | Actual                        | Verdict');
  console.log('-------------------------------|-------------------------------|--------');
  for (const check of verdict.checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    console.log(
      `${check.label.padEnd(30)} | ${String(check.actual).padEnd(29)} | ${status}`,
    );
  }
  if (verdict.insufficientData) {
    console.log('\nOverall: INSUFFICIENT DATA — generate staging traffic before baking.');
    console.log('  (browse feed, merchant flows, QR scan, briefing — then re-run)\n');
    process.exit(1);
  }
  console.log(`\nOverall: ${verdict.pass ? 'GO' : 'NO-GO'}\n`);
  process.exit(verdict.pass ? 0 : 1);
}

main();

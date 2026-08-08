/**
 * Boundary tests: Shared Discovery Runtime must not import business pipeline
 * internals except through the DiscoveryPipeline interface (injected by callers).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDiscoveryPipeline, PIPELINE_KIND_BUSINESS_STORE } from '../pipelineContract.js';
import { runScheduledSession } from '../SharedDiscoveryRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '..');

const FORBIDDEN_IMPORT_MARKERS = [
  'UnclaimedStoreService',
  'PreBuiltStoreService',
  'SocialImportService',
  'DirectoryCrawler',
  'ClaimAuthorityBuilder',
  'scrapeAndNormalize',
  'DiscoveryBatchRunner',
  'pipelines/business',
  'BusinessDiscoveryPipeline',
];

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('Shared Discovery Runtime import boundary', () => {
  it('does not import business scrape/store/pipeline internals', () => {
    const files = listJsFiles(RUNTIME_DIR);
    expect(files.length).toBeGreaterThan(0);

    const violations = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const importLines = src
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b/.test(line) || /require\s*\(/.test(line));
      const importBlob = importLines.join('\n');
      for (const marker of FORBIDDEN_IMPORT_MARKERS) {
        if (importBlob.includes(marker)) {
          violations.push(`${path.relative(RUNTIME_DIR, file)}: ${marker}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('assertDiscoveryPipeline accepts interface-shaped objects only', () => {
    expect(() => assertDiscoveryPipeline(null)).toThrow(/discovery_pipeline/);
    expect(() => assertDiscoveryPipeline({ kind: 'business_store' })).toThrow(
      /runAllActive/,
    );
    expect(() =>
      assertDiscoveryPipeline({
        kind: PIPELINE_KIND_BUSINESS_STORE,
        runAllActive: async () => [],
      }),
    ).not.toThrow();
  });

  it('runScheduledSession invokes pipeline.runAllActive only (no business imports)', async () => {
    const calls = [];
    const pipeline = {
      kind: PIPELINE_KIND_BUSINESS_STORE,
      runAllActive: async (triggeredBy, triggeredById) => {
        calls.push({ triggeredBy, triggeredById });
        return [{ status: 'completed', created: 1 }];
      },
      isLocked: async () => false,
    };

    let running = false;
    const completed = [];
    const result = await runScheduledSession({
      pipeline,
      isRunnable: async () => ({ ok: true }),
      isInProcessRunning: () => running,
      setInProcessRunning: (v) => {
        running = v;
      },
      onComplete: async (summaries) => {
        completed.push(...summaries);
      },
      log: () => {},
    });

    expect(result.skipped).toBe(false);
    expect(calls).toEqual([{ triggeredBy: 'cron', triggeredById: undefined }]);
    expect(completed).toHaveLength(1);
    expect(running).toBe(false);
  });

  it('runScheduledSession respects isRunnable / already-running / lock gates', async () => {
    const runAllActive = viLike();
    const pipeline = {
      kind: PIPELINE_KIND_BUSINESS_STORE,
      runAllActive,
      isLocked: async () => true,
    };

    const skippedRunnable = await runScheduledSession({
      pipeline,
      isRunnable: async () => ({ ok: false, reason: 'disabled' }),
      isInProcessRunning: () => false,
      setInProcessRunning: () => {},
      log: () => {},
    });
    expect(skippedRunnable.reason).toBe('disabled');
    expect(runAllActive.calls).toBe(0);

    const skippedRunning = await runScheduledSession({
      pipeline: { ...pipeline, isLocked: async () => false },
      isRunnable: async () => ({ ok: true }),
      isInProcessRunning: () => true,
      setInProcessRunning: () => {},
      log: () => {},
    });
    expect(skippedRunning.reason).toBe('already_running');
    expect(runAllActive.calls).toBe(0);

    const skippedLock = await runScheduledSession({
      pipeline,
      isRunnable: async () => ({ ok: true }),
      isInProcessRunning: () => false,
      setInProcessRunning: () => {},
      log: () => {},
    });
    expect(skippedLock.reason).toBe('instance_lock');
    expect(runAllActive.calls).toBe(0);
  });
});

function viLike() {
  const fn = async () => {
    fn.calls += 1;
    return [];
  };
  fn.calls = 0;
  return fn;
}

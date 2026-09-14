/**
 * Opt-in live smoke test for DeepSeekCodingProvider.
 *
 * Safety properties:
 * - skipped unless RUN_DEEPSEEK_LIVE_TEST=true;
 * - operates only in an OS temporary directory;
 * - calls the provider directly, bypassing the DevelopmentOrchestrator;
 * - never applies the returned file change;
 * - cannot approve a patch, create a branch, open a PR, or deploy.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deepSeekCodingProvider } from '../services/coding/DeepSeekCodingProvider.js';
import type { CodingProviderContext } from '../services/coding/CodingProvider.js';

const TARGET_PATH = 'apps/core/cardbey-core/src/deepseek-live-smoke.ts';
const runLive = process.env.RUN_DEEPSEEK_LIVE_TEST === 'true';
const liveIt = runLive ? it : it.skip;

let workspaceRoot = '';
const originalDeepSeekFlag = process.env.ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1;
const originalKimiFlag = process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;

describe('DeepSeekCodingProvider live smoke', () => {
  beforeAll(async () => {
    if (!runLive) return;
    if (!process.env.DEEPSEEK_API_KEY?.trim()) {
      throw new Error(
        'DEEPSEEK_API_KEY must be configured before RUN_DEEPSEEK_LIVE_TEST=true',
      );
    }

    process.env.ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1 = 'true';
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'false';
    workspaceRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'cardbey-deepseek-live-'),
    );
    const absoluteTarget = path.join(workspaceRoot, ...TARGET_PATH.split('/'));
    await fs.promises.mkdir(path.dirname(absoluteTarget), { recursive: true });
    await fs.promises.writeFile(
      absoluteTarget,
      'export const cardbeyDeepSeekSmoke = 1;\n',
      'utf8',
    );
  });

  afterAll(async () => {
    restoreEnv('ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1', originalDeepSeekFlag);
    restoreEnv('ENABLE_KIMI_DEVELOPMENT_ENGINE_V1', originalKimiFlag);
    if (workspaceRoot) {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  liveIt(
    'returns one bounded change without modifying the temporary source file',
    async () => {
      const result = await deepSeekCodingProvider.implement(makeContext());

      expect(result.fileChanges).toHaveLength(1);
      const change = result.fileChanges[0]!;
      expect(change.path).toBe(TARGET_PATH);
      expect(change.changeType).toBe('MODIFY');
      expect(change.before).toBe('export const cardbeyDeepSeekSmoke = 1;\n');
      expect(change.after).toMatch(/cardbeyDeepSeekSmoke\s*=\s*2/);

      const unchanged = await fs.promises.readFile(
        path.join(workspaceRoot, ...TARGET_PATH.split('/')),
        'utf8',
      );
      expect(unchanged).toBe('export const cardbeyDeepSeekSmoke = 1;\n');
    },
    120_000,
  );
});

function makeContext(): CodingProviderContext {
  return {
    workspaceRoot,
    workspaceId: 'deepseek-live-smoke-temporary-workspace',
    mission: {
      id: `deepseek-live-smoke-${Date.now()}`,
      type: 'BUG_FIX',
      title: 'DeepSeek provider synthetic bounded smoke test',
      request:
        'In the single approved file, change cardbeyDeepSeekSmoke from 1 to 2. Make no other change.',
      expectedOutcome: 'The proposed complete file content exports cardbeyDeepSeekSmoke as 2.',
      observedBehaviour: 'The temporary file currently exports cardbeyDeepSeekSmoke as 1.',
    },
    design: {
      id: 'deepseek-live-smoke-design-v1',
      summary: 'Change one numeric literal in one synthetic temporary file.',
      diagnosis: 'The synthetic smoke-test value is intentionally outdated.',
      proposedChanges: [
        {
          file: TARGET_PATH,
          changeType: 'MODIFY',
          purpose: 'Change the synthetic value from 1 to 2.',
        },
      ],
      testPlan: ['Confirm the returned content exports cardbeyDeepSeekSmoke as 2.'],
      risks: ['No file outside the single approved target may be proposed.'],
    },
    impactReport: {
      estimatedEffort: 'SMALL',
      changeSurface: {
        changeTargets: [TARGET_PATH],
        contextFiles: [],
        testTargets: [],
        lowConfidence: false,
      },
    },
  } as unknown as CodingProviderContext;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

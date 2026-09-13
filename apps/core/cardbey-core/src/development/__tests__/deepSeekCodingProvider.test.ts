import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deepSeekCodingProvider,
  type DeepSeekResult,
} from '../services/coding/DeepSeekCodingProvider.js';
import type { CodingProviderContext } from '../services/coding/CodingProvider.js';
import { resolveCodingProvider } from '../services/coding/resolveCodingProvider.js';

const TARGET_PATH = 'apps/core/cardbey-core/src/example.ts';
const OUTSIDE_SCOPE_PATH = 'apps/core/cardbey-core/src/outside-scope.ts';
const ENV_KEYS = [
  'ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1',
  'ENABLE_KIMI_DEVELOPMENT_ENGINE_V1',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_CODING_MODEL',
  'DEEPSEEK_REASONING_EFFORT',
  'DEEPSEEK_DEVELOPMENT_TIMEOUT_MS',
  'DEEPSEEK_DEVELOPMENT_MAX_INPUT_BYTES',
  'DEEPSEEK_DEVELOPMENT_MAX_OUTPUT_BYTES',
  'DEEPSEEK_DEVELOPMENT_MAX_TOKENS',
  'DEEPSEEK_DEVELOPMENT_MAX_CHANGED_FILES',
] as const;

const originalEnv = new Map<string, string | undefined>();
let workspaceRoot = '';

beforeAll(() => {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

beforeEach(async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1 = 'true';
  process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'false';
  process.env.DEEPSEEK_API_KEY = 'test-key-never-sent';
  process.env.DEEPSEEK_CODING_MODEL = 'deepseek-v4-pro';

  workspaceRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'cardbey-deepseek-provider-'),
  );
  const absoluteTarget = path.join(workspaceRoot, ...TARGET_PATH.split('/'));
  await fs.promises.mkdir(path.dirname(absoluteTarget), { recursive: true });
  await fs.promises.writeFile(absoluteTarget, 'export const value = 1;\n', 'utf8');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (workspaceRoot) {
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
  }
});

describe('DeepSeekCodingProvider V1', () => {
  it('is disabled unless the feature flag is exactly true', async () => {
    process.env.ENABLE_DEEPSEEK_DEVELOPMENT_ENGINE_V1 = 'false';

    expect(deepSeekCodingProvider.canImplement(makeContext())).toBe(false);
    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'DeepSeek development engine is not enabled',
    );
  });

  it('fails closed when the API key is missing', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'DEEPSEEK_API_KEY is required',
    );
  });

  it('is selected by the resolver when enabled for a normal bounded mission', () => {
    const context = makeContext();
    expect(resolveCodingProvider(context).id).toBe('deepseek');
  });

  it('returns a validated bounded modification without writing the worktree', async () => {
    const proposed: DeepSeekResult = {
      diagnosis: 'Updated the approved example constant.',
      fileChanges: [
        {
          path: TARGET_PATH,
          changeType: 'MODIFY',
          after: 'export const value = 2;\n',
        },
      ],
      notes: [],
      scopeExpansionRequested: false,
    };
    stubSuccessfulDeepSeekResponse(proposed);

    const result = await deepSeekCodingProvider.implement(makeContext());

    expect(result.fileChanges).toEqual([
      {
        path: TARGET_PATH,
        changeType: 'MODIFY',
        before: 'export const value = 1;\n',
        after: 'export const value = 2;\n',
      },
    ]);
    expect(
      await fs.promises.readFile(path.join(workspaceRoot, ...TARGET_PATH.split('/')), 'utf8'),
    ).toBe('export const value = 1;\n');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a change outside the approved writable surface', async () => {
    stubSuccessfulDeepSeekResponse({
      diagnosis: 'Attempted an unapproved change.',
      fileChanges: [
        {
          path: OUTSIDE_SCOPE_PATH,
          changeType: 'CREATE',
          before: '',
          after: 'export const outside = true;\n',
        },
      ],
      notes: [],
      scopeExpansionRequested: false,
    });

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'outside the approved writable surface',
    );
  });

  it('surfaces scope expansion for human review', async () => {
    stubSuccessfulDeepSeekResponse({
      diagnosis: 'The approved files are insufficient.',
      fileChanges: [],
      notes: ['A second module must be changed.'],
      scopeExpansionRequested: true,
    });

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'requested scope expansion',
    );
  });

  it('rejects non-JSON model output', async () => {
    stubDeepSeekContent('This is not JSON.');

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'could not be parsed as JSON',
    );
  });

  it('rejects an empty implementation result', async () => {
    stubSuccessfulDeepSeekResponse({
      diagnosis: 'No implementation was produced.',
      fileChanges: [],
      notes: [],
      scopeExpansionRequested: false,
    });

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'returned no file changes',
    );
  });

  it('times out through AbortController without making an unbounded request', async () => {
    process.env.DEEPSEEK_DEVELOPMENT_TIMEOUT_MS = '5';
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
      ),
    );

    await expect(deepSeekCodingProvider.implement(makeContext())).rejects.toThrow(
      'timed out after 5ms',
    );
  });
});

function makeContext(): CodingProviderContext {
  return {
    workspaceRoot,
    workspaceId: 'workspace-deepseek-test',
    mission: {
      id: 'dev-deepseek-provider-test',
      type: 'BUG_FIX',
      title: 'Update an example constant',
      request: 'Change the approved example value from 1 to 2.',
      expectedOutcome: 'The approved example exports value 2.',
      observedBehaviour: 'The approved example currently exports value 1.',
    },
    design: {
      id: 'design-deepseek-provider-test',
      summary: 'Update one bounded source file.',
      diagnosis: 'The example constant has the old value.',
      proposedChanges: [
        {
          file: TARGET_PATH,
          changeType: 'MODIFY',
          purpose: 'Update the approved constant.',
        },
      ],
      testPlan: ['Verify the exported value is 2.'],
      risks: ['The model must not change files outside the approved surface.'],
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

function stubSuccessfulDeepSeekResponse(result: DeepSeekResult): void {
  stubDeepSeekContent(JSON.stringify(result));
}

function stubDeepSeekContent(content: string): void {
  const envelope = JSON.stringify({
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  });

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(envelope),
    } as any),
  );
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveCodingProvider } from '../services/coding/resolveCodingProvider.js';
import {
  kimiCodingProvider,
  parseKimiOutput,
  validateKimiResult,
  deriveBoundedExecutionPolicy,
} from '../services/coding/KimiCodingProvider.js';
import { implementDevelopmentChange } from '../services/implementationService.js';
import { DevelopmentError } from '../errors.js';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { CodingProviderContext } from '../services/coding/CodingProvider.js';
import type { RunKimiResult } from '../services/coding/runKimi.js';

vi.mock('../services/coding/runKimi.js', () => ({
  runKimi: vi.fn(),
}));

vi.mock('../services/coding/kimiMissionProfile.js', () => ({
  prepareKimiMissionProfile: vi.fn(),
}));

import { runKimi } from '../services/coding/runKimi.js';
import { prepareKimiMissionProfile } from '../services/coding/kimiMissionProfile.js';

const mockedRunKimi = vi.mocked(runKimi);
const mockedPrepareKimiMissionProfile = vi.mocked(prepareKimiMissionProfile);

function makeRunKimiResult(overrides: Partial<RunKimiResult> = {}): RunKimiResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    killedByTimeout: false,
    killedBySize: false,
    telemetry: {
      startTime: new Date().toISOString(),
      pid: 12345,
      elapsedMs: 100,
      lastActivityTime: new Date().toISOString(),
      stdoutBytes: 0,
      stderrBytes: 0,
      timeoutMs: 1200000,
      completionReason: 'success',
    },
    ...overrides,
  };
}

function assertErrorCode(fn: () => unknown, code: string): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DevelopmentError);
  expect((err as DevelopmentError).code).toBe(code);
}

async function assertAsyncErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  let err: unknown;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DevelopmentError);
  expect((err as DevelopmentError).code).toBe(code);
}

function makeMission(overrides: Partial<DevelopmentMission> = {}): DevelopmentMission {
  return {
    id: 'dev-kimi-001',
    type: 'FEATURE',
    repositoryId: 'cardbey',
    baseBranch: 'main',
    title: overrides.title ?? 'Test mission',
    request: overrides.request ?? 'Test request',
    expectedOutcome: 'Test outcome',
    observedBehaviour: overrides.observedBehaviour,
    riskLevel: 'LOW',
    state: 'IMPLEMENTING',
    requestedBy: 'test-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDesign(overrides: Partial<DevelopmentDesign> = {}): DevelopmentDesign {
  return {
    id: 'design-dev-kimi-001-v1',
    missionId: 'dev-kimi-001',
    version: 1,
    summary: overrides.summary ?? 'Test design',
    diagnosis: overrides.diagnosis ?? 'Test diagnosis',
    proposedChanges: overrides.proposedChanges ?? [],
    testPlan: [],
    rollbackPlan: 'Revert branch',
    risks: [],
    proposedBy: 'test-user',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeImpactReport(
  overrides: Partial<DevelopmentImpactReport> = {},
): DevelopmentImpactReport {
  return {
    id: 'imp-dev-kimi-001',
    missionId: 'dev-kimi-001',
    affectedSystems: ['frontend'],
    observedSystems: ['frontend'],
    modifiedSystems: ['frontend'],
    canonicalPath: '/',
    legacyPaths: [],
    proposedFiles: [],
    migrationRequired: false,
    securityReviewRequired: false,
    performanceReviewRequired: false,
    estimatedRisk: 'LOW',
    estimatedEffort: 'SMALL',
    acceptanceCriteria: [],
    findings: [],
    recommendations: [],
    generatedAt: new Date(),
    generatedBy: 'test',
    ...overrides,
  };
}

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-kimi-test-'));
  fs.mkdirSync(path.join(dir, 'apps/core/cardbey-core/src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development'), {
    recursive: true,
  });
  return dir;
}

describe('KimiCodingProvider V1', () => {
  let workspaceRoot: string;
  let originalKimiFlag: string | undefined;

  beforeEach(() => {
    workspaceRoot = createTempWorkspace();
    originalKimiFlag = process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;
    mockedRunKimi.mockReset();
    mockedPrepareKimiMissionProfile.mockReset();
    mockedPrepareKimiMissionProfile.mockResolvedValue({
      kimiHome: path.join(workspaceRoot, '.kimi-code-home'),
      parentHome: '/parent/kimi/home',
      missionStateRoot: path.join(workspaceRoot, '.kimi-state'),
      defaultModel: 'moonshot-ai/kimi-k2.7-code',
      providerName: 'moonshot-ai',
    });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    if (originalKimiFlag === undefined) {
      delete process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1;
    } else {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = originalKimiFlag;
    }
    vi.unstubAllEnvs();
  });

  it('feature flag OFF: Kimi provider is not selected', () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'false';
    const mission = makeMission({ title: 'Generic feature', request: 'Add feature' });
    const design = makeDesign();
    assertErrorCode(() => resolveCodingProvider({ mission, design }), 'UNSUPPORTED_CODING_PROVIDER');
  });

  it('feature flag ON: normal non-sidebar mission selects Kimi provider', () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    const mission = makeMission({ title: 'Generic feature', request: 'Add feature' });
    const design = makeDesign();
    const provider = resolveCodingProvider({ mission, design });
    expect(provider.id).toBe('kimi');
  });

  it('duplicate-sidebar mission still selects legacy provider first', () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    const mission = makeMission({
      title: 'Remove duplicate sidebar on Development Runtime page',
      request: 'Fix duplicate console sidebar on /app/development',
      observedBehaviour: 'Two vertical sidebar rails visible',
    });
    const design = makeDesign();
    const provider = resolveCodingProvider({ mission, design });
    expect(provider.id).toBe('duplicate-sidebar');
  });

  it('Kimi process cwd equals supplied workspaceRoot and KIMI_CODE_HOME is mission-local', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    const kimiHome = path.join(workspaceRoot, '.kimi-code-home');
    mockedPrepareKimiMissionProfile.mockResolvedValue({
      kimiHome,
      parentHome: '/parent/kimi/home',
      missionStateRoot: path.join(workspaceRoot, '.kimi-state'),
      defaultModel: 'moonshot-ai/kimi-k2.7-code',
      providerName: 'moonshot-ai',
    });

    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({
        stdout:
          '```json\n{"diagnosis":"ok","fileChanges":[{"path":"apps/core/cardbey-core/src/x.ts","changeType":"CREATE","before":"","after":"x"}]}\n```',
      }),
    );

    const context: CodingProviderContext = {
      mission: makeMission(),
      design: makeDesign(),
      workspaceRoot,
      workspaceId: 'ws-kimi-001',
      author: 'test',
    };

    await kimiCodingProvider.implement(context);

    expect(mockedRunKimi).toHaveBeenCalledTimes(1);
    const call = mockedRunKimi.mock.calls[0]![0];
    expect(call.cwd).toBe(workspaceRoot);
    expect(call.kimiHome).toBe(kimiHome);
  });

  it('malformed Kimi output is rejected', () => {
    assertErrorCode(() => parseKimiOutput('not json', 'text'), 'KIMI_OUTPUT_NOT_JSON');
  });

  it('outside-workspace path is rejected', () => {
    const parsed = {
      diagnosis: 'bad',
      fileChanges: [{ path: '../secrets', changeType: 'CREATE', before: '', after: 'x' }],
    };
    assertErrorCode(() => validateKimiResult(parsed, workspaceRoot), 'KIMI_OUTPUT_FORBIDDEN_PATH');
  });

  it('forbidden path is rejected', () => {
    const parsed = {
      diagnosis: 'bad',
      fileChanges: [{ path: '.env', changeType: 'CREATE', before: '', after: 'x' }],
    };
    assertErrorCode(() => validateKimiResult(parsed, workspaceRoot), 'KIMI_OUTPUT_FORBIDDEN_PATH');
  });

  it('.kimi-code-home path is rejected so it cannot enter a patch', () => {
    const parsed = {
      diagnosis: 'bad',
      fileChanges: [
        { path: '.kimi-code-home/config.toml', changeType: 'CREATE', before: '', after: 'x' },
      ],
    };
    assertErrorCode(() => validateKimiResult(parsed, workspaceRoot), 'KIMI_OUTPUT_FORBIDDEN_PATH');
  });

  it('credential path is rejected so it cannot enter a patch', () => {
    const parsed = {
      diagnosis: 'bad',
      fileChanges: [
        {
          path: 'credentials/kimi-code.json',
          changeType: 'CREATE',
          before: '',
          after: '{"secret":true}',
        },
      ],
    };
    assertErrorCode(() => validateKimiResult(parsed, workspaceRoot), 'KIMI_OUTPUT_FORBIDDEN_PATH');
  });

  it('empty fileChanges is rejected for Kimi implementation', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({
        stdout: '```json\n{"diagnosis":"ok","fileChanges":[]}\n```',
      }),
    );

    const context: CodingProviderContext = {
      mission: makeMission(),
      design: makeDesign(),
      workspaceRoot,
      workspaceId: 'ws-kimi-002',
      author: 'test',
    };

    await assertAsyncErrorCode(kimiCodingProvider.implement(context), 'KIMI_OUTPUT_EMPTY');
  });

  it('valid Kimi-shaped response produces structured fileChanges', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({
        stdout:
          '```json\n{"diagnosis":"created helper","fileChanges":[{"path":"apps/core/cardbey-core/src/helper.ts","changeType":"CREATE","before":"","after":"export const x = 1;"}],"notes":["first pass"]}\n```',
      }),
    );

    const context: CodingProviderContext = {
      mission: makeMission(),
      design: makeDesign(),
      workspaceRoot,
      workspaceId: 'ws-kimi-003',
      author: 'test',
    };

    const result = await kimiCodingProvider.implement(context);
    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0]!.path).toBe('apps/core/cardbey-core/src/helper.ts');
    expect(result.fileChanges[0]!.changeType).toBe('CREATE');
    expect(result.diagnosis).toContain('created helper');
  });

  it('duplicate paths in Kimi output are rejected', () => {
    const parsed = {
      diagnosis: 'bad',
      fileChanges: [
        { path: 'apps/core/cardbey-core/src/x.ts', changeType: 'CREATE', before: '', after: 'a' },
        { path: 'apps/core/cardbey-core/src/x.ts', changeType: 'MODIFY', before: 'a', after: 'b' },
      ],
    };
    assertErrorCode(() => validateKimiResult(parsed, workspaceRoot), 'KIMI_OUTPUT_DUPLICATE_PATH');
  });

  it('scope expansion request fails closed', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({
        stdout:
          '```json\n{"diagnosis":"needs more scope","fileChanges":[{"path":"apps/core/cardbey-core/src/x.ts","changeType":"CREATE","before":"","after":"x"}],"scopeExpansionRequested":true}\n```',
      }),
    );

    const context: CodingProviderContext = {
      mission: makeMission(),
      design: makeDesign(),
      workspaceRoot,
      workspaceId: 'ws-kimi-004',
      author: 'test',
    };

    await assertAsyncErrorCode(
      kimiCodingProvider.implement(context),
      'KIMI_SCOPE_EXPANSION_REQUESTED',
    );
  });

  it('implementationService still owns patch bookkeeping when using Kimi provider', async () => {
    process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
    mockedRunKimi.mockResolvedValue(
      makeRunKimiResult({
        stdout:
          '```json\n{"diagnosis":"created file","fileChanges":[{"path":"apps/core/cardbey-core/src/owned.ts","changeType":"CREATE","before":"","after":"export const owned = true;"}]}\n```',
      }),
    );

    const mission = makeMission({ id: 'dev-kimi-005' });
    const design = makeDesign({ summary: 'Kimi-owned patch test', missionId: mission.id });

    const { patch, fileChanges, elevatedPaths } = await implementDevelopmentChange({
      mission,
      design,
      workspaceRoot,
      workspaceId: 'ws-kimi-005',
      author: 'kimi',
    });

    expect(patch.missionId).toBe(mission.id);
    expect(patch.filesAdded).toContain('apps/core/cardbey-core/src/owned.ts');
    expect(fileChanges[0]!.patchId).toBe(`patch-${mission.id}`);
    expect(fileChanges[0]!.afterHash).toBeDefined();
    expect(elevatedPaths).toEqual([]);

    const written = fs.readFileSync(
      path.join(workspaceRoot, 'apps/core/cardbey-core/src/owned.ts'),
      'utf-8',
    );
    expect(written).toBe('export const owned = true;');
  });

  describe('bounded execution policy', () => {
    it('selects BOUNDED mode for small high-confidence single-target missions', () => {
      const design = makeDesign({
        proposedChanges: [
          {
            file: 'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
            purpose: 'Fix duplicate sidebar',
            changeType: 'MODIFY',
          },
        ],
      });
      const impactReport = makeImpactReport({
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [
            'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx',
          ],
          contextFiles: [
            'apps/dashboard/cardbey-marketing-dashboard/src/components/ConsoleSidebar.tsx',
          ],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      const policy = deriveBoundedExecutionPolicy({
        mission: makeMission(),
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-policy-001',
        author: 'test',
      });

      expect(policy.mode).toBe('BOUNDED');
      expect(policy.changeTargets).toHaveLength(1);
      expect(policy.contextFiles).toContain(
        'apps/dashboard/cardbey-marketing-dashboard/src/components/ConsoleSidebar.tsx',
      );
      expect(policy.lowConfidence).toBe(false);
    });

    it('selects BROAD mode for low-confidence missions', () => {
      const design = makeDesign();
      const impactReport = makeImpactReport({
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [],
          contextFiles: [],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: true,
        },
      });

      const policy = deriveBoundedExecutionPolicy({
        mission: makeMission(),
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-policy-002',
        author: 'test',
      });

      expect(policy.mode).toBe('BROAD');
      expect(policy.lowConfidence).toBe(true);
    });

    it('selects BROAD mode for cross-stack missions', () => {
      const design = makeDesign();
      const impactReport = makeImpactReport({
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [
            'apps/dashboard/cardbey-marketing-dashboard/src/pages/SomePage.tsx',
            'apps/core/cardbey-core/src/services/api.ts',
          ],
          contextFiles: [],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      const policy = deriveBoundedExecutionPolicy({
        mission: makeMission(),
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-policy-003',
        author: 'test',
      });

      expect(policy.mode).toBe('BROAD');
    });

    it('small one-target prompt tells Kimi repository exploration is already done', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const target =
        'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx';
      const contextFile =
        'apps/dashboard/cardbey-marketing-dashboard/src/components/ConsoleSidebar.tsx';

      fs.mkdirSync(path.join(workspaceRoot, path.dirname(target)), { recursive: true });
      fs.writeFileSync(path.join(workspaceRoot, target), 'export default {};', 'utf-8');

      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          stdout: `\`\`\`json\n{"diagnosis":"ok","fileChanges":[{"path":"${target}","changeType":"MODIFY","after":"export default {};"}]}\n\`\`\``,
        }),
      );

      const mission = makeMission({ id: 'dev-kimi-bounded' });
      const design = makeDesign({
        missionId: mission.id,
        proposedChanges: [{ file: target, purpose: 'Fix page', changeType: 'MODIFY' }],
      });
      const impactReport = makeImpactReport({
        missionId: mission.id,
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [target],
          contextFiles: [contextFile],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      await kimiCodingProvider.implement({
        mission,
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-bounded',
        author: 'test',
      });

      const prompt = mockedRunKimi.mock.calls[0]![0].prompt;
      expect(prompt).toContain('Repository exploration has already been performed');
      expect(prompt).toContain(`- CHANGE_TARGET files to modify:\n- ${target}`);
      expect(prompt).toContain(`- CONTEXT files`);
      expect(prompt).toContain(contextFile);
      expect(prompt).toContain('Do NOT perform broad repository exploration');
    });

    it('bounded prompt instructs Kimi to fail-closed on missing CHANGE_TARGET', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const target =
        'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx';

      const mission = makeMission({ id: 'dev-kimi-bounded-missing-target-prompt' });
      const design = makeDesign({
        missionId: mission.id,
        proposedChanges: [{ file: target, purpose: 'Fix page', changeType: 'MODIFY' }],
      });
      const impactReport = makeImpactReport({
        missionId: mission.id,
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [target],
          contextFiles: [],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      // Create the target so the provider proceeds far enough to capture the prompt.
      fs.writeFileSync(path.join(workspaceRoot, target), 'export default {};', 'utf-8');

      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          stdout: `\`\`\`json\n{"diagnosis":"ok","fileChanges":[{"path":"${target}","changeType":"MODIFY","after":"export default {};"}]}\n\`\`\``,
        }),
      );

      await kimiCodingProvider.implement({
        mission,
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-bounded-missing-target-prompt',
        author: 'test',
      });

      const prompt = mockedRunKimi.mock.calls[0]![0].prompt;
      expect(prompt).toContain('Do NOT search for replacement implementations');
      expect(prompt).toContain('If a supplied CHANGE_TARGET file is missing from the worktree');
    });

    it('missing bounded MODIFY target prevents Kimi spawn and returns scope expansion', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const target =
        'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx';

      // Ensure target does NOT exist.
      try {
        fs.unlinkSync(path.join(workspaceRoot, target));
      } catch {
        /* may not exist */
      }

      const mission = makeMission({ id: 'dev-kimi-bounded-missing' });
      const design = makeDesign({
        missionId: mission.id,
        proposedChanges: [{ file: target, purpose: 'Fix page', changeType: 'MODIFY' }],
      });
      const impactReport = makeImpactReport({
        missionId: mission.id,
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [target],
          contextFiles: [],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      await assertAsyncErrorCode(
        kimiCodingProvider.implement({
          mission,
          design,
          impactReport,
          workspaceRoot,
          workspaceId: 'ws-bounded-missing',
          author: 'test',
        }),
        'KIMI_SCOPE_EXPANSION_REQUESTED',
      );

      expect(mockedRunKimi).not.toHaveBeenCalled();
    });

    it('existing bounded MODIFY target allows Kimi to execute', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const target =
        'apps/dashboard/cardbey-marketing-dashboard/src/pages/development/DevelopmentCenterPage.tsx';
      fs.writeFileSync(path.join(workspaceRoot, target), 'export default {};', 'utf-8');

      const mission = makeMission({ id: 'dev-kimi-bounded-existing' });
      const design = makeDesign({
        missionId: mission.id,
        proposedChanges: [{ file: target, purpose: 'Fix page', changeType: 'MODIFY' }],
      });
      const impactReport = makeImpactReport({
        missionId: mission.id,
        estimatedEffort: 'SMALL',
        changeSurface: {
          changeTargets: [target],
          contextFiles: [],
          testTargets: [],
          lowRelevance: [],
          lowConfidence: false,
        },
      });

      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          stdout: `\`\`\`json\n{"diagnosis":"ok","fileChanges":[{"path":"${target}","changeType":"MODIFY","after":"export default { updated: true };"}]}\n\`\`\``,
        }),
      );

      const result = await kimiCodingProvider.implement({
        mission,
        design,
        impactReport,
        workspaceRoot,
        workspaceId: 'ws-bounded-existing',
        author: 'test',
      });

      expect(mockedRunKimi).toHaveBeenCalledTimes(1);
      expect(result.fileChanges[0]!.path).toBe(target);
    });
  });

  describe('execution telemetry', () => {
    it('records telemetry to the mission-local state root', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const missionStateRoot = path.join(workspaceRoot, '.kimi-state');
      mockedPrepareKimiMissionProfile.mockResolvedValue({
        kimiHome: path.join(workspaceRoot, '.kimi-code-home'),
        parentHome: '/parent/kimi/home',
        missionStateRoot,
        defaultModel: 'moonshot-ai/kimi-k2.7-code',
        providerName: 'moonshot-ai',
      });

      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          stdout:
            '```json\n{"diagnosis":"ok","fileChanges":[{"path":"apps/core/cardbey-core/src/x.ts","changeType":"CREATE","before":"","after":"x"}]}\n```',
          telemetry: {
            startTime: '2024-01-01T00:00:00.000Z',
            pid: 9999,
            elapsedMs: 12345,
            lastActivityTime: '2024-01-01T00:00:12.345Z',
            stdoutBytes: 150,
            stderrBytes: 0,
            timeoutMs: 1200000,
            completionReason: 'success',
          },
        }),
      );

      await kimiCodingProvider.implement({
        mission: makeMission({ id: 'dev-kimi-tel' }),
        design: makeDesign({ missionId: 'dev-kimi-tel' }),
        workspaceRoot,
        workspaceId: 'ws-tel',
        author: 'test',
      });

      const logPath = path.join(missionStateRoot, 'kimi-telemetry.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
      const record = JSON.parse(lines[lines.length - 1]!);
      expect(record.missionId).toBe('dev-kimi-tel');
      expect(record.workspaceId).toBe('ws-tel');
      expect(record.pid).toBe(9999);
      expect(record.elapsedMs).toBe(12345);
      expect(record.completionReason).toBe('success');
    });

    it('timeout still fails safely with KIMI_TIMEOUT', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          killedByTimeout: true,
          exitCode: 1,
          telemetry: {
            startTime: '2024-01-01T00:00:00.000Z',
            pid: 9999,
            elapsedMs: 1200000,
            lastActivityTime: '2024-01-01T00:20:00.000Z',
            stdoutBytes: 0,
            stderrBytes: 0,
            timeoutMs: 1200000,
            completionReason: 'timeout',
          },
        }),
      );

      const context: CodingProviderContext = {
        mission: makeMission({ id: 'dev-kimi-timeout' }),
        design: makeDesign({ missionId: 'dev-kimi-timeout' }),
        workspaceRoot,
        workspaceId: 'ws-timeout',
        author: 'test',
      };

      await assertAsyncErrorCode(kimiCodingProvider.implement(context), 'KIMI_TIMEOUT');
    });
  });

  describe('optional before for MODIFY', () => {
    it('accepts MODIFY output that omits before content', async () => {
      process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 = 'true';
      const target = 'apps/core/cardbey-core/src/existing.ts';
      fs.writeFileSync(path.join(workspaceRoot, target), 'original content', 'utf-8');

      mockedRunKimi.mockResolvedValue(
        makeRunKimiResult({
          stdout: `\`\`\`json\n{"diagnosis":"updated","fileChanges":[{"path":"${target}","changeType":"MODIFY","after":"modified content"}]}\n\`\`\``,
        }),
      );

      const result = await implementDevelopmentChange({
        mission: makeMission({ id: 'dev-kimi-omit-before' }),
        design: makeDesign({ missionId: 'dev-kimi-omit-before' }),
        workspaceRoot,
        workspaceId: 'ws-omit-before',
        author: 'test',
      });

      expect(result.fileChanges[0]!.changeType).toBe('MODIFY');
      expect(result.fileChanges[0]!.additions).toBeGreaterThan(0);
      const written = fs.readFileSync(path.join(workspaceRoot, target), 'utf-8');
      expect(written).toBe('modified content');
    });
  });
});

/**
 * Kimi Coding Provider V1.
 *
 * A general-purpose implementation engine controlled by Cardbey. It invokes the
 * Kimi Code CLI non-interactively inside the mission worktree, parses the
 * structured JSON response, and returns bounded file changes for Cardbey to
 * validate and apply.
 *
 * Feature-flagged OFF by default via ENABLE_KIMI_DEVELOPMENT_ENGINE_V1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DevelopmentImpactReport } from '../../types/DevelopmentImpactReport.js';
import { DevelopmentError } from '../../errors.js';
import { resolveWorkspaceRelativePath } from '../pathSecurity.js';
import type {
  CodingProvider,
  CodingProviderContext,
  CodingProviderFileChange,
} from './CodingProvider.js';
import { prepareKimiMissionProfile } from './kimiMissionProfile.js';
import { runKimi, type RunKimiTelemetry } from './runKimi.js';

const fileChangeSchema = z.object({
  path: z.string().min(1),
  changeType: z.enum(['MODIFY', 'CREATE', 'DELETE']),
  // MODIFY may omit the previous content; the runtime reads it from the
  // worktree. DELETE should supply it when possible, but the runtime will
  // read the file as a fallback.
  before: z.string().optional(),
  after: z.string(),
});

const kimiResultSchema = z.object({
  diagnosis: z.string().min(1),
  fileChanges: z.array(fileChangeSchema),
  notes: z.array(z.string()).optional().default([]),
  scopeExpansionRequested: z.boolean().optional().default(false),
});

export type KimiResult = z.infer<typeof kimiResultSchema>;

export interface BoundedExecutionPolicy {
  mode: 'BOUNDED' | 'BROAD';
  changeTargets: string[];
  contextFiles: string[];
  testTargets: string[];
  lowConfidence: boolean;
  explorationInstruction: string;
}

export const kimiCodingProvider: CodingProvider = {
  id: 'kimi',

  canImplement() {
    return isKimiEnabled();
  },

  async implement(context) {
    if (!isKimiEnabled()) {
      throw new DevelopmentError(
        400,
        'KIMI_NOT_ENABLED',
        'Kimi development engine is not enabled. Set ENABLE_KIMI_DEVELOPMENT_ENGINE_V1=true to use it.',
      );
    }

    const { mission, design, workspaceRoot, workspaceId } = context;

    const profile = await prepareKimiMissionProfile(workspaceRoot, mission.id);
    const policy = deriveBoundedExecutionPolicy(context);

    if (policy.mode === 'BOUNDED') {
      const missing = policy.changeTargets.filter((t) => !fs.existsSync(path.join(workspaceRoot, t)));
      if (missing.length > 0) {
        throw new DevelopmentError(
          400,
          'KIMI_SCOPE_EXPANSION_REQUESTED',
          `Bounded Kimi run cannot proceed: approved CHANGE_TARGET files do not exist in the workspace: ${missing.join(', ')}.`,
        );
      }
    }

    const prompt = buildImplementationPrompt(context, policy);

    const timeoutMs = parseInt(process.env.KIMI_DEVELOPMENT_TIMEOUT_MS ?? '', 10) || 20 * 60 * 1000;
    const maxOutputBytes =
      parseInt(process.env.KIMI_DEVELOPMENT_MAX_OUTPUT_BYTES ?? '', 10) || 10 * 1024 * 1024;
    const outputFormat = process.env.KIMI_DEVELOPMENT_OUTPUT_FORMAT === 'stream-json'
      ? 'stream-json'
      : 'text';

    const runResult = await runKimi({
      prompt,
      cwd: workspaceRoot,
      kimiHome: profile.kimiHome,
      timeoutMs,
      maxOutputBytes,
      outputFormat,
    });

    await recordKimiTelemetry(profile.missionStateRoot, mission.id, workspaceId, runResult.telemetry);

    if (runResult.killedByTimeout) {
      throw new DevelopmentError(504, 'KIMI_TIMEOUT', `Kimi invocation timed out after ${timeoutMs}ms`);
    }
    if (runResult.killedBySize) {
      throw new DevelopmentError(
        413,
        'KIMI_OUTPUT_TOO_LARGE',
        `Kimi output exceeded ${maxOutputBytes} bytes`,
      );
    }
    if (runResult.exitCode !== 0) {
      throw new DevelopmentError(
        502,
        'KIMI_PROCESS_FAILED',
        `Kimi process exited ${runResult.exitCode}: ${runResult.stderr || runResult.stdout.slice(0, 500)}`,
      );
    }

    const parsed = parseKimiOutput(runResult.stdout, outputFormat);
    const validated = validateKimiResult(parsed, workspaceRoot);

    if (validated.scopeExpansionRequested) {
      // Surface scope expansion as a clear failure so the governor can decide.
      throw new DevelopmentError(
        400,
        'KIMI_SCOPE_EXPANSION_REQUESTED',
        `Kimi requested scope expansion for mission ${mission.id}. Human review required. Notes: ${validated.notes.join('; ')}`,
      );
    }

    const maxChangedFiles =
      parseInt(process.env.KIMI_DEVELOPMENT_MAX_CHANGED_FILES ?? '', 10) || 15;
    if (validated.fileChanges.length > maxChangedFiles) {
      throw new DevelopmentError(
        400,
        'KIMI_OUTPUT_TOO_MANY_FILES',
        `Kimi proposed ${validated.fileChanges.length} file changes; maximum is ${maxChangedFiles}`,
      );
    }
    if (validated.fileChanges.length === 0) {
      throw new DevelopmentError(
        400,
        'KIMI_OUTPUT_EMPTY',
        'Kimi returned no file changes for an implementation mission',
      );
    }

    const fileChanges: CodingProviderFileChange[] = validated.fileChanges.map((c) => ({
      path: c.path,
      changeType: c.changeType,
      before: c.before ?? '',
      after: c.after,
    }));

    return {
      diagnosis: `${validated.diagnosis}\n\nNotes: ${validated.notes.join('; ') || '(none)'}`,
      fileChanges,
    };
  },
};

function isKimiEnabled(): boolean {
  return process.env.ENABLE_KIMI_DEVELOPMENT_ENGINE_V1 === 'true';
}

export function deriveBoundedExecutionPolicy(context: CodingProviderContext): BoundedExecutionPolicy {
  const surface = context.impactReport?.changeSurface;
  if (!surface) {
    return {
      mode: 'BROAD',
      changeTargets: designChangeTargets(context.design),
      contextFiles: [],
      testTargets: [],
      lowConfidence: true,
      explorationInstruction:
        'Explore the worktree to identify the files relevant to the approved design.',
    };
  }

  const effort = context.impactReport?.estimatedEffort ?? 'MEDIUM';
  const isSmall = effort === 'SMALL';
  const fewTargets = surface.changeTargets.length <= 2;
  const highConfidence = !surface.lowConfidence;
  const crossStack = isCrossStackMission(surface.changeTargets);

  if (isSmall && fewTargets && highConfidence && !crossStack) {
    return {
      mode: 'BOUNDED',
      changeTargets: surface.changeTargets,
      contextFiles: surface.contextFiles,
      testTargets: surface.testTargets,
      lowConfidence: false,
      explorationInstruction:
        'Repository exploration has already been performed by RepositoryImpactReasoner and ChangeSurfaceSelector. ' +
        'Do NOT perform broad repository exploration. Do NOT search for replacement implementations. ' +
        'Work only with the supplied CHANGE_TARGET and CONTEXT files. ' +
        'If a supplied CHANGE_TARGET file is missing from the worktree, set scopeExpansionRequested=true immediately and explain that the approved surface is invalid. ' +
        'If the supplied surface is insufficient for any other reason, set scopeExpansionRequested=true and explain why in notes.',
    };
  }

  return {
    mode: 'BROAD',
    changeTargets: surface.changeTargets,
    contextFiles: surface.contextFiles,
    testTargets: surface.testTargets,
    lowConfidence: surface.lowConfidence,
    explorationInstruction:
      'You may explore the worktree as needed. The supplied CHANGE_TARGET and CONTEXT files are strong guidance, ' +
      'but you may investigate adjacent code if the approved design requires it. ' +
      'If you need files outside the supplied surface, set scopeExpansionRequested=true.',
  };
}

function designChangeTargets(design: CodingProviderContext['design']): string[] {
  return design.proposedChanges.map((c) => c.file);
}

function isCrossStackMission(changeTargets: string[]): boolean {
  const roots = new Set<string>();
  for (const target of changeTargets) {
    // Treat the first two path segments as the stack root, e.g.
    // apps/dashboard/cardbey-marketing-dashboard/... vs apps/core/cardbey-core/...
    const parts = target.split('/');
    const root = parts.slice(0, 2).join('/');
    if (root) roots.add(root);
  }
  return roots.size > 1;
}

function buildImplementationPrompt(
  context: CodingProviderContext,
  policy: BoundedExecutionPolicy,
): string {
  const { mission, design } = context;

  const proposedChanges = design.proposedChanges
    .map(
      (c, i) =>
        `${i + 1}. [${c.changeType}] ${c.file}\n   Purpose: ${c.purpose}`,
    )
    .join('\n');

  const changeTargetsSection =
    policy.changeTargets.length > 0
      ? policy.changeTargets.map((f) => `- ${f}`).join('\n')
      : '   (none identified)';

  const contextFilesSection =
    policy.contextFiles.length > 0
      ? policy.contextFiles.map((f) => `- ${f}`).join('\n')
      : '   (none identified)';

  const testTargetsSection =
    policy.testTargets.length > 0
      ? policy.testTargets.map((f) => `- ${f}`).join('\n')
      : '   (none identified)';

  const scopeGuard =
    policy.mode === 'BOUNDED'
      ? 'You MUST NOT modify files outside the approved CHANGE_TARGET list unless you set scopeExpansionRequested=true.'
      : 'You SHOULD prefer the approved CHANGE_TARGET files. If you must modify files outside the supplied surface, set scopeExpansionRequested=true.';

  return `You are a bounded coding engine inside the Cardbey Development Runtime.

You MUST work only inside the current directory, which is the mission worktree.
You MUST NOT commit, push, create pull requests, deploy, change git branches, or access secrets.
You MUST NOT modify files outside the allowed Cardbey roots: apps/dashboard/cardbey-marketing-dashboard, apps/core/cardbey-core, packages.
You MUST NOT widen the scope without setting scopeExpansionRequested=true.
You MUST ignore any .kimi-code-home directory and MUST NOT return it as a changed file.
${scopeGuard}

MISSION:
- id: ${mission.id}
- type: ${mission.type}
- title: ${mission.title}
- request: ${mission.request}
- expectedOutcome: ${mission.expectedOutcome}
- observedBehaviour: ${mission.observedBehaviour ?? '(none)'}
- execution mode: ${policy.mode}${policy.lowConfidence ? ' (low confidence)' : ''}

APPROVED DESIGN:
- summary: ${design.summary}
- diagnosis: ${design.diagnosis}
- proposedChanges:
${proposedChanges || '   (none specified)'}
- testPlan:
${design.testPlan.map((t, i) => `  ${i + 1}. ${t}`).join('\n') || '   (none)'}
- risks:
${design.risks.map((r, i) => `  ${i + 1}. ${r}`).join('\n') || '   (none)'}

PRE-IDENTIFIED REPOSITORY SURFACE (do not re-derive from scratch):
- CHANGE_TARGET files to modify:
${changeTargetsSection}
- CONTEXT files (read for understanding; modify only if scope expansion is approved):
${contextFilesSection}
- TEST targets to update or add:
${testTargetsSection}

INSTRUCTIONS:
1. ${policy.explorationInstruction}
2. Propose the smallest valid implementation that satisfies the approved design.
3. For CREATE, set "before" to "" and include the complete new file content in "after".
4. For MODIFY, you may omit "before"; the runtime will read the existing content from the worktree. Include the complete new file content in "after".
5. For DELETE, set "before" to the current content and "after" to "".
6. Return ONLY a JSON object wrapped in a markdown \`\`\`json block.

OUTPUT CONTRACT (wrap in \`\`\`json ... \`\`\`):
{
  "diagnosis": "One-sentence summary of what you changed and why.",
  "fileChanges": [
    {
      "path": "relative/path/inside/worktree.ext",
      "changeType": "MODIFY|CREATE|DELETE",
      "before": "optional for MODIFY; required for DELETE",
      "after": "..."
    }
  ],
  "notes": ["any caveats or assumptions"],
  "scopeExpansionRequested": false
}
`;
}

async function recordKimiTelemetry(
  missionStateRoot: string,
  missionId: string,
  workspaceId: string,
  telemetry: RunKimiTelemetry,
): Promise<void> {
  try {
    await fs.promises.mkdir(missionStateRoot, { recursive: true });
    const logPath = path.join(missionStateRoot, 'kimi-telemetry.jsonl');
    const record = JSON.stringify({
      missionId,
      workspaceId,
      recordedAt: new Date().toISOString(),
      ...telemetry,
    });
    await fs.promises.appendFile(logPath, `${record}\n`, 'utf-8');
  } catch {
    // Telemetry recording is best-effort and must never fail the mission.
  }
}

export function parseKimiOutput(stdout: string, outputFormat: 'text' | 'stream-json'): unknown {
  const trimmed = stdout.trim();

  if (outputFormat === 'stream-json') {
    // Collect text chunks from stream-json lines and attempt to parse the
    // accumulated JSON, or fall back to a JSON block.
    const lines = trimmed.split('\n').filter((l) => l.trim());
    const candidates: unknown[] = [];
    for (const line of lines) {
      try {
        candidates.push(JSON.parse(line));
      } catch {
        /* ignore non-JSON lines */
      }
    }
    // Prefer the last object that looks like our result shape.
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const candidate = candidates[i];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const obj = candidate as Record<string, unknown>;
        if (typeof obj.diagnosis === 'string' && Array.isArray(obj.fileChanges)) {
          return obj;
        }
      }
    }
  }

  // Try direct JSON parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Extract from a markdown JSON block.
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1]!.trim());
    } catch {
      /* fall through */
    }
  }

  throw new DevelopmentError(
    400,
    'KIMI_OUTPUT_NOT_JSON',
    'Kimi output could not be parsed as JSON',
  );
}

export function validateKimiResult(
  parsed: unknown,
  workspaceRoot: string,
): KimiResult {
  const parseResult = kimiResultSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new DevelopmentError(
      400,
      'KIMI_OUTPUT_INVALID',
      `Kimi output schema invalid: ${parseResult.error.message}`,
    );
  }

  const result = parseResult.data;
  const seen = new Set<string>();

  for (const change of result.fileChanges) {
    if (seen.has(change.path)) {
      throw new DevelopmentError(
        400,
        'KIMI_OUTPUT_DUPLICATE_PATH',
        `Kimi output contains duplicate path: ${change.path}`,
      );
    }
    seen.add(change.path);

    try {
      resolveWorkspaceRelativePath(workspaceRoot, change.path);
    } catch (err) {
      throw new DevelopmentError(
        400,
        'KIMI_OUTPUT_FORBIDDEN_PATH',
        `Kimi proposed forbidden path ${change.path}: ${(err as Error).message}`,
      );
    }
  }

  return result;
}

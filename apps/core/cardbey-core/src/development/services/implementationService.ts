/**
 * Provider-agnostic patch generation for development missions.
 *
 * This service is the boundary between Cardbey's governed runtime and a
 * CodingProvider. It validates every provider-proposed path, applies changes
 * through Cardbey's bounded workspace I/O, and produces the canonical patch
 * records that the orchestrator owns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentDesign } from '../types/DevelopmentDesign.js';
import type { DevelopmentImpactReport } from '../types/DevelopmentImpactReport.js';
import type { DevelopmentPatch } from '../types/DevelopmentPatch.js';
import type { DevelopmentFileChange } from '../types/DevelopmentFileChange.js';
import {
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
  resolveWorkspaceRelativePath,
  isElevatedPath,
} from './pathSecurity.js';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import { resolveCodingProvider } from './coding/resolveCodingProvider.js';
import type { CodingProviderFileChange } from './coding/CodingProvider.js';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function countLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function buildUnifiedDiff(pathRel: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const chunks: string[] = [`--- a/${pathRel}`, `+++ b/${pathRel}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) chunks.push(`-${b}`);
    if (a !== undefined) chunks.push(`+${a}`);
  }
  return chunks.join('\n');
}

function validateChangePath(workspaceRoot: string, change: CodingProviderFileChange): void {
  // Provider self-report is not authoritative. Re-validate every path through
  // Cardbey's workspace path-security layer.
  resolveWorkspaceRelativePath(workspaceRoot, change.path);
}

async function applyFileChange(
  workspaceRoot: string,
  change: CodingProviderFileChange,
): Promise<{ before: string; after: string }> {
  validateChangePath(workspaceRoot, change);

  let before = change.before;

  if (change.changeType === 'DELETE') {
    if (!before) {
      try {
        before = await readWorkspaceFile(workspaceRoot, change.path);
      } catch {
        before = '';
      }
    }
    await deleteWorkspaceFile(workspaceRoot, change.path);
    return { before, after: '' };
  }

  // CREATE or MODIFY
  // Allow Kimi to omit the previous content for MODIFY; the runtime reads it
  // from the worktree to build the canonical diff.
  if (change.changeType === 'MODIFY' && before === '') {
    try {
      before = await readWorkspaceFile(workspaceRoot, change.path);
    } catch {
      before = '';
    }
  }

  await writeWorkspaceFile(workspaceRoot, change.path, change.after);
  return { before, after: change.after };
}

export interface ImplementDevelopmentChangeResult {
  patch: DevelopmentPatch;
  fileChanges: DevelopmentFileChange[];
  diff: string;
  elevatedPaths: string[];
}

export async function implementDevelopmentChange(input: {
  mission: DevelopmentMission;
  design: DevelopmentDesign;
  impactReport?: DevelopmentImpactReport;
  workspaceRoot: string;
  workspaceId: string;
  author: string;
}): Promise<ImplementDevelopmentChangeResult> {
  const { mission, design, impactReport, workspaceRoot, workspaceId, author } = input;

  const provider = resolveCodingProvider({ mission, design });
  const result = await provider.implement({
    mission,
    design,
    impactReport,
    workspaceRoot,
    workspaceId,
    author,
  });

  const unifiedDiffs: string[] = [];
  const devFileChanges: DevelopmentFileChange[] = [];
  const touchedPaths = new Set<string>();

  for (const change of result.fileChanges) {
    const applied = await applyFileChange(workspaceRoot, change);
    const diff = buildUnifiedDiff(change.path, applied.before, applied.after);
    unifiedDiffs.push(diff);
    const { additions, deletions } = countLines(diff);
    devFileChanges.push({
      id: `fc-${mission.id}-${devFileChanges.length}`,
      patchId: `patch-${mission.id}`,
      path: change.path,
      changeType: change.changeType,
      additions,
      deletions,
      beforeHash: applied.before ? hashContent(applied.before) : undefined,
      afterHash: applied.after ? hashContent(applied.after) : undefined,
    });
    touchedPaths.add(change.path);
  }

  const diff = unifiedDiffs.join('\n\n');
  const diffDir = path.join(cardbeyRepositoryManifest.workspaceRoot, 'diffs');
  await fs.promises.mkdir(diffDir, { recursive: true });
  const diffArtifactPath = path.join(diffDir, `${mission.id}.diff`);
  await fs.promises.writeFile(diffArtifactPath, diff, 'utf-8');

  const patch: DevelopmentPatch = {
    id: `patch-${mission.id}`,
    missionId: mission.id,
    summary: design.summary,
    description: result.diagnosis,
    filesAdded: devFileChanges.filter((f) => f.changeType === 'CREATE').map((f) => f.path),
    filesModified: devFileChanges.filter((f) => f.changeType === 'MODIFY').map((f) => f.path),
    filesDeleted: devFileChanges.filter((f) => f.changeType === 'DELETE').map((f) => f.path),
    linesAdded: devFileChanges.reduce((s, f) => s + f.additions, 0),
    linesDeleted: devFileChanges.reduce((s, f) => s + f.deletions, 0),
    diff,
    author,
    createdAt: new Date(),
    approved: false,
  };

  const elevatedPaths = Array.from(touchedPaths).filter((p) => isElevatedPath(p));

  const augmentedPatch = patch as DevelopmentPatch & {
    workspaceId?: string;
    version?: number;
    riskLevel?: string;
    diffArtifactPath?: string;
    elevatedPaths?: string[];
  };
  augmentedPatch.workspaceId = workspaceId;
  augmentedPatch.version = 1;
  augmentedPatch.riskLevel = mission.riskLevel;
  augmentedPatch.diffArtifactPath = diffArtifactPath;
  augmentedPatch.elevatedPaths = elevatedPaths;

  return { patch, fileChanges: devFileChanges, diff, elevatedPaths };
}

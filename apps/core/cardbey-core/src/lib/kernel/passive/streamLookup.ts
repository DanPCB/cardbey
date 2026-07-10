/**
 * Phase 2 — resolve Reality Stream ids for intake parity lookup.
 */

import { getLatestPassiveCognitiveRun } from './persist.js';
import type { PassiveCognitiveRun } from '../types.js';

export type IntakeStreamLookupContext = {
  intakeAssetSessionKey?: string | null;
  contextSessionId?: string | null;
  missionId?: string | null;
  streamId?: string | null;
};

export function resolveIntakeRealityStreamCandidates(
  ctx: IntakeStreamLookupContext = {},
): string[] {
  const explicit = String(ctx.streamId ?? '').trim();
  if (explicit) return [explicit];

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    const trimmed = String(id ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const assetSession = String(ctx.intakeAssetSessionKey ?? '').trim();
  if (assetSession) push(`reality:session:${assetSession}`);

  const contextSession = String(ctx.contextSessionId ?? '').trim();
  if (contextSession) push(`reality:session:${contextSession}`);

  const missionId = String(ctx.missionId ?? '').trim();
  if (missionId) push(`reality:mission:${missionId}`);

  return out;
}

export function findPassiveCognitiveRunForIntake(
  ctx: IntakeStreamLookupContext = {},
): { streamId: string; run: PassiveCognitiveRun } | null {
  for (const streamId of resolveIntakeRealityStreamCandidates(ctx)) {
    const run = getLatestPassiveCognitiveRun(streamId);
    if (run) return { streamId, run };
  }
  return null;
}

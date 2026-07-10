/**
 * Phase 2 — frozen Evidence View over Reality Stream (query, not copy).
 */

import { randomUUID } from 'node:crypto';
import type { EvidenceView, PerceptionFrame, RealityStreamEvent } from '../types.js';

const QUERY_VERSION = 'evidence.v1';

/**
 * Build immutable evidence view selecting stream events referenced by perception.
 */
export function buildEvidenceViewFromPerception(
  perception: PerceptionFrame,
  events: RealityStreamEvent[],
): EvidenceView {
  const eventIds = events.map((e) => e.eventId);
  const observationIds = events.flatMap((e) =>
    (e.observations ?? []).map((o) => o.observationId),
  );

  const interpretationKinds = perception.interpretations.map((i) => i.entityKind).join(', ');

  return {
    evidenceId: randomUUID(),
    realityStreamId: perception.streamId,
    window: { ...perception.window },
    eventIds,
    observationIds,
    queryVersion: QUERY_VERSION,
    selectionReason: `Perception frame ${perception.frameId} over attachment stream (${interpretationKinds || 'no cues'})`,
    frozenAt: new Date().toISOString(),
  };
}

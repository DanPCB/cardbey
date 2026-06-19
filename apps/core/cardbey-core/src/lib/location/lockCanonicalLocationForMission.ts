/**
 * Lock canonical location into mission context at store-generation mission start.
 */

import { enrichMissionContext, createMissionContext } from '../../services/missionContextService.js';
import {
  logLocationCanonicalized,
  resolveCanonicalBusinessLocation,
  type ResolveCanonicalBusinessLocationInput,
} from './resolveCanonicalBusinessLocation.js';

export async function lockCanonicalLocationForMission(
  missionId: string,
  input: ResolveCanonicalBusinessLocationInput,
  trace: Record<string, unknown> = {},
): Promise<ReturnType<typeof resolveCanonicalBusinessLocation>> {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) {
    return resolveCanonicalBusinessLocation(input);
  }

  const canonical = resolveCanonicalBusinessLocation(input);

  try {
    await enrichMissionContext(id, { canonicalLocation: canonical }).catch(async () => {
      await createMissionContext(id, { canonicalLocation: canonical });
    });
  } catch {
    // Non-fatal — draft input still carries canonicalLocation.
  }

  logLocationCanonicalized({
    missionId: id,
    seedId: trace.seedId ?? null,
    draftId: trace.draftId ?? null,
    storeId: trace.storeId ?? null,
    inputLocation:
      trace.inputLocation ??
      input.locationText ??
      input.address ??
      input.userPrompt ??
      null,
    canonicalLocation: canonical,
    sourceUsed: canonical.source,
  });

  return canonical;
}

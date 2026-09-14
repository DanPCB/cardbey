/**
 * Duplicate-sidebar mission detector.
 *
 * This file previously contained mission-specific design generation logic. That
 * logic has been moved to the generic RepositoryDesignPlanner in
 * services/reasoning/DesignPlanner.ts.
 *
 * isDuplicateSidebarMission() is retained only as a provider-selection signal
 * so the legacy DuplicateSidebarCodingProvider can still be chosen when
 * appropriate. It is no longer used for impact analysis or design generation.
 */

import type { DevelopmentMission } from '../types/DevelopmentMission.js';

const SIDEBAR_MISSION_HINTS = ['duplicate sidebar', 'sidebar', 'console rail', 'two vertical'];

export function isDuplicateSidebarMission(mission: DevelopmentMission): boolean {
  const text = `${mission.title} ${mission.request} ${mission.observedBehaviour ?? ''}`.toLowerCase();
  return SIDEBAR_MISSION_HINTS.some((h) => text.includes(h));
}

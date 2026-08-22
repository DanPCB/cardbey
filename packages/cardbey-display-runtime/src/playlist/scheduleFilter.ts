import type { Clock } from '../platform/clock.js';
import type { DisplayManifest, DisplayManifestItem } from './displayManifest.js';

/**
 * Validity window rules (UTC):
 * - validFrom inclusive: item is active when now >= validFrom
 * - validUntil inclusive: item is active when now <= validUntil
 * - Malformed dates → item excluded (treated invalid for scheduling)
 */
export function isItemActiveAt(item: DisplayManifestItem, now: Date): boolean {
  const t = now.getTime();
  if (item.validFrom) {
    const from = Date.parse(item.validFrom);
    if (Number.isNaN(from)) return false;
    if (t < from) return false;
  }
  if (item.validUntil) {
    const until = Date.parse(item.validUntil);
    if (Number.isNaN(until)) return false;
    if (t > until) return false;
  }
  return true;
}

export function filterManifestBySchedule(
  manifest: DisplayManifest,
  clock: Clock,
): DisplayManifest {
  const now = clock.now();
  const items = manifest.playlist.items.filter((item) => isItemActiveAt(item, now));
  return {
    ...manifest,
    playlist: {
      ...manifest.playlist,
      items: items.map((item) => ({ ...item })),
    },
    settings: { ...manifest.settings },
  };
}

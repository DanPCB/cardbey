/**
 * Best-effort thinking log — in-memory ring buffer (no schema migration required).
 */

import { loadThinkingConfig } from '../../config/thinking.config.js';

export interface ThinkingLogEntry {
  missionId: string;
  thinking: string;
  timestamp: string;
}

const MAX_ENTRIES = 200;
const buffer: ThinkingLogEntry[] = [];

export class ThinkingLogger {
  async log(missionId: string, thinking: string): Promise<void> {
    const cfg = loadThinkingConfig();
    if (!cfg.enabled || !thinking.trim()) return;

    buffer.push({
      missionId,
      thinking,
      timestamp: new Date().toISOString(),
    });

    if (buffer.length > MAX_ENTRIES) {
      buffer.splice(0, buffer.length - MAX_ENTRIES);
    }
  }

  list(missionId?: string): ThinkingLogEntry[] {
    if (!missionId) return [...buffer];
    return buffer.filter((e) => e.missionId === missionId);
  }
}

let singleton: ThinkingLogger | null = null;

export function getThinkingLogger(): ThinkingLogger {
  if (!singleton) singleton = new ThinkingLogger();
  return singleton;
}

export function resetThinkingLoggerForTests(): void {
  buffer.length = 0;
  singleton = null;
}

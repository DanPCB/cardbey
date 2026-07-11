/**
 * Telemetry collection for multi-agent missions.
 */

import type { AgentType, QualityMetrics, TelemetryData } from '../types/agent.types.js';
import { estimateCostUsd } from '../config/deepseek.config.js';
import logger from './logger.js';

export interface MissionMetricsSnapshot {
  missions: number;
  completed: number;
  failed: number;
  pendingHumanReview: number;
  totalTokens: number;
  totalCostUsd: number;
  averageDurationMs: number;
  planApprovalRate: number;
}

const missionHistory: TelemetryData[] = [];
const MAX_HISTORY = 500;
type MissionListener = (telemetry: TelemetryData) => void;
const missionListeners: MissionListener[] = [];

export function onMissionRecorded(listener: MissionListener): () => void {
  missionListeners.push(listener);
  return () => {
    const idx = missionListeners.indexOf(listener);
    if (idx >= 0) missionListeners.splice(idx, 1);
  };
}

export class MetricsCollector {
  private tokenBatch: Array<{ agent: AgentType; tokens: number; model: string }> = [];

  recordMission(telemetry: TelemetryData): void {
    missionHistory.push(telemetry);
    if (missionHistory.length > MAX_HISTORY) {
      missionHistory.shift();
    }

    for (const listener of missionListeners) {
      try {
        listener(telemetry);
      } catch {
        /* non-blocking */
      }
    }

    if (process.env.AGENT_TELEMETRY_ENABLED !== 'false') {
      logger.info({
        message: 'mission_telemetry',
        missionId: telemetry.missionId,
        duration: telemetry.duration,
        agentsUsed: telemetry.agentsUsed,
        tokenUsage: telemetry.tokenUsage,
        retries: telemetry.retries,
        costUsd: telemetry.costUsd,
        qualityMetrics: telemetry.qualityMetrics,
      });
    }
  }

  addTokenUsage(agent: AgentType, tokens: number, model: string): void {
    this.tokenBatch.push({ agent, tokens, model });
  }

  flushTokenBatch(): { total: number; costUsd: number } {
    let total = 0;
    let costUsd = 0;
    for (const entry of this.tokenBatch) {
      total += entry.tokens;
      costUsd += estimateCostUsd(entry.model, entry.tokens);
    }
    this.tokenBatch = [];
    return { total, costUsd };
  }

  recordHitlFeedback(missionId: string, decision: string, notes?: string): void {
    logger.info({
      message: 'hitl_feedback',
      missionId,
      decision,
      notes,
    });
  }

  getSnapshot(): MissionMetricsSnapshot {
    const missions = missionHistory.length;
    const completed = missionHistory.filter((m) => m.agentsUsed.length > 0).length;
    const failed = missionHistory.filter((m) => m.errors.length > 0).length;
    const pendingHumanReview = missionHistory.filter(
      (m) => m.missionStatus === 'pending_human_review',
    ).length;
    const totalTokens = missionHistory.reduce((sum, m) => sum + (m.tokenUsage?.total ?? 0), 0);
    const totalCostUsd = missionHistory.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
    const averageDurationMs =
      missions > 0
        ? missionHistory.reduce((sum, m) => sum + m.duration, 0) / missions
        : 0;

    const approved = missionHistory.filter(
      (m) => (m.qualityMetrics?.planApprovalRate ?? 0) >= 1,
    ).length;
    const planApprovalRate = missions > 0 ? approved / missions : 0;

    return {
      missions,
      completed,
      failed,
      pendingHumanReview,
      totalTokens,
      totalCostUsd,
      averageDurationMs,
      planApprovalRate,
    };
  }
}

export function buildQualityMetrics(input: {
  intentConfidence?: number;
  criticConfidence?: number;
  planApproved?: boolean;
  refinementCount?: number;
}): QualityMetrics {
  return {
    intentConfidence: input.intentConfidence,
    criticConfidence: input.criticConfidence,
    planApprovalRate: input.planApproved ? 1 : 0,
    refinementCount: input.refinementCount,
  };
}

export const globalMetrics = new MetricsCollector();

export function getMissionHistory(): TelemetryData[] {
  return [...missionHistory];
}

export function resetMissionHistoryForTests(): void {
  missionHistory.length = 0;
}

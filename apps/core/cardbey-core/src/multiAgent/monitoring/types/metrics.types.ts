/**
 * Multi-agent monitoring metric types (Control Center dashboard).
 */

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
  unit?: string;
}

export interface AgentMetrics {
  agentName: string;
  calls: number;
  successRate: number;
  averageLatency: number;
  tokenUsage: number;
  cost: number;
  errors: string[];
}

export interface MissionMetrics {
  missionId: string;
  intent: string;
  status: 'success' | 'failed' | 'pending_human_review';
  duration: number;
  agentsUsed: string[];
  tokenUsage: number;
  cost: number;
  confidence: number;
  planComplexity: 'low' | 'medium' | 'high';
}

export interface ShadowComparison {
  missionId: string;
  userMessage: string;
  currentIntent: string;
  deepSeekIntent: string;
  currentConfidence: number;
  deepSeekConfidence: number;
  matched: boolean;
  deepSeekBetter: boolean;
  deepSeekPlanSteps: number;
  currentPlanSteps: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  errorRate: number;
  successRate: number;
  averageResponseTime: number;
  activeMissions: number;
  queueSize: number;
  agentStatuses: Record<string, 'up' | 'down' | 'degraded'>;
  lastError?: string;
  lastUpdate: string;
  updateAgeMs: number;
  isFresh: boolean;
  updateIntervalSeconds: number;
  configValid: boolean;
  healthChecks: boolean;
  capacityAvailable: boolean;
  activeAgents: number;
  sleepingAgents: number;
  healthScore: number;
  agentDetails: AgentHealthDetail[];
}

export interface AgentHealthDetail {
  name: string;
  displayName: string;
  status: 'healthy' | 'degraded' | 'critical';
  latencyMs: number;
  calls: number;
  lastCheck: string;
  error?: string;
}

export interface CostBreakdown {
  total: number;
  byAgent: Record<string, number>;
  byIntent: Record<string, number>;
  byTime: Array<{ timestamp: Date; cost: number }>;
  projectedDailyCost: number;
  monthlyRunRate: number;
}

export interface DashboardSummaryMetrics {
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  hitlRate: number;
  totalCost: number;
}

export interface DashboardData {
  timeRange: string;
  metrics: DashboardSummaryMetrics;
  charts: {
    requestsOverTime: Array<{ timestamp: Date; count: number; success: number; failed: number }>;
    intentDistribution: Array<{ intent: string; count: number }>;
    agentPerformance: AgentMetrics[];
    costOverTime: Array<{ timestamp: Date; cost: number }>;
    shadowComparison: {
      matchRate: number;
      deepSeekBetterRate: number;
      currentBetterRate: number;
      samples: ShadowComparison[];
    };
    health: SystemHealth;
  };
  recentMissions: MissionMetrics[];
  recentAlerts: import('./alert.types.js').Alert[];
}

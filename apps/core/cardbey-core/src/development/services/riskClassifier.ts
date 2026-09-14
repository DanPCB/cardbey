/**
 * Evidence-based risk classification for Development Runtime missions.
 *
 * Risk is derived from the mission type, frozen evidence, and the proposed
 * change surface. No mission-specific constants are hard-coded.
 */

import type { DevelopmentMission } from '../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../types/DevelopmentEvidence.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskInput {
  mission: DevelopmentMission;
  evidence?: DevelopmentEvidence;
  proposedFiles?: string[];
  affectedSystems?: string[];
}

const TYPE_BASE_RISK: Record<DevelopmentMission['type'], RiskLevel> = {
  DOCUMENTATION: 'LOW',
  BUG_FIX: 'LOW',
  FEATURE: 'LOW',
  REFACTOR: 'MEDIUM',
  PERFORMANCE: 'MEDIUM',
  THIRD_PARTY_INTEGRATION: 'MEDIUM',
  DATABASE_MIGRATION: 'HIGH',
  INFRASTRUCTURE: 'HIGH',
  SECURITY_PATCH: 'CRITICAL',
};

const ELEVATED_KEYWORDS = [
  'prisma',
  'migration',
  'migrations',
  'database_url',
  'database url',
  'database schema',
  'auth',
  'authentication',
  'authorization',
  'workflow',
  'workflows',
  'runtime authority',
  'runtimeauthority',
  'production infrastructure',
  'infrastructure',
  'deploy',
  'deployment',
  'secret',
  'secrets',
  'credential',
  'credentials',
];

const ELEVATED_PATH_PATTERNS = [
  /\/prisma\//i,
  /\/migrations\//i,
  /\/auth\//i,
  /\/runtimeauthority\//i,
  /\/workflows\//i,
  /schema\.prisma$/i,
  /\.env/i,
];

function lowerText(input: RiskInput): string {
  const parts: string[] = [
    input.mission.title,
    input.mission.request,
    input.mission.expectedOutcome,
    input.mission.observedBehaviour ?? '',
  ];

  if (input.evidence) {
    parts.push(
      ...(input.evidence.suspectedFiles ?? []),
      ...(input.evidence.affectedRoutes ?? []),
      input.evidence.expectedBehaviour,
      input.evidence.currentBehaviour,
    );
  }

  if (input.proposedFiles) {
    parts.push(...input.proposedFiles);
  }

  return parts.join(' ').toLowerCase();
}

function keywordRisk(text: string): RiskLevel | null {
  const hits = ELEVATED_KEYWORDS.filter((kw) => text.includes(kw));
  if (hits.length === 0) return null;

  const hasDatabase = hits.some((h) =>
    ['prisma', 'migration', 'migrations', 'database_url', 'database url', 'database schema'].includes(h),
  );
  const hasAuth = hits.some((h) => ['auth', 'authentication', 'authorization'].includes(h));
  const hasSecrets = hits.some((h) => ['secret', 'secrets', 'credential', 'credentials'].includes(h));
  const hasWorkflows = hits.some((h) => ['workflow', 'workflows'].includes(h));
  const hasRuntimeAuthority = hits.some((h) => ['runtime authority', 'runtimeauthority'].includes(h));

  if (hasSecrets || hasRuntimeAuthority) return 'CRITICAL';
  if (hasDatabase || hasAuth) return 'HIGH';
  if (hasWorkflows) return 'MEDIUM';
  return 'MEDIUM';
}

function pathRisk(proposedFiles: string[]): RiskLevel | null {
  let max: RiskLevel | null = null;

  for (const file of proposedFiles) {
    for (const pattern of ELEVATED_PATH_PATTERNS) {
      if (pattern.test(file)) {
        const level: RiskLevel = /\.env/i.test(file) ? 'CRITICAL' : 'HIGH';
        if (!max || compareRisk(level, max) > 0) {
          max = level;
        }
      }
    }
  }

  return max;
}

function systemRisk(affectedSystems: string[]): RiskLevel | null {
  if (affectedSystems.includes('runtime-authority')) return 'CRITICAL';
  if (affectedSystems.includes('auth') || affectedSystems.includes('database')) return 'HIGH';
  if (affectedSystems.includes('routing') || affectedSystems.includes('api')) return 'MEDIUM';
  return null;
}

function compareRisk(a: RiskLevel, b: RiskLevel): number {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return order[a] - order[b];
}

function maxRisk(...levels: (RiskLevel | null)[]): RiskLevel {
  let current: RiskLevel = 'LOW';
  for (const level of levels) {
    if (level && compareRisk(level, current) > 0) {
      current = level;
    }
  }
  return current;
}

export function classifyMissionRisk(input: RiskInput): RiskLevel {
  const typeRisk = TYPE_BASE_RISK[input.mission.type] ?? 'LOW';
  const text = lowerText(input);

  return maxRisk(
    typeRisk,
    keywordRisk(text),
    pathRisk(input.proposedFiles ?? []),
    systemRisk(input.affectedSystems ?? []),
  );
}

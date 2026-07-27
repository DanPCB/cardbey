/**
 * Self-audit fix history persistence (file-backed).
 */

import fs from 'node:fs';
import path from 'node:path';

export type SelfAuditFixRecordStatus =
  | 'proposed'
  | 'applied'
  | 'verified'
  | 'persisting'
  | 'dismissed'
  | 'rejected';

export interface SelfAuditFixRecord {
  id: string;
  issueId: string;
  status: SelfAuditFixRecordStatus;
  description: string;
  proposedAt: string;
  appliedAt?: string;
  appliedBy?: string;
  outcome?: 'improved' | 'stable' | 'worsening' | 'waiting_validation';
  guardrails: Record<string, boolean>;
  playbookId?: string;
  updatedAt?: string;
}

const HISTORY_DIR = path.resolve(process.cwd(), 'self-audit-reports');
const HISTORY_FILE = path.join(HISTORY_DIR, 'fix-history.json');

function ensureDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

export function loadFixRecords(): SelfAuditFixRecord[] {
  ensureDir();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFixRecords(records: SelfAuditFixRecord[]): void {
  ensureDir();
  const retentionDays = Number(process.env.SELF_AUDIT_RETENTION_DAYS ?? 30);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const trimmed = records.filter((r) => new Date(r.proposedAt).getTime() >= cutoff);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

export function appendFixRecord(record: SelfAuditFixRecord): void {
  const records = loadFixRecords();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  saveFixRecords(records);
}

export function findFixRecordByIssueId(issueId: string): SelfAuditFixRecord | undefined {
  const records = loadFixRecords();
  return [...records].reverse().find((r) => r.issueId === issueId);
}

export function createFixRecordId(): string {
  return `fix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface SelfAuditRunReport {
  timestamp: string;
  issuesFound: number;
  fixesProposed: number;
  success: boolean;
  issues: unknown[];
  fixes: unknown[];
}

export function saveAuditReport(report: SelfAuditRunReport): string {
  ensureDir();
  const filename = `report-${Date.now()}.json`;
  fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(report, null, 2));
  return filename;
}

export function getLatestAuditReport(): SelfAuditRunReport | null {
  ensureDir();
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => f.startsWith('report-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    const raw = fs.readFileSync(path.join(HISTORY_DIR, files[0]!), 'utf-8');
    return JSON.parse(raw) as SelfAuditRunReport;
  } catch {
    return null;
  }
}

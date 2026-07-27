/**
 * Audit trail for governed language fix apply/rollback (server-side).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.resolve(__dirname, '../../../data/language-agent');
const AUDIT_FILE = path.join(AUDIT_DIR, 'apply-history.json');
const AUDIT_MAX = 500;

function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

function readAll() {
  ensureAuditDir();
  if (!fs.existsSync(AUDIT_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries) {
  ensureAuditDir();
  fs.writeFileSync(AUDIT_FILE, `${JSON.stringify(entries.slice(-AUDIT_MAX), null, 2)}\n`, 'utf8');
}

/**
 * @param {object} entry
 */
export function appendLanguageAudit(entry) {
  const record = {
    id: entry.id ?? `lang-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceIntent: entry.sourceIntent ?? 'language_fix_apply',
    proposedAction: entry.proposedAction ?? 'apply_language_fix',
    confirmationState: entry.confirmationState ?? 'confirmed',
    executedBy: entry.executedBy ?? null,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    fixId: entry.fixId ?? null,
    key: entry.key ?? null,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    backupPath: entry.backupPath ?? null,
    success: Boolean(entry.success),
    reason: entry.reason ?? null,
    rolledBack: Boolean(entry.rolledBack),
    testOutput: entry.testOutput ?? null,
  };

  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

export function getLanguageAuditHistory(limit = 50) {
  const all = readAll();
  return all.slice(-limit).reverse();
}

export function findAuditEntry(id) {
  return readAll().find((e) => e.id === id) ?? null;
}

export function clearLanguageAuditForTests() {
  if (fs.existsSync(AUDIT_FILE)) fs.unlinkSync(AUDIT_FILE);
}

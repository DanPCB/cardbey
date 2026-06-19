/**
 * Governed apply for Vietnamese i18n fixes — backup, atomic write, test gate, rollback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getDashboardPackageRoot } from '../../lib/intake/i18nMaintenanceTools.js';
import { appendLanguageAudit, getLanguageAuditHistory } from './languageExecutionAudit.js';
import { loadI18nCatalog, mergeNamespaces } from './languageI18nReader.js';
import { hasMixedLanguage, isValidVietnamese } from './languageValidator.js';

function escapeI18nString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatKey(key) {
  return /^\d/.test(key) || /[^a-zA-Z0-9_]/.test(key) ? `"${key}"` : key;
}

function findBlockEnd(lines, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth <= 0 && i > openIdx) return i;
  }
  return openIdx + 1;
}

function indentForDepth(depth) {
  return ' '.repeat(6 + depth * 2);
}

function findLocaleRange(lines, locale) {
  const localeRe = new RegExp(`^  ${locale}:\\s*\\{`);
  const localeIdx = lines.findIndex((l) => localeRe.test(l));
  if (localeIdx === -1) return null;
  const localeEnd = findBlockEnd(lines, localeIdx);
  return { localeIdx, localeEnd };
}

function findNamespaceRange(lines, localeRange, namespace) {
  const nsRe = new RegExp(`^    ${namespace}:\\s*\\{`);
  const nsIdx = lines.findIndex(
    (l, i) => i > localeRange.localeIdx && i < localeRange.localeEnd && nsRe.test(l),
  );
  if (nsIdx === -1) return null;
  const nsEnd = findBlockEnd(lines, nsIdx);
  return { nsIdx, nsEnd };
}

function findChildBlock(lines, parentStart, parentEnd, key, depth) {
  const indent = indentForDepth(depth);
  const re = new RegExp(`^${indent}${formatKey(key)}:\\s*\\{`);
  const idx = lines.findIndex((l, i) => i > parentStart && i < parentEnd && re.test(l));
  return idx === -1 ? -1 : idx;
}

export function parseFullKey(fullKey) {
  const raw = String(fullKey ?? '').trim();
  if (!raw) throw new Error('Key is required');
  const parts = raw.split('.');
  if (parts[0] === 'translation' || parts[0] === 'dashboard') {
    return { namespace: parts[0], keyPath: parts.slice(1).join('.') };
  }
  return { namespace: 'translation', keyPath: raw };
}

/**
 * Update a vi leaf string in parsed i18n.js lines (in-memory).
 * @param {string[]} lines
 * @param {string} fullKey e.g. translation.nav.dashboard
 * @param {string} newValue
 */
export function updateViTranslationInLines(lines, fullKey, newValue) {
  const { namespace, keyPath } = parseFullKey(fullKey);
  if (!keyPath) throw new Error(`Invalid key: ${fullKey}`);

  const viRange = findLocaleRange(lines, 'vi');
  if (!viRange) throw new Error('vi locale block not found');

  const nsRange = findNamespaceRange(lines, viRange, namespace);
  if (!nsRange) throw new Error(`Namespace not found in vi: ${namespace}`);

  const parts = keyPath.split('.');
  const leaf = parts[parts.length - 1];
  let parentStart = nsRange.nsIdx;
  let parentEnd = nsRange.nsEnd;

  for (let d = 0; d < parts.length - 1; d += 1) {
    const blockIdx = findChildBlock(lines, parentStart, parentEnd, parts[d], d);
    if (blockIdx === -1) {
      throw new Error(`Key path not found: ${fullKey}`);
    }
    parentStart = blockIdx;
    parentEnd = findBlockEnd(lines, blockIdx);
  }

  const leafDepth = parts.length - 1;
  const indent = indentForDepth(leafDepth);
  const leafRe = new RegExp(
    `^(${indent.replace(/ /g, ' ')})${formatKey(leaf)}:\\s*"((?:\\\\.|[^"\\\\])*)"(,?\\s*)$`,
  );

  for (let i = parentStart + 1; i <= parentEnd; i += 1) {
    const line = lines[i];
    const m = leafRe.exec(line);
    if (!m) continue;
    lines[i] = `${indent}${formatKey(leaf)}: "${escapeI18nString(newValue)}"${m[3] ?? ','}`;
    return { updated: true, line: i + 1, previousValue: m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\') };
  }

  throw new Error(`Leaf key not found: ${fullKey}`);
}

function resolvePaths(opts = {}) {
  const dashboardRoot = opts.dashboardRoot ?? getDashboardPackageRoot();
  const i18nPath = opts.i18nPath ?? path.join(dashboardRoot, 'src/i18n.js');
  const backupDir = opts.backupDir ?? path.join(dashboardRoot, '.language-agent/backups');
  return { dashboardRoot, i18nPath, backupDir };
}

function runI18nContractTests(dashboardRoot) {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'vitest', 'run', 'src/test/i18nContract.test.ts'],
      {
        cwd: dashboardRoot,
        env: { ...process.env, CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      resolve({ passed: false, stdout, stderr, errors: [err.message] });
    });
    child.on('close', (code) => {
      resolve({
        passed: code === 0,
        stdout,
        stderr,
        errors: code === 0 ? [] : [stderr || stdout || `vitest exited ${code}`],
      });
    });
  });
}

export class LanguageApply {
  constructor() {
    /** @type {string | null} */
    this.lastBackupPath = null;
  }

  resolvePaths(opts) {
    return resolvePaths(opts);
  }

  async createBackup(opts = {}) {
    const { i18nPath, backupDir } = resolvePaths(opts);
    if (!fs.existsSync(i18nPath)) {
      throw new Error(`i18n file not found: ${i18nPath}`);
    }
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = Date.now();
    const backupPath = path.join(backupDir, `i18n.js.${timestamp}.bak`);
    fs.copyFileSync(i18nPath, backupPath);
    this.lastBackupPath = backupPath;
    console.log('[LanguageApply] Backup created:', backupPath);
    return backupPath;
  }

  async restoreBackup(backupPath, opts = {}) {
    const { i18nPath, backupDir } = resolvePaths(opts);
    if (!backupPath) {
      console.warn('[LanguageApply] No backup path provided');
      return { restored: false };
    }

    const resolvedBackup = path.resolve(backupPath);
    const resolvedDir = path.resolve(backupDir);
    if (!resolvedBackup.startsWith(resolvedDir)) {
      throw new Error('Invalid backup path');
    }
    if (!fs.existsSync(resolvedBackup)) {
      console.warn('[LanguageApply] No backup found to restore');
      return { restored: false };
    }

    fs.copyFileSync(resolvedBackup, i18nPath);
    console.log('[LanguageApply] Backup restored:', resolvedBackup);
    return { restored: true, backupPath: resolvedBackup };
  }

  /**
   * @param {object} fix
   * @param {string} approvedBy
   * @param {object} [opts]
   */
  async applyFix(fix, approvedBy, opts = {}) {
    if (!fix?.approved) {
      throw new Error('Fix must be approved before applying');
    }
    if (fix.applied) {
      throw new Error('Fix already applied');
    }
    if (!fix.key || !fix.fixed) {
      throw new Error('Fix must include key and fixed value');
    }

    const paths = resolvePaths(opts);
    const { i18nPath, dashboardRoot } = paths;
    const tmpPath = `${i18nPath}.language-agent.tmp`;

    console.log('[LanguageApply] Applying fix for key:', fix.key);

    const catalogBefore = loadI18nCatalog({ i18nPath });
    const viBefore = mergeNamespaces(catalogBefore, 'vi');
    const previousValue = viBefore[fix.key] ?? fix.current ?? null;
    const enReference = fix.english ?? mergeNamespaces(catalogBefore, 'en')[fix.key] ?? '';

    if (!isValidVietnamese(fix.fixed, enReference)) {
      return {
        success: false,
        reason: 'validation_failed',
        errors: ['Fixed value fails Vietnamese quality check (untranslated or invalid).'],
        rolledBack: false,
      };
    }
    if (hasMixedLanguage(fix.fixed)) {
      return {
        success: false,
        reason: 'validation_failed',
        errors: ['Fixed value contains mixed English/Vietnamese.'],
        rolledBack: false,
      };
    }

    const backupPath = await this.createBackup(opts);

    try {
      const content = fs.readFileSync(i18nPath, 'utf8');
      const lines = content.split('\n');
      updateViTranslationInLines(lines, fix.key, fix.fixed);

      fs.writeFileSync(tmpPath, lines.join('\n'), 'utf8');
      fs.renameSync(tmpPath, i18nPath);

      const testResult = await runI18nContractTests(dashboardRoot);
      if (!testResult.passed) {
        console.log('[LanguageApply] Tests failed — rolling back');
        await this.restoreBackup(backupPath, opts);
        const audit = appendLanguageAudit({
          sourceIntent: `Apply language fix for ${fix.key}`,
          proposedAction: 'apply_language_fix',
          confirmationState: 'confirmed',
          executedBy: approvedBy,
          fixId: fix.id,
          key: fix.key,
          previousValue,
          newValue: fix.fixed,
          backupPath,
          success: false,
          reason: 'tests_failed',
          rolledBack: true,
          testOutput: testResult.errors?.join('\n') ?? testResult.stderr,
        });
        return {
          success: false,
          reason: 'tests_failed',
          errors: testResult.errors,
          auditId: audit.id,
          rolledBack: true,
        };
      }

      const audit = appendLanguageAudit({
        sourceIntent: `Apply language fix for ${fix.key}`,
        proposedAction: 'apply_language_fix',
        confirmationState: 'confirmed',
        executedBy: approvedBy,
        fixId: fix.id,
        key: fix.key,
        previousValue,
        newValue: fix.fixed,
        backupPath,
        success: true,
        rolledBack: false,
      });

      return { success: true, auditId: audit.id, backupPath };
    } catch (error) {
      console.error('[LanguageApply] Apply failed:', error);
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      await this.restoreBackup(backupPath, opts);
      const audit = appendLanguageAudit({
        sourceIntent: `Apply language fix for ${fix.key}`,
        proposedAction: 'apply_language_fix',
        confirmationState: 'confirmed',
        executedBy: approvedBy,
        fixId: fix.id,
        key: fix.key,
        previousValue,
        newValue: fix.fixed,
        backupPath,
        success: false,
        reason: error?.message ?? 'apply_failed',
        rolledBack: true,
      });
      return {
        success: false,
        reason: error?.message ?? 'apply_failed',
        auditId: audit.id,
        rolledBack: true,
      };
    }
  }

  getHistory(limit = 50) {
    return getLanguageAuditHistory(limit);
  }

  async rollbackTo(backupPath, executedBy, opts = {}) {
    const restored = await this.restoreBackup(backupPath, opts);
    if (!restored.restored) {
      throw new Error(`Backup not found: ${backupPath}`);
    }
    appendLanguageAudit({
      sourceIntent: `Rollback i18n to backup ${path.basename(backupPath)}`,
      proposedAction: 'rollback_language_fix',
      confirmationState: 'confirmed',
      executedBy,
      backupPath,
      success: true,
      rolledBack: true,
    });
    return { success: true, backupPath };
  }
}

export default new LanguageApply();

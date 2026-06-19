import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseFullKey,
  updateViTranslationInLines,
  LanguageApply,
} from '../languageApply.js';
import { clearLanguageAuditForTests } from '../languageExecutionAudit.js';

const FIXTURE = `
const resources = {
  en: {
    translation: {
      nav: {
        dashboard: "Live Performance",
      },
    },
    dashboard: {},
  },
  vi: {
    translation: {
      nav: {
        dashboard: "Dashboard",
      },
    },
    dashboard: {},
  },
};
`.trim();

describe('languageApply', () => {
  beforeEach(() => {
    clearLanguageAuditForTests();
  });

  describe('parseFullKey', () => {
    it('splits namespace prefix from key path', () => {
      expect(parseFullKey('translation.nav.dashboard')).toEqual({
        namespace: 'translation',
        keyPath: 'nav.dashboard',
      });
    });

    it('defaults to translation namespace when unprefixed', () => {
      expect(parseFullKey('nav.dashboard')).toEqual({
        namespace: 'translation',
        keyPath: 'nav.dashboard',
      });
    });
  });

  describe('updateViTranslationInLines', () => {
    it('updates vi leaf string in translation namespace', () => {
      const lines = FIXTURE.split('\n');
      const result = updateViTranslationInLines(
        lines,
        'translation.nav.dashboard',
        'Bảng điều khiển',
      );
      expect(result.updated).toBe(true);
      expect(result.previousValue).toBe('Dashboard');
      expect(lines.join('\n')).toContain('dashboard: "Bảng điều khiển"');
    });

    it('throws when key path is missing', () => {
      const lines = FIXTURE.split('\n');
      expect(() =>
        updateViTranslationInLines(lines, 'translation.missing.key', 'X'),
      ).toThrow(/not found/i);
    });
  });

  describe('backup and restore', () => {
    it('restores i18n.js from backup directory only', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-apply-'));
      const i18nPath = path.join(tmpDir, 'i18n.js');
      const backupDir = path.join(tmpDir, 'backups');
      fs.writeFileSync(i18nPath, FIXTURE, 'utf8');

      const apply = new LanguageApply();
      const backupPath = await apply.createBackup({ i18nPath, backupDir });

      fs.writeFileSync(i18nPath, 'mutated', 'utf8');
      await apply.restoreBackup(backupPath, { i18nPath, backupDir });

      expect(fs.readFileSync(i18nPath, 'utf8')).toBe(FIXTURE);
    });

    it('rejects backup paths outside backup directory', async () => {
      const apply = new LanguageApply();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-apply-'));
      const i18nPath = path.join(tmpDir, 'i18n.js');
      const backupDir = path.join(tmpDir, 'backups');
      const outsideBackup = path.join(tmpDir, 'outside.bak');
      fs.writeFileSync(i18nPath, FIXTURE, 'utf8');
      fs.writeFileSync(outsideBackup, FIXTURE, 'utf8');

      await expect(
        apply.restoreBackup(outsideBackup, { i18nPath, backupDir }),
      ).rejects.toThrow(/Invalid backup path/i);
    });
  });
});

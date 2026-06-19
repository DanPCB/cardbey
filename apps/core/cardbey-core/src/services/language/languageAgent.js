/**
 * Language Agent — Phase 1 preview-only orchestrator (no writes, no auto-apply).
 */
import fs from 'node:fs';
import path from 'node:path';
import groqAdapter from '../../lib/llm/groqAdapter.js';
import { detectI18nGaps, getDashboardPackageRoot } from '../../lib/intake/i18nMaintenanceTools.js';
import {
  validateKeyParity,
  validateVietnameseStrings,
} from './languageValidator.js';
import { listAllKeys, loadI18nCatalog } from './languageI18nReader.js';

const DEFAULT_THRESHOLD = Number(process.env.LANG_AUTO_FIX_THRESHOLD || 0.9);
const AUTO_FIX_ENABLED = String(process.env.LANG_AUTO_FIX || 'false').toLowerCase() === 'true';

function loadGlossary() {
  try {
    const root = getDashboardPackageRoot();
    const glossaryPath = path.join(root, 'scripts/i18n-glossary.json');
    if (!fs.existsSync(glossaryPath)) return {};
    return JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
  } catch {
    return {};
  }
}

function glossarySuggest(english, glossary) {
  let out = english;
  for (const [term, entry] of Object.entries(glossary)) {
    if (!entry?.vi) continue;
    const re = new RegExp(`\\b${term}\\b`, 'gi');
    if (re.test(out)) out = out.replace(re, entry.vi);
  }
  if (out === english) return null;
  return out;
}

function parsePreviewJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export class LanguageAgent {
  constructor() {
    this.isRunning = false;
    /** @type {object | null} */
    this.scanResults = null;
    /** @type {Array<object>} */
    this.previewResults = [];
  }

  /**
   * Read-only scan across i18n quality + hardcoded gaps.
   * @param {object} [options]
   */
  async scan(options = {}) {
    if (this.isRunning) {
      throw new Error('Scan already in progress');
    }

    console.log('[LanguageAgent] Starting read-only scan…');
    this.isRunning = true;

    try {
      const [vietnamese, gapsResult] = await Promise.all([
        validateVietnameseStrings(options),
        detectI18nGaps().catch((err) => ({
          status: 'failed',
          count: 0,
          fileCount: 0,
          items: [],
          error: err?.message ?? String(err),
        })),
      ]);

      const catalog = loadI18nCatalog(options);
      const keys = listAllKeys(catalog);
      const parity = validateKeyParity(keys.en, keys.vi);

      const hardcoded = Array.isArray(gapsResult.items) ? gapsResult.items : [];
      const validationErrors = vietnamese.errors ?? [];

      this.scanResults = {
        timestamp: new Date().toISOString(),
        mode: 'read_only',
        autoFixEnabled: AUTO_FIX_ENABLED,
        threshold: DEFAULT_THRESHOLD,
        validation: {
          pass: vietnamese.pass,
          errors: validationErrors,
        },
        parity,
        hardcoded: {
          count: hardcoded.length,
          fileCount: gapsResult.fileCount ?? 0,
          items: hardcoded.slice(0, 200),
          truncated: hardcoded.length > 200,
          detectExitCode: gapsResult.exitCode ?? null,
        },
        summary: {
          totalIssues:
            validationErrors.length +
            hardcoded.length +
            (parity.missingInVi?.length ?? 0) +
            (parity.extraInVi?.length ?? 0),
          invalidVietnamese: validationErrors.filter((e) => e.issue === 'invalid_vietnamese')
            .length,
          mixedLanguage: validationErrors.filter((e) => e.issue === 'mixed_language').length,
          missingViKeys: parity.missingInVi?.length ?? 0,
          hardcodedStrings: hardcoded.length,
        },
        catalogPath: catalog.i18nPath,
      };

      return this.scanResults;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate a preview fix (never writes to disk).
   * @param {object} issue
   */
  async preview(issue = {}) {
    const key = issue.key ?? issue.suggestedKey ?? null;
    const enValue = issue.english ?? issue.enValue ?? issue.string ?? '';
    const viValue = issue.value ?? issue.text ?? '';

    console.log('[LanguageAgent] Preview for', key ?? issue.file ?? 'unknown');

    const glossary = loadGlossary();
    const glossaryFix = enValue ? glossarySuggest(enValue, glossary) : null;

    /** @type {{ fixed: string, confidence: number, explanation: string, source: string }} */
    let result = {
      fixed: glossaryFix ?? viValue,
      confidence: glossaryFix ? 0.75 : 0.4,
      explanation: glossaryFix
        ? 'Glossary-based suggestion (read-only preview).'
        : 'No glossary match; manual review recommended.',
      source: glossaryFix ? 'glossary' : 'rule',
    };

    if (process.env.GROQ_API_KEY) {
      try {
        const prompt = `Fix this Cardbey UI translation issue. Return JSON only: {"fixed":"...","confidence":0.0-1.0,"explanation":"..."}
Issue: ${issue.issue ?? 'translation'}
Key: ${key ?? 'n/a'}
English: ${enValue}
Current Vietnamese: ${viValue}`;

        const response = await groqAdapter.reason(
          { intent: { type: 'language_fix', prompt } },
          {},
        );
        const parsed = parsePreviewJson(response.reasoning);
        if (parsed?.fixed) {
          result = {
            fixed: String(parsed.fixed),
            confidence: Number(parsed.confidence) || 0.85,
            explanation: String(parsed.explanation || 'LLM suggestion (preview only).'),
            source: 'groq',
          };
        }
      } catch (err) {
        console.warn('[LanguageAgent] Groq preview failed:', err?.message ?? err);
        result.explanation = `${result.explanation} (LLM unavailable: ${err?.message ?? err})`;
      }
    }

    const previewRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      issue: issue.issue ?? 'translation',
      key,
      file: issue.file ?? null,
      line: issue.line ?? null,
      current: viValue,
      english: enValue,
      fixed: result.fixed,
      confidence: result.confidence,
      explanation: result.explanation,
      source: result.source,
      approved: false,
      applied: false,
    };

    this.previewResults.push(previewRecord);

    return { ...result, previewId: previewRecord.id };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastScan: this.scanResults?.timestamp ?? null,
      totalIssues: this.scanResults?.summary?.totalIssues ?? 0,
      previews: this.previewResults.length,
      autoFixEnabled: AUTO_FIX_ENABLED,
      threshold: DEFAULT_THRESHOLD,
      phase: 1,
      guarantees: {
        sourceMutation: false,
        autoApply: false,
      },
    };
  }

  getPreviews() {
    return [...this.previewResults];
  }

  clearPreviews() {
    this.previewResults = [];
    return { cleared: true };
  }
}

export default new LanguageAgent();

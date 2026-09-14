/**
 * Shared mission-term extraction for repository reasoning.
 *
 * Distinctive terms drive filename/keyword matches and change-target promotion.
 * Generic terms and negative-constraint words are kept out of the distinctive
 * set so ordinary request prose and "must not change" constraints do not become
 * positive modification signals.
 */

import type { DevelopmentMission } from '../../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../../types/DevelopmentEvidence.js';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
  'their', 'show', 'approximately', 'first', 'about', 'beneath', 'under', 'over', 'its', 'the',
]);

const GENERIC_TERMS = new Set([
  'mission', 'development', 'page', 'runtime', 'list', 'app', 'console', 'dashboard', 'component',
  'route', 'feature', 'fix', 'button', 'card', 'show', 'add', 'remove', 'update', 'create',
  'delete', 'edit', 'view', 'detail', 'item', 'new', 'all', 'any', 'some', 'get', 'set', 'use',
  'with', 'from', 'for', 'and', 'or', 'but', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'of',
  'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'need', 'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'preview', 'description',
  // Ordinary request prose and negative-constraint words must not become
  // strong positive modification signals.
  'user', 'small', 'above', 'lets', 'values', 'not', 'change', 'existing', 'without', 'alter',
  'modify', 'never', 'only', 'except', 'touch', 'affect', 'impact', 'behavior', 'behaviour',
  // TypeScript/JS keywords and common method names that appear in many files
  // must not be treated as distinctive modification signals.
  'type', 'filter', 'map', 'return', 'async', 'await', 'const', 'function', 'export', 'import',
]);

function missionText(mission: DevelopmentMission): string {
  return [
    mission.title,
    mission.request,
    mission.expectedOutcome,
    mission.observedBehaviour ?? '',
  ].join(' ');
}

export function extractConstraintPhrases(mission: DevelopmentMission): string[] {
  const text = missionText(mission);
  const phrases: string[] = [];

  // Capture explicit modification constraints: "must not change X",
  // "do not modify X", "should not alter X", "use existing X", etc.
  const negativePattern = /(?:must\s+not|do\s+not|should\s+not|must\s+never|without|except|never)\s+(?:change|modify|alter|update|touch)\s+([^,.;]{3,120})/gi;
  let m: RegExpExecArray | null;
  while ((m = negativePattern.exec(text)) !== null) {
    const normalized = normalizeConstraintPhrase(m[1]!);
    if (normalized) phrases.push(normalized);
  }

  const existingPattern = /(?:use\s+)?existing\s+([^,.;]{3,120})/gi;
  while ((m = existingPattern.exec(text)) !== null) {
    const normalized = normalizeConstraintPhrase(m[1]!);
    if (normalized) phrases.push(normalized);
  }

  return Array.from(new Set(phrases));
}

function normalizeConstraintPhrase(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !GENERIC_TERMS.has(w))
    .join(' ');
  return normalized;
}

export function extractDistinctiveTerms(
  mission: DevelopmentMission,
  evidence?: DevelopmentEvidence,
): string[] {
  const text = [
    mission.title,
    mission.request,
    mission.expectedOutcome,
    mission.observedBehaviour ?? '',
    ...(evidence?.affectedRoutes ?? []),
  ].join(' ');

  const constraintPhrases = extractConstraintPhrases(mission);
  const constraintWords = new Set(constraintPhrases.flatMap((p) => p.split(/\s+/)));

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\/\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !GENERIC_TERMS.has(w) && !constraintWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

export function extractGenericTerms(
  mission: DevelopmentMission,
  evidence?: DevelopmentEvidence,
): string[] {
  const text = [
    mission.title,
    mission.request,
    mission.expectedOutcome,
    mission.observedBehaviour ?? '',
    ...(evidence?.affectedRoutes ?? []),
  ].join(' ');

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\/\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && GENERIC_TERMS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

export function isGenericTerm(word: string): boolean {
  return GENERIC_TERMS.has(word.toLowerCase());
}

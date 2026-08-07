/**
 * ConfidenceEngine — heuristic confidence for AI translations (no I/O).
 */

import { matchGlossaryInText } from '../registries/index.js';

/**
 * @param {object} input
 * @param {string} input.sourceText
 * @param {string} input.translatedText
 * @param {string} input.sourceLanguage
 * @param {string} input.targetLanguage
 * @returns {'high'|'medium'|'low'}
 */
export function scoreTranslationConfidence(input) {
  const source = String(input.sourceText ?? '').trim();
  const translated = String(input.translatedText ?? '').trim();
  const sourceLang = String(input.sourceLanguage ?? '');
  const targetLang = String(input.targetLanguage ?? '');

  if (!translated) return 'low';
  if (!source) return 'low';

  // Same text across different languages → likely untranslated
  if (sourceLang && targetLang && sourceLang !== targetLang && source === translated) {
    return 'low';
  }

  const ratio = translated.length / Math.max(source.length, 1);
  if (ratio < 0.2 || ratio > 5) return 'low';

  const glossaryHits = matchGlossaryInText(source, targetLang);
  for (const hit of glossaryHits) {
    if (hit.resolution.action === 'keep' || hit.resolution.action === 'prefer') {
      const expected = hit.resolution.text;
      if (expected && !translated.toLowerCase().includes(expected.toLowerCase())) {
        // Preferred/never-translate term missing from output
        return 'low';
      }
    }
  }

  if (ratio >= 0.5 && ratio <= 2.5 && glossaryHits.every((h) => {
    if (h.resolution.action === 'translate') return true;
    return translated.toLowerCase().includes(h.resolution.text.toLowerCase());
  })) {
    return 'high';
  }

  return 'medium';
}

/**
 * Aggregate field confidences → overall.
 * @param {Array<'high'|'medium'|'low'>} scores
 * @returns {'high'|'medium'|'low'}
 */
export function aggregateConfidence(scores) {
  if (!scores || scores.length === 0) return 'medium';
  if (scores.includes('low')) return 'low';
  if (scores.every((s) => s === 'high')) return 'high';
  return 'medium';
}

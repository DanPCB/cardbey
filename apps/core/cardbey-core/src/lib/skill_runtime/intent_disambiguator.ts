/**
 * IntentDisambiguator — resolves *what the user wants* rather than which
 * keyword happened to match.
 *
 * Each registered `IntentPattern` returns a confidence score in [0, 1]. The
 * disambiguator keeps the highest-scoring pattern that clears its
 * `requiredConfidence`, breaking ties by `priority` (higher wins). This is the
 * mechanism that lets "setup a loyalty campaign" resolve to loyalty rather
 * than the generic promotion pipeline.
 */

import { createLogger } from '../logger.js';
import {
  DEFAULT_REQUIRED_CONFIDENCE,
  type IntentPattern,
  type SkillContext,
} from './types.js';

const log = createLogger('IntentDisambiguator');

export interface ResolvedIntent {
  pattern: IntentPattern;
  intent: string;
  confidence: number;
}

/** A scored candidate, exposed for diagnostics/telemetry. */
export interface IntentScore {
  intent: string;
  confidence: number;
  priority: number;
  requiredConfidence: number;
  eligible: boolean;
}

export class IntentDisambiguator {
  private readonly patterns: IntentPattern[] = [];

  register(pattern: IntentPattern): void {
    if (!pattern || typeof pattern.intent !== 'string' || !pattern.intent.trim()) {
      throw new Error('IntentPattern requires a non-empty intent');
    }
    if (typeof pattern.matches !== 'function') {
      throw new Error(`IntentPattern "${pattern.intent}" requires a matches() function`);
    }
    if (this.patterns.some((p) => p.intent === pattern.intent)) {
      throw new Error(`Duplicate intent pattern: "${pattern.intent}"`);
    }
    this.patterns.push(pattern);
  }

  /** Number of registered patterns (useful for tests/diagnostics). */
  size(): number {
    return this.patterns.length;
  }

  /**
   * Score every pattern against the context. Scores are clamped to [0, 1] and
   * a thrown matcher is treated as a 0 (it should never sink the whole
   * dispatch). Returned in registration order.
   */
  async score(context: SkillContext): Promise<IntentScore[]> {
    return Promise.all(
      this.patterns.map(async (pattern) => {
        const required = pattern.requiredConfidence ?? DEFAULT_REQUIRED_CONFIDENCE;
        let confidence = 0;
        try {
          const raw = await pattern.matches(context);
          confidence = clamp01(typeof raw === 'number' && Number.isFinite(raw) ? raw : 0);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error('pattern matcher threw', { intent: pattern.intent, error: message });
        }
        return {
          intent: pattern.intent,
          confidence,
          priority: pattern.priority,
          requiredConfidence: required,
          eligible: confidence >= required,
        };
      })
    );
  }

  /**
   * Resolve the best intent for a context, or `null` if nothing clears its
   * required confidence. Ties on confidence are broken by `priority`.
   */
  async resolve(context: SkillContext): Promise<ResolvedIntent | null> {
    if (this.patterns.length === 0) return null;

    const scores = await this.score(context);
    const eligible = scores.filter((s) => s.eligible);

    if (eligible.length === 0) {
      log.debug('no eligible intent', { query: context.query, scores });
      return null;
    }

    eligible.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.priority - a.priority;
    });

    const winner = eligible[0];
    const pattern = this.patterns.find((p) => p.intent === winner.intent)!;
    log.info('resolved intent', {
      intent: winner.intent,
      confidence: Number(winner.confidence.toFixed(3)),
      priority: winner.priority,
    });

    return { pattern, intent: winner.intent, confidence: winner.confidence };
  }
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

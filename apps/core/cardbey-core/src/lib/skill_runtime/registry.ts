/**
 * SkillRegistry — intent-keyed registry that dispatches a context to the
 * correct skill via the disambiguator.
 *
 * This is the drop-in replacement for keyword-based matching: register each
 * skill with the patterns that describe *when* it should fire, then call
 * `dispatch(context)` to get back a ready-to-run `SkillRuntime` (or `null`).
 */

import { createLogger } from '../logger.js';
import { IntentDisambiguator } from './intent_disambiguator.js';
import { SkillRuntime } from './skill.js';
import type { IntentPattern, SkillContext } from './types.js';

const log = createLogger('SkillRegistry');

export interface RegisteredSkill {
  intent: string;
  factory: (context: SkillContext) => SkillRuntime;
  patterns: IntentPattern[];
}

export class SkillRegistry {
  private readonly skills: Map<string, RegisteredSkill> = new Map();
  private readonly disambiguator: IntentDisambiguator;

  constructor(disambiguator: IntentDisambiguator = new IntentDisambiguator()) {
    this.disambiguator = disambiguator;
  }

  /**
   * Register a skill and its disambiguation patterns. Patterns may reference
   * the skill's own intent or contribute cross-cutting demotions (e.g. a
   * promotion pattern that demotes loyalty phrasing).
   */
  register(skill: RegisteredSkill): void {
    if (!skill || typeof skill.intent !== 'string' || !skill.intent.trim()) {
      throw new Error('RegisteredSkill requires a non-empty intent');
    }
    if (typeof skill.factory !== 'function') {
      throw new Error(`Skill "${skill.intent}" requires a factory function`);
    }
    if (this.skills.has(skill.intent)) {
      throw new Error(`Duplicate skill intent: "${skill.intent}"`);
    }

    this.skills.set(skill.intent, skill);
    for (const pattern of skill.patterns ?? []) {
      this.disambiguator.register(pattern);
    }
    log.info('registered skill', {
      intent: skill.intent,
      patterns: (skill.patterns ?? []).length,
    });
  }

  has(intent: string): boolean {
    return this.skills.has(intent);
  }

  get(intent: string): RegisteredSkill | undefined {
    return this.skills.get(intent);
  }

  /**
   * Resolve the best intent for the context and build its skill. Returns
   * `null` when no intent clears its required confidence, or when the resolved
   * intent has no registered skill (pattern-only contributor).
   */
  async dispatch(context: SkillContext): Promise<SkillRuntime | null> {
    const matched = await this.disambiguator.resolve(context);
    if (!matched) {
      log.debug('dispatch: no intent matched', { query: context.query });
      return null;
    }

    const skill = this.skills.get(matched.intent);
    if (!skill) {
      log.warn('dispatch: matched intent has no skill', { intent: matched.intent });
      return null;
    }

    log.info('dispatch: building skill', {
      intent: matched.intent,
      confidence: Number(matched.confidence.toFixed(3)),
    });
    return skill.factory(context);
  }
}

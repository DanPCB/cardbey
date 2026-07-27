/**
 * Isolated skill test harness — mock tool dispatch without live side effects.
 */

import { CompositionEngine } from './compositionEngine.js';
import composableSkillRegistry from './skillRegistry.js';

export class SkillTestHarness {
  /**
   * @param {import('./skillRegistry.js').SkillRegistry} [registry]
   */
  constructor(registry = composableSkillRegistry) {
    this.registry = registry;
    /** @type {Map<string, (input: object, context: object) => Promise<object>>} */
    this.toolMocks = new Map();
    this.engine = new CompositionEngine({
      registry: this.registry,
      toolDispatcher: (tool, input, context) => this.dispatchMock(tool, input, context),
    });
  }

  /**
   * @param {string} action
   * @param {(input: object, context: object) => Promise<object> | object} handler
   */
  mockTool(action, handler) {
    this.toolMocks.set(String(action).trim(), handler);
    return this;
  }

  /**
   * @param {string} action
   * @param {object} input
   * @param {object} context
   */
  async dispatchMock(action, input, context) {
    const key = String(action ?? '').trim();
    const handler = this.toolMocks.get(key);
    if (!handler) {
      return { ok: true, output: { mocked: true, action: key, input } };
    }
    return handler(input, context);
  }

  /**
   * @param {string} skillId
   * @param {object} [context]
   * @param {{ version?: string }} [options]
   */
  async run(skillId, context = {}, options = {}) {
    const id = String(skillId ?? '').trim();
    const skill = options.version
      ? this.registry.getVersion(id, options.version)
      : this.registry.get(id);
    if (!skill) {
      throw new Error(`Skill not found for harness: ${id}`);
    }

    return this.engine.executeSkill({ id, version: skill.version }, context);
  }

  /**
   * @param {Array<object>} skills
   * @param {object} context
   */
  async runSequence(skills, context = {}) {
    return this.engine.sequence(skills, context);
  }

  clearMocks() {
    this.toolMocks.clear();
  }
}

export default SkillTestHarness;

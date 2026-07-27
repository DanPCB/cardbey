/**
 * Singleton registry for skill definitions.
 */

/** @typedef {import('./types.js').SkillDefinition} SkillDefinition */

export class SkillRegistry {
  constructor() {
    /** @type {Map<string, SkillDefinition>} */
    this.skills = new Map();
    /** @type {string[]} */
    this.registrationOrder = [];
  }

  /**
   * @param {SkillDefinition} skillDefinition
   */
  register(skillDefinition) {
    const name = String(skillDefinition?.name ?? '').trim();
    if (!name) {
      throw new Error('SkillDefinition must have a non-empty name');
    }
    if (this.skills.has(name)) {
      throw new Error(`Duplicate skill registration: ${name}`);
    }
    this.skills.set(name, skillDefinition);
    this.registrationOrder.push(name);
    console.log(`[SkillRegistry] Registered skill: ${name}`);
  }

  /**
   * @param {string} name
   * @returns {SkillDefinition | null}
   */
  get(name) {
    const key = String(name ?? '').trim();
    return this.skills.get(key) ?? null;
  }

  /**
   * @param {string} intentLabel
   * @returns {SkillDefinition | null}
   */
  findByTrigger(intentLabel) {
    const label = String(intentLabel ?? '').trim();
    if (!label) return null;

    for (const name of this.registrationOrder) {
      const skill = this.skills.get(name);
      if (!skill?.triggers?.length) continue;
      for (const trigger of skill.triggers) {
        const t = String(trigger ?? '').trim();
        if (!t) continue;
        if (label === t || label.startsWith(t)) {
          return skill;
        }
      }
    }
    return null;
  }

  /**
   * @returns {SkillDefinition[]}
   */
  list() {
    return this.registrationOrder.map((name) => this.skills.get(name)).filter(Boolean);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.skills.has(String(name ?? '').trim());
  }
}

export const skillRegistry = new SkillRegistry();

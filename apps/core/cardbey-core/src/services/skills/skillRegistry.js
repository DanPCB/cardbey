/**
 * Composable Skill Registry — discovery, semantic versioning, and metadata.
 * Distinct from lib/skills/SkillRegistry.js (legacy performer skills).
 */

export class SkillRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.skills = new Map();
    /** @type {Map<string, Array<{ version: string; registeredAt: Date; snapshot: object }>>} */
    this.versions = new Map();
  }

  /**
   * @param {object} skill
   */
  register(skill) {
    const id = String(skill?.id ?? '').trim();
    const version = String(skill?.version ?? '').trim();
    if (!id) throw new Error('Skill ID is required');
    if (!version) throw new Error('Skill version is required');
    if (!this.isValidSemver(version)) {
      throw new Error(`Invalid semantic version: ${version}`);
    }

    const now = new Date();
    const entry = { ...skill, id, version };

    if (this.skills.has(id)) {
      const existing = this.skills.get(id);
      if (this.isVersionGreater(version, existing.version)) {
        console.log(`[ComposableSkillRegistry] Upgrading ${id} from ${existing.version} to ${version}`);
        this.skills.set(id, { ...entry, upgradedAt: now });
      } else if (version === existing.version) {
        this.skills.set(id, { ...entry, registeredAt: existing.registeredAt ?? now });
      } else {
        throw new Error(`Skill ${id} version ${version} is older than ${existing.version}`);
      }
    } else {
      this.skills.set(id, { ...entry, registeredAt: now });
    }

    if (!this.versions.has(id)) {
      this.versions.set(id, []);
    }
    const history = this.versions.get(id);
    const exists = history.some((h) => h.version === version);
    if (!exists) {
      history.push({ version, registeredAt: now, snapshot: { ...entry } });
    }

    console.log(`[ComposableSkillRegistry] Registered ${id}@${version}`);
    return entry;
  }

  /**
   * @param {string} id
   */
  get(id) {
    return this.skills.get(String(id ?? '').trim()) ?? null;
  }

  /**
   * @param {string} id
   * @param {string} version
   */
  getVersion(id, version) {
    const key = String(id ?? '').trim();
    const ver = String(version ?? '').trim();
    const current = this.skills.get(key);
    if (!current) return null;
    if (current.version === ver) return current;

    const history = this.versions.get(key) ?? [];
    const row = history.find((h) => h.version === ver);
    if (!row) return null;
    return { ...row.snapshot, isHistorical: true };
  }

  /**
   * @param {object} [filter]
   */
  list(filter = {}) {
    let skills = Array.from(this.skills.values());

    if (filter.category) {
      skills = skills.filter((s) => s.category === filter.category);
    }
    if (filter.minVersion) {
      skills = skills.filter((s) => this.isVersionGreater(s.version, filter.minVersion));
    }
    if (Array.isArray(filter.tags) && filter.tags.length) {
      skills = skills.filter((s) => filter.tags.every((tag) => s.tags?.includes(tag)));
    }

    return skills.sort((a, b) => {
      if (a.id === b.id) return this.compareVersions(b.version, a.version);
      return String(a.id).localeCompare(String(b.id));
    });
  }

  /**
   * @param {string} capability
   */
  findByCapability(capability) {
    const cap = String(capability ?? '').trim().toLowerCase();
    if (!cap) return [];

    return this.list().filter((s) => {
      const caps = (s.capabilities ?? []).map((c) => String(c).toLowerCase());
      const outputs = (s.outputs ?? []).map((o) =>
        typeof o === 'string' ? o.toLowerCase() : String(o?.name ?? '').toLowerCase(),
      );
      return caps.includes(cap) || outputs.includes(cap) || s.id === cap;
    });
  }

  /**
   * @param {string} version
   */
  isValidSemver(version) {
    return /^\d+\.\d+\.\d+$/.test(String(version ?? '').trim());
  }

  /**
   * @param {string} v1
   * @param {string} v2
   */
  isVersionGreater(v1, v2) {
    return this.compareVersions(v1, v2) > 0;
  }

  /**
   * @param {string} v1
   * @param {string} v2
   * @returns {number}
   */
  compareVersions(v1, v2) {
    const parts1 = String(v1).split('.').map(Number);
    const parts2 = String(v2).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const a = parts1[i] ?? 0;
      const b = parts2[i] ?? 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  resetForTests() {
    this.skills.clear();
    this.versions.clear();
  }
}

const composableSkillRegistry = new SkillRegistry();
export default composableSkillRegistry;

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateNormalizedIntentV1,
  validateBuildStoreInputV1,
} from '../validateContractV1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, '..', '__fixtures__', 'golden');

function readGolden(name) {
  const p = path.join(GOLDEN_DIR, name);
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

describe('Phase 0 — CONTRACT_V1 golden fixtures', () => {
  it('normalizedIntent-create-store-text.json validates as NormalizedIntentV1', () => {
    const f = readGolden('normalizedIntent-create-store-text.json');
    const v = validateNormalizedIntentV1(f.normalizedIntent);
    expect(v.ok, v.ok ? '' : v.errors.join('; ')).toBe(true);
  });

  const buildStoreFixtures = [
    'buildStoreInput-intake-autosubmit.json',
    'buildStoreInput-mission-pipeline-run.json',
    'buildStoreInput-orchestra-start.json',
    'buildStoreInput-business-api.json',
    'buildStoreInput-operator-tool.json',
  ];

  for (const name of buildStoreFixtures) {
    it(`${name} validates as BuildStoreInputV1`, () => {
      const f = readGolden(name);
      const v = validateBuildStoreInputV1(f.buildStoreInput);
      expect(v.ok, v.ok ? '' : v.errors.join('; ')).toBe(true);
    });
  }

  /**
   * Cross-runway equivalence: same user story (Northside Coffee, Melbourne, cafe)
   * must converge to the same canonical business fields after Phase 1.
   */
  it('all BuildStoreInput goldens share the same core identity fields', () => {
    const cores = buildStoreFixtures.map((name) => {
      const f = readGolden(name);
      return f.buildStoreInput;
    });
    const first = cores[0];
    for (const c of cores) {
      expect(c.businessName).toBe(first.businessName);
      expect(c.location).toBe(first.location);
      expect(c.businessType).toBe(first.businessType);
      expect(c.intentMode).toBe(first.intentMode);
    }
  });
});

/**
 * Default validator rules (seeded, not auto-applied).
 * completeness: enabled true, BLOCK; others enabled false.
 */

import type { ValidatorRuleConfig } from './types.js';

export const DEFAULT_VALIDATOR_RULES: ValidatorRuleConfig[] = [
  {
    name: 'Required fields (completeness)',
    code: 'requiredFields',
    isEnabled: true,
    severity: 'BLOCK',
    configJson: {},
  },
  {
    name: 'Price sanity (category ladder)',
    code: 'priceSanity',
    isEnabled: false,
    severity: 'WARN',
    configJson: { byCategoryKey: {} },
  },
  {
    name: 'Image required (GRID display)',
    code: 'imageRequired',
    isEnabled: false,
    severity: 'WARN',
    configJson: { displayMode: 'GRID' },
  },
  {
    name: 'Business type coherence',
    code: 'businessTypeCoherence',
    isEnabled: false,
    severity: 'BLOCK',
    configJson: {},
  },
];

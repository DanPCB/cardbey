#!/usr/bin/env node
/**
 * Copy dashboard i18n.js (+ glossary) into core language-seed fallback.
 * Run after meaningful i18n catalog changes:
 *   node scripts/sync-language-seed.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = path.resolve(coreRoot, '../../..');
const dashboardRoot = path.join(monorepoRoot, 'apps/dashboard/cardbey-marketing-dashboard');
const seedRoot = path.join(coreRoot, 'data/language-seed');

const copies = [
  ['src/i18n.js', 'src/i18n.js'],
  ['scripts/i18n-glossary.json', 'scripts/i18n-glossary.json'],
];

for (const [fromRel, toRel] of copies) {
  const from = path.join(dashboardRoot, fromRel);
  const to = path.join(seedRoot, toRel);
  if (!fs.existsSync(from)) {
    console.error('[sync-language-seed] missing', from);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('[sync-language-seed] wrote', path.relative(coreRoot, to));
}

fs.writeFileSync(
  path.join(seedRoot, 'README.txt'),
  [
    'Language agent seed catalog (fallback when dashboard submodule is empty on Render).',
    'Refresh: node scripts/sync-language-seed.mjs',
    `source=${path.relative(monorepoRoot, dashboardRoot).replace(/\\/g, '/')}`,
    `syncedAt=${new Date().toISOString()}`,
    '',
  ].join('\n'),
  'utf8',
);

console.log('[sync-language-seed] done');

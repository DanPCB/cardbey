#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const tracked = new Set(
  execSync('git ls-tree -r HEAD --name-only src/', { encoding: 'utf8' }).trim().split('\n'),
);

const seeds = [
  'src/routes/performerRuntimeRoutes.js',
  'src/routes/stores.js',
  'src/routes/draftStore.js',
  'src/routes/performerIntakeV2Routes.js',
  'src/lib/runtime/performerRuntime/uiRuntimeActionService.js',
  'src/lib/factoryRuntime/factoryIntentRouter.js',
];

const queue = [...seeds];
const seen = new Set();
const missing = new Set();

function resolveImport(fromFile, spec) {
  const dir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(dir, spec));
  if (!resolved.endsWith('.js') && !resolved.endsWith('.ts')) {
    if (existsSync(`${resolved}.js`)) resolved += '.js';
    else if (existsSync(`${resolved}.ts`)) resolved += '.ts';
    else resolved += '.js';
  }
  return resolved.replace(/\\/g, '/');
}

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  const content = readFileSync(file, 'utf8');
  for (const m of content.matchAll(/from ['"](\.\.\/[^'"]+|\.\/[^'"]+)['"]/g)) {
    const rel = resolveImport(file, m[1]);
    if (rel.startsWith('node_modules/')) continue;
    if (!tracked.has(rel)) {
      if (existsSync(rel)) {
        missing.add(rel);
        queue.push(rel);
      } else {
        console.error('UNRESOLVED:', rel, 'from', file);
      }
    } else {
      queue.push(rel);
    }
  }
}

for (const key of [...missing].sort()) console.log(key);
console.error(`missing count: ${missing.size}, scanned: ${seen.size}`);

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = path.join(root, 'docs', 'db', 'MIGRATION_BASELINE_PLAN.md');
const repoPlan = path.join(root, '..', '..', '..', 'docs', 'db', 'MIGRATION_BASELINE_PLAN.md');
const p = fs.existsSync(plan) ? plan : repoPlan;
console.log(fs.readFileSync(p, 'utf8'));

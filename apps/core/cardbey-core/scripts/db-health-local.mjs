#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const port = process.env.PORT || '3001';
const base = process.env.API_BASE || `http://127.0.0.1:${port}`;
const url = `${base.replace(/\/$/, '')}/api/health/db`;

try {
  const res = await fetch(url);
  const body = await res.json();
  console.log('[db:health:local]', res.status, JSON.stringify(body, null, 2));
  process.exit(res.ok && body.ok ? 0 : 1);
} catch (e) {
  console.error('[db:health:local] Is Core running?', e?.message || e);
  console.error('Start: cd apps/core/cardbey-core && npm run dev');
  process.exit(1);
}

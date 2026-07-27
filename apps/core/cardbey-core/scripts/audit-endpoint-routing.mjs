#!/usr/bin/env node
/**
 * Scan route files and generate Endpoint Categorization Report.
 *
 * Usage: node scripts/audit-endpoint-routing.mjs [--write]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(__dirname, '..');
const routesDir = path.join(coreRoot, 'src', 'routes');
const serverPath = path.join(coreRoot, 'src', 'server.js');
const reportPath = path.resolve(coreRoot, '../../../docs/ENDPOINT_CATEGORIZATION_REPORT.md');

const { categorizeEndpoint, normalizePath } = await import(
  pathToFileURL(path.join(coreRoot, 'src/lib/routing/endpointRegistry.js')).href
);

const ROUTE_RE = /(?:router|app)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/gi;
const IMPORT_RE = /import\s+(\w+)\s+from\s+['"`](\.\/(?:routes|ai|realtime)\/[^'"`]+)['"`]/g;
const MOUNT_USE_RE = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)\s*\)/g;

/** @type {Map<string, string[]>} route file rel path -> mount prefixes */
const fileMountMap = new Map();

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(coreRoot, filePath).replace(/\\/g, '/');
  /** @type {Array<{ method: string, routePath: string, file: string }>} */
  const endpoints = [];

  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(content)) !== null) {
    endpoints.push({
      method: m[1].toUpperCase(),
      routePath: m[2],
      file: rel,
    });
  }

  return endpoints;
}

function walkRoutes(dir) {
  /** @type {Array<{ method: string, routePath: string, file: string }>} */
  const all = [];
  if (!fs.existsSync(dir)) return all;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('__') || entry.name.includes('.test.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      all.push(...walkRoutes(full));
    } else if (/\.(js|ts)$/.test(entry.name)) {
      all.push(...scanFile(full));
    }
  }
  return all;
}

function parseServerMounts() {
  const content = fs.readFileSync(serverPath, 'utf8');
  /** @type {Map<string, string>} */
  const importVarToFile = new Map();

  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const varName = m[1];
    const importPath = m[2].replace(/^\.\//, 'src/');
    importVarToFile.set(varName, importPath);
  }

  MOUNT_USE_RE.lastIndex = 0;
  while ((m = MOUNT_USE_RE.exec(content)) !== null) {
    const prefix = m[1];
    const varName = m[2];
    const file = importVarToFile.get(varName);
    if (!file) continue;
    if (!prefix.startsWith('/api') && prefix !== '/api') continue;

    const normalizedFile = file.replace(/\\/g, '/');
    const existing = fileMountMap.get(normalizedFile) ?? [];
    if (!existing.includes(prefix)) existing.push(prefix);
    fileMountMap.set(normalizedFile, existing);
  }
}

function resolveFullPath(routePath, file) {
  const normalizedFile = file.replace(/\\/g, '/');
  const mounts = fileMountMap.get(normalizedFile) ?? [];

  let suffix = routePath;
  if (!suffix.startsWith('/')) suffix = `/${suffix}`;

  if (suffix.startsWith('/api/')) {
    return normalizePath(suffix);
  }

  if (mounts.length === 1) {
    const base = mounts[0] === '/api' ? '/api' : mounts[0].replace(/\/$/, '');
    return normalizePath(`${base}${suffix}`);
  }

  if (mounts.length > 1) {
    // Prefer longest prefix when file mounted multiple times (e.g. draftStore)
    const base = [...mounts].sort((a, b) => b.length - a.length)[0].replace(/\/$/, '');
    return normalizePath(`${base}${suffix}`);
  }

  // Fallback: relative route without known mount
  if (suffix.startsWith('/')) {
    return normalizePath(`/api${suffix}`);
  }

  return normalizePath(`/api/${suffix.replace(/^\/+/, '')}`);
}

function groupByCategory(rows) {
  /** @type {Record<string, typeof rows>} */
  const groups = {};
  for (const row of rows) {
    if (!groups[row.category]) groups[row.category] = [];
    groups[row.category].push(row);
  }
  return groups;
}

function renderReport(rows) {
  const groups = groupByCategory(rows);
  const categoryOrder = [
    'AGENT_WORKFLOW',
    'USER_ACTION',
    'CONTENT_CRUD',
    'SOCIAL',
    'TRANSACTION',
    'HYBRID',
    'READ_ONLY',
    'OBSERVE',
    'ADMIN',
    'UNKNOWN',
  ];

  const executionLabel = {
    AGENT_WORKFLOW: 'Kernel',
    USER_ACTION: 'Direct',
    CONTENT_CRUD: 'Direct',
    SOCIAL: 'Direct',
    TRANSACTION: 'Direct',
    HYBRID: 'Configurable',
    READ_ONLY: 'Direct',
    OBSERVE: 'Direct',
    ADMIN: 'Direct',
    UNKNOWN: 'Review',
  };

  const lines = [
    '# Endpoint Categorization Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Routing layer: `src/lib/routing/intentRouter.js` + `src/middleware/intentRoutingMiddleware.js`',
    '',
    '| Endpoint | Method | Category | Route To | Source File | Reason |',
    '|----------|--------|----------|----------|-------------|--------|',
  ];

  for (const cat of categoryOrder) {
    const items = groups[cat];
    if (!items?.length) continue;

    lines.push('');
    lines.push(`## ${cat.replace(/_/g, ' ')} (→ ${executionLabel[cat] ?? 'Direct'})`);
    lines.push('');

    for (const row of items.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method))) {
      lines.push(`- [ ] \`${row.fullPath}\` — **${row.method}** (${row.file})`);
    }
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Count | Execution Path |');
  lines.push('|----------|-------|----------------|');
  for (const cat of categoryOrder) {
    const count = groups[cat]?.length ?? 0;
    if (count === 0) continue;
    lines.push(`| ${cat} | ${count} | ${executionLabel[cat] ?? 'Direct'} |`);
  }
  lines.push('');
  lines.push(`**Total endpoints scanned:** ${rows.length}`);
  lines.push('');
  lines.push('## Unknown (Need Review)');
  lines.push('');
  const unknown = groups.UNKNOWN ?? [];
  if (unknown.length === 0) {
    lines.push('_No unknown endpoints — all matched registry or heuristics._');
  } else {
    for (const row of unknown) {
      lines.push(`- [ ] \`${row.method} ${row.fullPath}\` — ${row.file}`);
    }
  }

  return lines.join('\n');
}

function main() {
  parseServerMounts();
  const rawEndpoints = walkRoutes(routesDir);

  /** @type {Array<object>} */
  const rows = [];
  const seen = new Set();

  for (const ep of rawEndpoints) {
    const fullPath = resolveFullPath(ep.routePath, ep.file);
    const key = `${ep.method}:${fullPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { category, executionPath, reason } = categorizeEndpoint(fullPath, ep.method, {});
    rows.push({
      method: ep.method,
      routePath: ep.routePath,
      fullPath,
      file: ep.file,
      category,
      executionPath,
      reason,
    });
  }

  const report = renderReport(rows);
  console.log(report);

  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\nWrote ${reportPath}`);
  } else {
    console.log('\n(Pass --write to save docs/ENDPOINT_CATEGORIZATION_REPORT.md)');
  }

  return rows.length;
}

main();

#!/usr/bin/env node
/**
 * Rebuild PublishedArtifactProjection rows from active Business + stylePreferences.
 *
 * Uses the same Prisma client as Core (client-gen), not @prisma/client.
 *
 * Usage:
 *   node scripts/rebuild-published-projections.mjs [--dry-run]
 */

import '../src/env/ensureDatabaseUrl.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../src/lib/prismaClient.js';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import {
  persistPublishedBusinessArtifact,
  hasPublishedArtifactProjectionTable,
} from '../src/services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';
import { validatePublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/validatePublishedBusinessArtifact.js';
import { resolvePrismaSchemaPath } from './prismaSchemaPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

/** Resolve SQLite file path the same way Core does at runtime. */
function resolveSqliteAbsolutePath(databaseUrl) {
  if (!databaseUrl?.toLowerCase().startsWith('file:')) return null;
  let p = databaseUrl.slice(5).trim().replace(/^\.\//, '').replace(/^\/+/, '');
  const posix = p.replace(/\\/g, '/');
  if (posix === '../dev.db') return path.join(packageRoot, 'prisma', 'dev.db');
  if (posix === '../test.db') return path.join(packageRoot, 'prisma', 'test.db');
  if (posix === 'prisma/dev.db') return path.join(packageRoot, 'prisma', 'dev.db');
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(packageRoot, p);
}

function previewDatabaseUrl(url) {
  if (!url) return '(unset)';
  const s = String(url);
  if (s.toLowerCase().startsWith('file:')) {
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  }
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.hostname}${u.pathname ? u.pathname.slice(0, 24) : ''}…`;
  } catch {
    return '(redacted)';
  }
}

/**
 * @param {import('../src/lib/prismaClient.js').PrismaClient} prisma
 */
async function sqliteTableExists(prisma, tableName) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? COLLATE NOCASE LIMIT 1`,
      tableName,
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {import('../src/lib/prismaClient.js').PrismaClient} prisma
 */
async function collectDiagnostics(prisma) {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const publishedProjectionModelAvailable = hasPublishedArtifactProjectionTable(prisma);
  const delegateKeys = publishedProjectionModelAvailable
    ? Object.keys(prisma.publishedArtifactProjection).filter((k) => !k.startsWith('$'))
    : [];

  let tableExists = false;
  if (databaseUrl.toLowerCase().startsWith('file:')) {
    tableExists = await sqliteTableExists(prisma, 'PublishedArtifactProjection');
  } else if (publishedProjectionModelAvailable) {
    try {
      await prisma.publishedArtifactProjection.findFirst({ select: { id: true } });
      tableExists = true;
    } catch (err) {
      if (!String(err?.message ?? '').includes('does not exist')) {
        tableExists = false;
      }
    }
  }

  const [businessCount, activeBusinessCount, publishedBusinessCount] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { isActive: true } }),
    prisma.business.count({ where: { publishedAt: { not: null } } }),
  ]);

  const resolvedDbPath = resolveSqliteAbsolutePath(databaseUrl);
  const prismaCliMisalignedPath = path.join(packageRoot, 'prisma', 'sqlite', 'prisma', 'dev.db');

  return {
    databaseUrlPreview: previewDatabaseUrl(databaseUrl),
    resolvedDbPath,
    resolvedDbExists: resolvedDbPath ? fs.existsSync(resolvedDbPath) : false,
    prismaCliMisalignedPathExists: fs.existsSync(prismaCliMisalignedPath),
    databaseUrlResolvedFrom: path.join(packageRoot, '.env'),
    prismaSchema: resolvePrismaSchemaPath(packageRoot),
    prismaClient: 'node_modules/.prisma/client-gen',
    publishedProjectionModelAvailable,
    publishedArtifactProjectionDelegateSample: delegateKeys.slice(0, 5),
    tableExists,
    businessCount,
    activeBusinessCount,
    publishedBusinessCount,
  };
}

const prisma = new PrismaClient();

async function main() {
  console.log('[rebuild-published-projections] dryRun=', dryRun);

  const diagnostics = await collectDiagnostics(prisma);
  console.log('[rebuild-published-projections] diagnostics', diagnostics);

  if (!diagnostics.publishedProjectionModelAvailable) {
    console.error(
      '[rebuild-published-projections] Prisma client missing publishedArtifactProjection delegate.',
    );
    console.error(
      '  Run: npm run db:generate && npm run db:push',
    );
    console.error(
      '  Do not use @prisma/client in scripts — use ../src/lib/prismaClient.js',
    );
    process.exit(1);
  }

  let tableReady = diagnostics.tableExists;
  if (!tableReady && diagnostics.resolvedDbExists) {
    console.log(
      '[rebuild-published-projections] creating PublishedArtifactProjection table (targeted DDL)…',
    );
    const { execSync } = await import('node:child_process');
    execSync('node scripts/ensure-published-artifact-projection-table.mjs', {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    });
    tableReady = await sqliteTableExists(prisma, 'PublishedArtifactProjection');
  }

  if (!tableReady) {
    console.error(
      '[rebuild-published-projections] Table PublishedArtifactProjection not found in database.',
    );
    if (diagnostics.prismaCliMisalignedPathExists) {
      console.error(
        '  Prisma CLI likely applied migrations to prisma/sqlite/prisma/dev.db (wrong file).',
      );
      console.error('  Fix .env: DATABASE_URL=file:../dev.db  then run: npm run db:push');
    } else {
      console.error('  Run: node scripts/ensure-published-artifact-projection-table.mjs');
    }
    process.exit(1);
  }

  const businesses = await prisma.business.findMany({
    where: { isActive: true },
    include: {
      products: { where: { isPublished: true }, take: 200 },
    },
    orderBy: { publishedAt: 'desc' },
  });

  console.log('[rebuild-published-projections] table=true', {
    candidates: businesses.length,
  });

  const slugCounts = new Map();
  for (const b of businesses) {
    const s = (b.slug || '').toLowerCase();
    slugCounts.set(s, (slugCounts.get(s) || 0) + 1);
  }
  const duplicateSlugs = [...slugCounts.entries()].filter(([, n]) => n > 1);

  let rebuilt = 0;
  let skipped = 0;
  const warnings = [];

  for (const business of businesses) {
    const projection = buildPublishedBusinessArtifact({
      business,
      source: 'rebuild_script',
    });
    const validation = validatePublishedBusinessArtifact(projection);
    projection.diagnostics.warnings = validation.warnings;
    if (validation.warnings.length) {
      warnings.push({ slug: business.slug, warnings: validation.warnings });
    }

    if (dryRun) {
      console.log('[dry-run] would persist', business.slug, business.id);
      rebuilt++;
      continue;
    }

    try {
      await persistPublishedBusinessArtifact(prisma, projection, {
        sourceDraftId: null,
        publishRunId: `rebuild-${Date.now()}`,
      });
      rebuilt++;
    } catch (err) {
      console.warn('[rebuild] skip', business.slug, err?.message);
      skipped++;
    }
  }

  const projectionRowCount = await prisma.publishedArtifactProjection.count();

  console.log('[rebuild-published-projections] done', {
    total: businesses.length,
    rebuilt,
    skipped,
    projectionRowCount,
    duplicateSlugGroups: duplicateSlugs.length,
  });
  if (duplicateSlugs.length) {
    console.log('[rebuild-published-projections] duplicate slugs:', duplicateSlugs);
  }
  if (warnings.length) {
    console.log('[rebuild-published-projections] validation warnings sample:', warnings.slice(0, 5));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Database drift / configuration checks before deploy or after env changes.
 * Usage: npm run db:doctor
 * Requires DATABASE_URL (e.g. from .env). Targets SQLite schema (cardbey-core default).
 *
 * Fresh local DBs with no devices/media fail the data checks by design.
 * Set DB_DOCTOR_ALLOW_EMPTY=1 to skip those two checks (e.g. after prisma db push).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

await import('../src/env/loadEnv.js');

const p = new PrismaClient();
let issues = 0;
const allowEmptyData =
  process.env.DB_DOCTOR_ALLOW_EMPTY === '1' ||
  process.env.DB_DOCTOR_ALLOW_EMPTY === 'true';

/** Normalize COUNT(*) from $queryRaw (SQLite may return BigInt). */
function countFromRaw(rows) {
  if (!rows?.[0]) return 0;
  const c = rows[0].c;
  if (typeof c === 'bigint') return Number(c);
  return Number(c) || 0;
}

async function check(label, query, validate) {
  try {
    const result = await query();
    const issue = validate(result);
    if (issue) {
      console.error('❌', label, ':', issue);
      issues++;
    } else {
      console.log('✅', label);
    }
  } catch (e) {
    console.error('❌', label, ': ERROR -', e.message.split('\n')[0]);
    issues++;
  }
}

await check(
  'DATABASE_URL set',
  async () => process.env.DATABASE_URL,
  (v) => (!v ? 'DATABASE_URL is not set' : null),
);

await check(
  'No stale LAN IP in PUBLIC_BASE_URL',
  async () => process.env.PUBLIC_BASE_URL || '',
  (v) =>
    v.match(/192\.168\.|10\.|172\./)
      ? `PUBLIC_BASE_URL contains private IP: ${v}`
      : null,
);

await check(
  'Devices exist',
  async () => p.device.count(),
  (v) =>
    v === 0 && !allowEmptyData
      ? 'No devices found - wrong database? (set DB_DOCTOR_ALLOW_EMPTY=1 if intentional)'
      : null,
);

await check(
  'Media rows exist',
  async () => p.media.count(),
  (v) =>
    v === 0 && !allowEmptyData
      ? 'No Media rows - uploads may be going to wrong DB (set DB_DOCTOR_ALLOW_EMPTY=1 if intentional)'
      : null,
);

await check(
  'No absolute LAN URLs in Media',
  async () =>
    p.$queryRawUnsafe(
      "SELECT COUNT(*) as c FROM Media WHERE url LIKE '%192.168%'",
    ),
  (rows) => {
    const c = countFromRaw(rows);
    return c > 0 ? `${c} Media rows have LAN-style URLs in url` : null;
  },
);

await check(
  'PlaylistItems have valid Media FK',
  async () =>
    p.$queryRawUnsafe(
      'SELECT COUNT(*) as c FROM PlaylistItem pi ' +
        'LEFT JOIN Media m ON m.id = pi.mediaId ' +
        'WHERE pi.mediaId IS NOT NULL AND m.id IS NULL',
    ),
  (rows) => {
    const c = countFromRaw(rows);
    return c > 0 ? `${c} orphan PlaylistItem→Media references` : null;
  },
);

await p.$disconnect();

console.log(
  '\n' +
    (issues === 0
      ? '✅ All checks passed'
      : `❌ ${issues} issue(s) found - fix before deploying`),
);
process.exit(issues > 0 ? 1 : 0);

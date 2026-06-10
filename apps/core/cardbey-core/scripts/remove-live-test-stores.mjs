/**
 * Hard-delete retired live test stores from production Postgres.
 *
 * Usage (Render cardbey-core shell with production DATABASE_URL):
 *   node scripts/remove-live-test-stores.mjs           # dry-run
 *   node scripts/remove-live-test-stores.mjs --apply   # delete rows
 */
import '../src/env/ensureDatabaseUrl.js';
import { LIVE_RETIRED_TEST_STORE_SLUGS } from '../src/utils/liveTestStoreDenylist.js';

const apply = process.argv.includes('--apply');
const slugs = [...LIVE_RETIRED_TEST_STORE_SLUGS];

const { spawn } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');
const path = await import('node:path');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const unpublishScript = path.join(scriptDir, 'unpublish-public-store.mjs');
const args = [...slugs, ...(apply ? ['--apply', '--delete'] : [])];

console.log(`Mode: ${apply ? 'DELETE' : 'DRY-RUN'}`);
console.log(`Stores (${slugs.length}):`, slugs.join(', '));
console.log('');

const child = spawn(process.execPath, [unpublishScript, ...args], {
  stdio: 'inherit',
  cwd: path.join(scriptDir, '..'),
});

child.on('exit', (code) => process.exit(code ?? 1));

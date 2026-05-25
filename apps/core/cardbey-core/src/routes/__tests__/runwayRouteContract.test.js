/**
 * Static contract: critical runway routes must stay mounted in server.js.
 * Fails fast when a mount is removed without updating smoke/CI.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_JS = join(__dirname, '../../server.js');
const DEBUG_JS = join(__dirname, '../debug.js');

const serverSrc = readFileSync(SERVER_JS, 'utf8');
const debugSrc = readFileSync(DEBUG_JS, 'utf8');

const REQUIRED_SERVER_SNIPPETS = [
  { label: 'journeys router import', needle: "import journeysRoutes from './routes/journeys.routes.js'" },
  { label: 'journeys mount', needle: "app.use('/api/journeys', journeysRoutes)" },
  { label: 'health routes mount', needle: "app.use('/api', healthRoutes)" },
  { label: 'SSE realtime mount', needle: "app.use('/api', realtimeRoutes)" },
  { label: 'draft-store canonical mount', needle: "app.use('/api/draft-store', draftStoreRoutes)" },
  { label: 'runway legacy guard', needle: 'runwayLegacyGuard' },
];

describe('runway route contract (server.js)', () => {
  for (const { label, needle } of REQUIRED_SERVER_SNIPPETS) {
    it(`includes ${label}`, () => {
      expect(serverSrc, `Missing in server.js: ${needle}`).toContain(needle);
    });
  }

  it('documents SSE path in startup log', () => {
    expect(serverSrc).toMatch(/\/api\/stream/);
  });
});

describe('runway route contract (debug dev routes)', () => {
  it('defines store-creation-health debug route', () => {
    expect(debugSrc).toContain("router.get('/store-creation-health'");
  });
});

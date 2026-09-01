/**
 * Golden Path journey tests — import regression (always) + full DB journeys (opt-in).
 *
 * Full journeys (structured_store_build → generateDraft → preview):
 *   RUN_JOURNEY_TEST=1 npm run test:journey
 *
 * Import-only regression (CI-safe, no DB writes):
 *   npm test -- src/lib/toolExecutors/store/__tests__/goldenPathJourney.test.js
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const catalogAuthorityPath = path.join(
  coreRoot,
  'src/lib/storeCreationResearch/catalogAuthorityDecision.js',
);

describe('golden path import chain (regression)', () => {
  it('imports catalogAuthorityDecision with stable exports (duplicate-export guard)', async () => {
    const mod = await import('../../../storeCreationResearch/catalogAuthorityDecision.js');
    expect(typeof mod.resolveCatalogAuthorityDecision).toBe('function');
    expect(typeof mod.attachCatalogGrounding).toBe('function');
    expect(typeof mod.isOfficialWebsiteResolved).toBe('function');
    expect(mod.CATALOG_FALLBACK_REASONS).toBeTruthy();
    expect(mod.CATALOG_AUTHORITY_SOURCES).toBeTruthy();

    const source = await readFile(catalogAuthorityPath, 'utf8');
    for (const symbol of [
      'resolveCatalogAuthorityDecision',
      'attachCatalogGrounding',
      'isOfficialWebsiteResolved',
    ]) {
      const count = (source.match(new RegExp(`export function ${symbol}`, 'g')) ?? []).length;
      expect(count).toBe(1);
    }
  });

  it('imports structured_store_build and generateDraft service (production graph)', async () => {
    const structured = await import('../structured_store_build.js');
    expect(typeof structured.execute).toBe('function');

    const draftSvc = await import('../../../../services/draftStore/draftStoreService.js');
    expect(typeof draftSvc.generateDraft).toBe('function');
    expect(typeof draftSvc.createDraft).toBe('function');
    expect(typeof draftSvc.getDraft).toBe('function');
  });

  it('loads catalogAuthorityDecision via production-relative path (buildCatalog dynamic import)', async () => {
    // draftStoreService.js: await import('../../lib/storeCreationResearch/catalogAuthorityDecision.js')
    const dynamic = await import('../../../storeCreationResearch/catalogAuthorityDecision.js');
    expect(typeof dynamic.resolveCatalogAuthorityDecision).toBe('function');
    expect(typeof dynamic.attachCatalogGrounding).toBe('function');
  });
});

const journeyEnabled = process.env.RUN_JOURNEY_TEST === '1';

describe.skipIf(!journeyEnabled)('golden path journey (integration, RUN_JOURNEY_TEST=1)', () => {
  it(
    'runs direct + upload create journeys through structured_store_build to preview',
    () => {
      const script = path.join(coreRoot, 'scripts/golden-path-journey-test.mjs');
      const result = spawnSync(process.execPath, ['--import', 'tsx/esm', script], {
        cwd: coreRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          RUN_JOURNEY_TEST: '1',
          NODE_ENV: 'test',
          ROLE: 'test',
        },
        timeout: 420_000,
      });
      if (result.status !== 0) {
        // eslint-disable-next-line no-console
        console.error(result.stdout);
        // eslint-disable-next-line no-console
        console.error(result.stderr);
      }
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('all journeys OK');
    },
    420_000,
  );
});

/**
 * CLI: run business ingestion pipeline against the sample open-data fixture.
 *
 * Usage: node scripts/run-business-ingestion.mjs [--persist-stores]
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { OpenDataUrlAdapter, runIngestion } from '../src/lib/businessIngestion/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  '..',
  'data',
  'businessIngestion',
  'fixtures',
  'sample-opendata-businesses.json',
);

const persistStores = process.argv.includes('--persist-stores');
const body = readFileSync(FIXTURE, 'utf8');

const adapter = new OpenDataUrlAdapter({
  url: `file://${FIXTURE}`,
  recordsPath: 'records',
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => body,
  }),
});

const result = await runIngestion(adapter, { persistSeeds: true, persistStores });

console.log(JSON.stringify(result.metrics, null, 2));
console.log(
  `\nSummary: ${result.metrics.recordsFetched} fetched → ${result.metrics.uniqueRecords} unique seeds (${result.metrics.duplicatesRemoved} duplicates removed)`,
);

#!/usr/bin/env node
/**
 * Live verification for multi-source video search adapters.
 *
 * Run after registering API keys:
 *   Pixabay — https://pixabay.com/api/docs/  (instant free key)
 *   Coverr  — https://coverr.co/developers   (email team@coverr.co or signup flow)
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/verify-video-sources.mjs
 *   node scripts/verify-video-sources.mjs --query="skincare spa"
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Pixabay from '../src/services/media/PixabayAdapter.js';
import * as Coverr from '../src/services/media/CoverrAdapter.js';
import * as Mixkit from '../src/services/media/MixkitAdapter.js';
import { searchAllSources } from '../src/services/media/VideoSearchService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load .env / .env.local without adding a dependency.
for (const name of ['.env.local', '.env']) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const queryArg = process.argv.find((a) => a.startsWith('--query='));
const query = queryArg ? queryArg.slice('--query='.length) : 'skincare spa';

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function probeCoverrLive() {
  section('Coverr live API (raw response shape)');
  const token = process.env.COVERR_API_TOKEN?.trim();
  if (!token) {
    console.log('SKIP — COVERR_API_TOKEN not set. Register at https://coverr.co/developers');
    return;
  }

  const url = new URL('https://api.coverr.co/videos');
  url.searchParams.set('query', 'spa');
  url.searchParams.set('urls', 'true');
  url.searchParams.set('page_size', '2');
  url.searchParams.set('api_key', token);

  const res = await fetch(url.toString());
  const body = await res.json();
  console.log('HTTP', res.status);
  if (!res.ok) {
    console.log('Error body:', JSON.stringify(body, null, 2));
    return;
  }

  const hit = body?.hits?.[0];
  if (!hit) {
    console.log('No hits returned');
    return;
  }

  console.log('Top-level keys:', Object.keys(body));
  console.log('First hit keys  :', Object.keys(hit));
  console.log('urls keys       :', hit.urls ? Object.keys(hit.urls) : '(missing — did you pass urls=true?)');
  console.log('Raw first hit   :', JSON.stringify(hit, null, 2));

  const mapped = (await Coverr.search('spa', { perPage: 2 }))[0];
  console.log('Mapped VideoResult:', JSON.stringify(mapped, null, 2));
}

async function probePixabayLive() {
  section('Pixabay live API (raw response shape)');
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) {
    console.log('SKIP — PIXABAY_API_KEY not set. Register at https://pixabay.com/api/docs/');
    return;
  }

  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', key);
  url.searchParams.set('q', 'spa');
  url.searchParams.set('video_type', 'film');
  url.searchParams.set('per_page', '2');

  const res = await fetch(url.toString());
  const body = await res.json();
  console.log('HTTP', res.status);
  if (!res.ok) {
    console.log('Error body:', JSON.stringify(body, null, 2));
    return;
  }

  const hit = body?.hits?.[0];
  if (!hit) {
    console.log('No hits returned');
    return;
  }

  console.log('Top-level keys:', Object.keys(body));
  console.log('First hit keys  :', Object.keys(hit));
  console.log('videos keys     :', hit.videos ? Object.keys(hit.videos) : '(missing)');
  console.log('Raw first hit   :', JSON.stringify(hit, null, 2));

  const mapped = (await Pixabay.search('spa', { perPage: 2 }))[0];
  console.log('Mapped VideoResult:', JSON.stringify(mapped, null, 2));
}

async function probeMixkitCatalogue() {
  section('Mixkit static catalogue');
  const results = await Mixkit.search('skincare');
  console.log(`Catalogue matches for "skincare": ${results.length}`);
  for (const r of results.slice(0, 3)) {
    const v = await fetch(r.video_url, { method: 'HEAD' });
    const t = await fetch(r.thumbnail_url, { method: 'HEAD' });
    console.log(`  ${r.id} — video ${v.status}, thumb ${t.status}`);
  }
}

async function probeMergedSearch() {
  section(`Merged search (GET /api/media/video/search?q=${query})`);
  const out = await searchAllSources(query, { perPage: 8 });
  console.log('configured :', Object.keys(out.bySource).concat(
    out.skipped.length ? `(skipped: ${out.skipped.join(', ')})` : ''
  ));
  console.log('bySource   :', out.bySource);
  console.log('total      :', out.results.length);
  console.log('sources    :', [...new Set(out.results.map((r) => r.source))]);
}

try {
  await probeCoverrLive();
  await probePixabayLive();
  await probeMixkitCatalogue();
  await probeMergedSearch();
  console.log('\nDone.');
} catch (err) {
  console.error('\nFAILED:', err?.message || err);
  process.exit(1);
}

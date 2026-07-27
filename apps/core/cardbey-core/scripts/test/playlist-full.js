#!/usr/bin/env node
// Simple test script to verify playlist delivery for a screen
// Usage:
//   node scripts/test/playlist-full.js --id=<screenId> [--base=http://localhost:3001]
//   SCREEN_ID=<screenId> BASE_URL=http://localhost:3001 node scripts/test/playlist-full.js

import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const SCREEN_ID = args.id || process.env.SCREEN_ID;
const BASE_URL = (args.base || process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');

if (!SCREEN_ID) {
  console.error('Usage: node scripts/test/playlist-full.js --id=<screenId> [--base=http://localhost:3001]');
  process.exit(1);
}

async function run() {
  const url = `${BASE_URL}/api/screens/${encodeURIComponent(SCREEN_ID)}/playlist/full`;
  console.log('[TEST] GET', url);
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  console.log('[TEST] status', res.status, res.statusText);
  const json = await res.json().catch(() => ({}));
  console.log('[TEST] body:', JSON.stringify(json, null, 2));
  if (!json || !json.ok) {
    console.error('[TEST] ❌ Not ok');
    process.exitCode = 1;
    return;
  }
  if (!json.playlistId) {
    console.warn('[TEST] ⚠ No playlistId returned (maybe not assigned yet)');
  } else {
    console.log('[TEST] ✅ assignedPlaylistId:', json.playlistId);
  }
  console.log('[TEST] items:', Array.isArray(json.items) ? json.items.length : 0);
  if (Array.isArray(json.items) && json.items.length > 0) {
    const first = json.items[0];
    console.log('[TEST] first item:', {
      url: first.url,
      type: first.type || first.mediaType,
      durationMs: first.durationMs,
    });
    // Optional quick HEAD to validate content-type
    try {
      await delay(100);
      const head = await fetch(first.url, { method: 'HEAD' });
      console.log('[TEST] first item HEAD:', head.status, head.headers.get('content-type'));
    } catch (e) {
      console.warn('[TEST] HEAD failed:', e?.message || e);
    }
  }
}

run().catch((e) => {
  console.error('[TEST] Error:', e);
  process.exit(1);
});



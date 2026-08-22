#!/usr/bin/env node
/**
 * Phase 8 — Seeding deploy gate (presence / absence only).
 * Never prints secret values. Safe to run locally or in Render Shell.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/check-seeding-deploy-gate.mjs
 *   node scripts/check-seeding-deploy-gate.mjs --json
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDbCapabilities } from '../src/lib/persistence/dbCapabilityRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

function present(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function flag(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

const caps = getDbCapabilities();

const requiredForEnrichment = [
  { key: 'ANTHROPIC_API_KEY', required: true, why: 'Batch enrichment / Claude descriptions' },
  { key: 'LOGODEV_API_KEY', required: true, why: 'Logo fallback when OG hero missing' },
];

const requiredForOtpMail = [
  { key: 'MAIL_HOST', required: true, why: 'SMTP host for claim OTP + verification mail' },
  { key: 'MAIL_PORT', required: true, why: 'SMTP port' },
  { key: 'MAIL_USER', required: true, why: 'SMTP auth user' },
  { key: 'MAIL_PASS', required: true, why: 'SMTP auth password' },
  { key: 'MAIL_FROM_EMAIL', required: true, why: 'From address' },
];

const recommended = [
  { key: 'MAIL_FROM_NAME', required: false, why: 'From display name' },
  { key: 'DEV_OTP_INBOX', required: false, why: 'Redirect inbox when live outreach off' },
  { key: 'DISCOVERY_SYSTEM_USER_ID', required: false, why: 'Ghost store owner on activate' },
  { key: 'INGESTION_SYSTEM_USER_ID', required: false, why: 'Alt ghost store owner id' },
];

const rows = [];
for (const item of [...requiredForEnrichment, ...requiredForOtpMail, ...recommended]) {
  rows.push({
    key: item.key,
    required: item.required,
    status: present(item.key) ? 'present' : 'missing',
    why: item.why,
  });
}

const claimLive = flag('CLAIM_OTP_LIVE_OUTREACH');
const mailReady = requiredForOtpMail.every((r) => present(r.key));
const enrichReady = requiredForEnrichment.every((r) => present(r.key));

const gate = {
  checkedAt: new Date().toISOString(),
  databaseProvider: caps.provider,
  isPostgres: caps.isPostgres === true,
  CLAIM_OTP_LIVE_OUTREACH: claimLive ? 'true' : 'false',
  enrichmentGate: enrichReady ? 'PASS' : 'FAIL',
  mailConfigGate: mailReady ? 'PASS' : 'FAIL',
  liveOutreachSafe:
    !claimLive
      ? 'PASS (live off — OTP redirects to DEV inbox)'
      : mailReady
        ? 'WARN (live ON — confirm Render mail + intentional outreach)'
        : 'FAIL (live ON but MAIL_* incomplete)',
  vars: rows,
  notes: [
    'This script never prints secret values.',
    'Render live confirmation requires Dashboard → Environment or Shell with this script.',
    'Official Render CLI is @render-oss/cli — not the npm "render-cli" templating package.',
    'Keep CLAIM_OTP_LIVE_OUTREACH=false until staging re-audit (Phase 9) and intentional GTM start.',
  ],
};

const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify(gate, null, 2));
} else {
  console.log('=== Seeding deploy gate (presence only) ===');
  console.log(`checkedAt: ${gate.checkedAt}`);
  console.log(`database: provider=${gate.databaseProvider} isPostgres=${gate.isPostgres}`);
  console.log(`CLAIM_OTP_LIVE_OUTREACH: ${gate.CLAIM_OTP_LIVE_OUTREACH}`);
  console.log(`enrichmentGate: ${gate.enrichmentGate}`);
  console.log(`mailConfigGate: ${gate.mailConfigGate}`);
  console.log(`liveOutreachSafe: ${gate.liveOutreachSafe}`);
  console.log('');
  for (const r of rows) {
    const req = r.required ? 'required' : 'optional';
    console.log(`${r.status.padEnd(8)} ${r.key.padEnd(28)} (${req}) — ${r.why}`);
  }
  console.log('');
  for (const n of gate.notes) console.log(`- ${n}`);
}

const hardFail =
  gate.enrichmentGate === 'FAIL' ||
  gate.mailConfigGate === 'FAIL' ||
  String(gate.liveOutreachSafe).startsWith('FAIL');
process.exit(hardFail ? 1 : 0);

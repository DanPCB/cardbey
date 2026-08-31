/**
 * Hard-delete Phase 3 closure disposable fixtures from local SQLite.
 * Does not touch BB Flowers / live data — only IDs from closure-fixture-manifest.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'tmp/phase3-browser-evidence');
const manifestPath = path.join(evidence, 'closure-fixture-manifest.json');
const secretsPath = path.join(evidence, 'closure-fixture-secrets.json');

if (!fs.existsSync(manifestPath)) {
  console.error('missing manifest');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const secrets = fs.existsSync(secretsPath)
  ? JSON.parse(fs.readFileSync(secretsPath, 'utf8'))
  : {};

const db = new DatabaseSync(path.join(root, 'prisma/dev-fresh.db'));
const report = { deleted: {}, remaining: {}, errors: [] };

function run(sql, params = []) {
  try {
    return db.prepare(sql).run(...params);
  } catch (e) {
    report.errors.push(String(e.message || e));
    return null;
  }
}

function count(sql, params = []) {
  try {
    return db.prepare(sql).get(...params)?.c ?? 0;
  } catch {
    return -1;
  }
}

const storeIds = [manifest.storeAId, manifest.storeBId].filter(Boolean);
const userEmails = [manifest.owner?.email, manifest.other?.email, manifest.admin?.email].filter(
  Boolean,
);
const draftId = manifest.draftId;

for (const sid of storeIds) {
  run(`DELETE FROM ContentEditProposal WHERE storeId = ?`, [sid]);
  run(`DELETE FROM AuditEvent WHERE entityId = ?`, [sid]);
  if (draftId) run(`DELETE FROM DraftStore WHERE id = ?`, [draftId]);
  run(`DELETE FROM Business WHERE id = ?`, [sid]);
}

for (const email of userEmails) {
  const row = db.prepare(`SELECT id FROM User WHERE email = ?`).get(email);
  if (row?.id) {
    run(`DELETE FROM AuditEvent WHERE actorId = ?`, [row.id]);
    run(`DELETE FROM User WHERE id = ?`, [row.id]);
  }
}

report.deleted = {
  stores: storeIds,
  draftId,
  emails: userEmails,
};
report.remaining = {
  storeA: count(`SELECT COUNT(*) AS c FROM Business WHERE id = ?`, [manifest.storeAId]),
  storeB: count(`SELECT COUNT(*) AS c FROM Business WHERE id = ?`, [manifest.storeBId]),
  draft: draftId
    ? count(`SELECT COUNT(*) AS c FROM DraftStore WHERE id = ?`, [draftId])
    : 0,
  ownerUser: count(`SELECT COUNT(*) AS c FROM User WHERE email = ?`, [manifest.owner?.email]),
};

// Soft-mark any prior soft-cleaned p3 fixtures if still present
const leftover = db
  .prepare(
    `SELECT id, name FROM Business WHERE name LIKE '%P3 Closure%' OR name LIKE '%[DELETED_P3_FIXTURE]%' LIMIT 20`,
  )
  .all();
report.leftoverNamed = leftover;

fs.writeFileSync(path.join(evidence, 'closure-cleanup-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

try {
  fs.unlinkSync(secretsPath);
} catch {
  /* ok */
}

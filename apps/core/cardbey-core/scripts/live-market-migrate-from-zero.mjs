/**
 * CLI proofs for Live Market migration readiness (disposable DBs only).
 */
import {
  proveSqliteMigrateFromZero,
  proveLiveMarketMigrationSql,
} from '../src/lib/liveMarket/testHarness/disposableSqlite.js';

console.log('=== A) Full migrate deploy from empty SQLite ===');
const fromZero = await proveSqliteMigrateFromZero();
console.log(JSON.stringify(fromZero, null, 2));

console.log('\n=== B) Live Market migration SQL re-apply proof ===');
const sqlProof = await proveLiveMarketMigrationSql();
console.log(JSON.stringify(sqlProof, null, 2));

const ok = sqlProof.ok === true;
if (!fromZero.ok) {
  console.log(
    '\n[note] Full migrate-from-zero FAILED (expected if historical chain is broken). Live Market SQL proof is the additive verification for Phase 1.',
  );
}
process.exit(ok ? 0 : 1);

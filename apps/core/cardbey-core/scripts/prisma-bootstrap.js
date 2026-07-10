// scripts/prisma-bootstrap.js
// Prefers `prisma migrate deploy` when prisma/migrations is present in the repo.
//
// Local SQLite lock (prod.db / dev.db): if bootstrap fails with "database is locked", another process
// may hold the file — stop stale holders before retrying:
//   - node.exe (previous API / nodemon / tests)
//   - npx prisma studio
//   - other terminals running npm run dev:api
// Windows: netstat -ano | findstr :3001  then  taskkill /PID <pid> /F
// Optional: remove dev.db-wal / dev.db-shm only (not dev.db) after all Node processes exit.
// SQLite: after dropping MissionBlackboard (legacy JSONB DDL), a one-shot db push
// --accept-data-loss recreates it; migrate deploy alone may not. No-migrations push
// still refuses when Device rows exist.
// P3005: exit with instructions — do not push over a non-empty DB without migration history.
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isPostgresDatabaseUrl,
  isRenderProduction,
  pickDatabaseUrlForPrisma,
  resolvePrismaSchemaPath as resolveSchemaPathFromEnv,
} from "./prismaSchemaPath.js";
// Ensure DATABASE_URL is normalized before migrate/deploy (must run before any PrismaClient use).
import "../src/env/ensureDatabaseUrl.js";

// Skip heavy bootstrap when a parent sets this (e.g. tooling / tests).
if (process.env.NODEMON_RESTART === "1") {
  console.log("[prisma] NODEMON_RESTART=1 — skipping bootstrap");
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function toStr(x) {
  return Buffer.isBuffer(x) ? x.toString("utf8") : String(x ?? "");
}

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return defaultValue;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Child env: CI helps Prisma stay non-interactive on Render. */
function prismaChildEnv() {
  const effectiveUrl = pickDatabaseUrlForPrisma();
  const isPostgres = isPostgresDatabaseUrl(effectiveUrl);
  // Local dev safeguard: force binary engine for SQLite. Data Proxy engines require prisma:// URLs.
  const engineType = String(process.env.PRISMA_CLIENT_ENGINE_TYPE || "").trim().toLowerCase();
  const isProxyEngine = engineType === "dataproxy" || engineType === "data-proxy" || engineType === "edge";
  const next = { ...process.env, CI: process.env.CI || "true" };
  if (effectiveUrl) {
    next.DATABASE_URL = effectiveUrl;
  }
  if (!isPostgres) {
    if (isProxyEngine) {
      console.warn("[prisma] overriding PRISMA_CLIENT_ENGINE_TYPE for SQLite (was %s)", engineType);
    }
    next.PRISMA_CLIENT_ENGINE_TYPE = "binary";
    delete next.PRISMA_GENERATE_DATAPROXY;
  }
  return next;
}

function sleepMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n <= 0) return;
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${n}"`, {
        stdio: "ignore",
      });
      return;
    }
    const sec = Math.max(1, Math.ceil(n / 1000));
    execSync(`sleep ${sec}`, { stdio: "ignore", shell: true });
  } catch {
    const end = Date.now() + n;
    while (Date.now() < end) {
      /* sync fallback when shell sleep unavailable */
    }
  }
}

function sleepSync(seconds) {
  sleepMs(Math.round(Number(seconds) * 1000) || 0);
}

function isSqliteLockOutput(text) {
  const s = String(text || "");
  return (
    s.includes("SQLITE_BUSY") ||
    s.includes("database is locked") ||
    s.includes("5: database is locked") ||
    s.includes("SqliteFailure") ||
    s.includes("Error code 5:")
  );
}

function isWindowsPrismaGenerateEperm(text) {
  const s = String(text || "");
  return (
    s.includes("EPERM: operation not permitted, rename") &&
    (s.includes("query_engine-windows.dll.node.tmp") ||
      s.includes("query_engine-windows.dll.node"))
  );
}

/**
 * Run a prisma shell command with captured stdout/stderr so Render logs show the real error
 * (stdio: "inherit" loses stderr on execSync failures, so Node prints null stdout/stderr).
 */
function runPrisma(cmdLabel, cmd, { retries = 5, retryDelaySec = 3 } = {}) {
  let lastCombined = "";
  for (let attempt = 0; attempt < retries; attempt++) {
    const r = spawnSync(cmd, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: prismaChildEnv(),
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const stdout = toStr(r.stdout);
    const stderr = toStr(r.stderr);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    lastCombined = stdout + stderr;
    if (r.status === 0) return;

    if (
      (isSqliteLockOutput(lastCombined) ||
        (cmdLabel === "generate" && isWindowsPrismaGenerateEperm(lastCombined))) &&
      attempt < retries - 1
    ) {
      console.warn(
        `[prisma] ${cmdLabel}: SQLite lock/busy (attempt ${attempt + 1}/${retries}); waiting ${retryDelaySec}s...`,
      );
      sleepSync(retryDelaySec);
      continue;
    }

    console.error(`[prisma] ${cmdLabel} failed (exit ${r.status ?? r.signal}):`, cmd);
    console.error(
      "[prisma] Prisma output (first 16k chars):",
      lastCombined.slice(0, 16000) || "(no captured output — check npx/prisma availability)",
    );
    throw new Error(
      `[prisma] ${cmdLabel} failed (exit ${r.status})\n${lastCombined.slice(0, 12000) || "(no output)"}`,
    );
  }
}

/**
 * Local SQLite: true when migrate status reports nothing pending (read-only check).
 * @param {string} schemaPath
 * @param {{ maxAttempts?: number, backoffMs?: number }} [opts]
 * @returns {boolean|null} true = up to date, false = pending/failed, null = unknown (e.g. still locked)
 */
function checkSqliteMigrateUpToDate(schemaPath, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;
  const cmd = `npx prisma migrate status --schema=${schemaPath}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = spawnSync(cmd, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: prismaChildEnv(),
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const stdout = toStr(r.stdout);
    const stderr = toStr(r.stderr);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    const combined = `${stderr}${stdout}`;

    if (
      r.status === 0 &&
      (combined.includes("Database schema is up to date") ||
        combined.includes("No pending migrations to apply"))
    ) {
      return true;
    }
    if (
      combined.includes("following migrations have not yet been applied") ||
      combined.includes("migrations have failed")
    ) {
      return false;
    }
    if (isSqliteLockOutput(combined) && attempt < maxAttempts) {
      sleepMs(backoffMs);
      continue;
    }
    return null;
  }
  return null;
}

/**
 * SQLite dev: migrate deploy failed only due to lock while API/Studio holds dev.db.
 * @param {string} schemaPath
 * @param {string} combinedOutput
 */
function tryContinueSqliteMigrateDeployDespiteLock(schemaPath, combinedOutput) {
  if (!isSqliteLockOutput(combinedOutput)) return false;
  const upToDate = checkSqliteMigrateUpToDate(schemaPath);
  if (upToDate !== true) return false;
  console.warn(
    "[prisma] sqlite locked during migrate deploy but migration history is up to date — continuing bootstrap",
  );
  console.warn(
    "[prisma] tip: stop duplicate node/prisma processes on dev.db to avoid lock noise (see prisma-bootstrap.js header)",
  );
  return true;
}

/**
 * Run migrate deploy; on failure attach stderr/stdout for P3005 detection.
 * SQLite (local dev only): bounded retry when another process briefly holds dev.db.
 * Postgres / Render: single attempt — unchanged.
 */
function runMigrateDeploy(schemaPath) {
  const isSqliteLocal = !isPostgresDatabaseUrl(pickDatabaseUrlForPrisma());
  if (isSqliteLocal && envTruthy("PRISMA_SKIP_MIGRATE_DEPLOY", false)) {
    console.log("[prisma] PRISMA_SKIP_MIGRATE_DEPLOY=1 — skipping migrate deploy (sqlite dev)");
    return;
  }

  // migrate deploy needs a write lock even when nothing is pending; status is read-only and
  // succeeds while the API holds prod.db — skip deploy when history is already current.
  if (isSqliteLocal) {
    const upToDate = checkSqliteMigrateUpToDate(schemaPath, { maxAttempts: 6, backoffMs: 1500 });
    if (upToDate === true) {
      console.log("[prisma] sqlite migrations already up to date — skipping migrate deploy");
      return;
    }
    if (upToDate === false) {
      console.log("[prisma] sqlite has pending migrations — running migrate deploy");
    }
  }

  const maxAttempts = isSqliteLocal ? 8 : 1;
  const backoffMs = 2500;
  const cmd = `npx prisma migrate deploy --schema=${schemaPath}`;

  let lastCombined = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = spawnSync(cmd, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: prismaChildEnv(),
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const stdout = toStr(r.stdout);
    const stderr = toStr(r.stderr);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    lastCombined = `${stderr}${stdout}`;
    if (r.status === 0) return;

    if (isSqliteLocal && isSqliteLockOutput(lastCombined) && attempt < maxAttempts) {
      console.warn(
        `[prisma] sqlite locked, retrying migrate deploy attempt ${attempt}/${maxAttempts}`,
      );
      sleepMs(backoffMs);
      continue;
    }

    if (isSqliteLocal && tryContinueSqliteMigrateDeployDespiteLock(schemaPath, lastCombined)) {
      return;
    }

    const err = new Error(lastCombined || `migrate deploy failed (exit ${r.status ?? "?"})`);
    err.original = r;
    throw err;
  }
}

/** Old bad deploys created MissionBlackboard with Postgres JSONB DDL in SQLite; SQLite cannot parse it — drop so push/migrate can proceed. */
function dropSqliteMissionBlackboardIfNeeded(schemaPath) {
  if (isPostgresDatabaseUrl(pickDatabaseUrlForPrisma())) return;
  try {
    const dropSql = "DROP TABLE IF EXISTS MissionBlackboard;";
    execSync(`npx prisma db execute --schema=${schemaPath} --stdin`, {
      input: dropSql,
      stdio: ["pipe", "inherit", "inherit"],
      env: prismaChildEnv(),
      shell: true,
    });
    console.log("[prisma] dropped MissionBlackboard if present (SQLite JSONB / legacy DDL fix)");
  } catch (e) {
    console.warn("[prisma] could not drop MissionBlackboard (non-fatal):", e?.message || e);
  }
}

/** Before db push: refuse if operational data exists (prevents destructive drift resolution). */
async function getDeviceCountSafely() {
  try {
    const clientGenUrl = new URL("../node_modules/.prisma/client-gen/index.js", import.meta.url);
    const { PrismaClient } = await import(clientGenUrl.href);
    const p = new PrismaClient();
    try {
      return await p.device.count();
    } finally {
      await p.$disconnect();
    }
  } catch {
    return 0;
  }
}

const schemaPath = resolveSchemaPathFromEnv(rootDir);
const effectiveDatabaseUrl = pickDatabaseUrlForPrisma();
const schemaIsPostgres = isPostgresDatabaseUrl(effectiveDatabaseUrl);

if (isRenderProduction() && !schemaIsPostgres) {
  console.error(
    "[prisma] Render production requires a Postgres DATABASE_URL (postgresql:// or postgres://).",
  );
  console.error(
    "[prisma] Set DATABASE_URL in Render → cardbey-core-staging → Environment to your Postgres connection string.",
  );
  console.error(
    "[prisma] Or set POSTGRES_DATABASE_URL to postgres and keep DATABASE_URL unset if you use that pattern.",
  );
  const current = String(process.env.DATABASE_URL || "").trim();
  if (current.toLowerCase().startsWith("file:")) {
    console.error("[prisma] Current DATABASE_URL is SQLite (file:...) — that forces prisma/sqlite/schema.prisma.");
  }
  process.exit(1);
}
// Must match Prisma: migrations live next to the schema (e.g. prisma/sqlite/migrations,
// prisma/postgres/migrations), not always prisma/migrations — wrong dir caused SQLite
// bootstrap to think "has migrations" from the wrong tree and worsened P3005/P3009 confusion.
const migrationsDir = path.join(path.dirname(schemaPath), "migrations");

if (!fs.existsSync(schemaPath)) {
  console.warn("[prisma] schema not found; skipping Prisma bootstrap", { schemaPath });
  console.log("[prisma] bootstrap ok (skipped: no schema)");
  process.exit(0);
}

console.log("[prisma] generate");
try {
  runPrisma("generate", `npx prisma generate --schema=${schemaPath}`);
} catch (_e) {
  console.warn(
    "[prisma] generate failed (likely Windows " +
      "EPERM file lock) - continuing with existing client.",
  );
  console.warn(
    "[prisma] To fix: close all node processes " +
      "and run: npx prisma generate --schema=" +
      schemaPath,
  );
}

const migrationDirs =
  fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."))
    : [];
const hasMigrations = migrationDirs.length > 0;

console.log("[prisma] schema:", schemaPath);
console.log("[prisma] provider:", schemaIsPostgres ? "postgres" : "sqlite");
console.log(
  "[prisma] DATABASE_URL scheme:",
  effectiveDatabaseUrl ? effectiveDatabaseUrl.split(":")[0] : "(not set)",
);
console.log("[prisma] migrations dir:", migrationsDir, "hasMigrations:", hasMigrations);

dropSqliteMissionBlackboardIfNeeded(schemaPath);

const isPostgresForRestore = schemaIsPostgres;

/** Postgres: auto-resolve known-safe failed migrations (P3009) before deploy. */
function parseFailedMigrationName(text) {
  const blob = String(text || "");
  const backtick = blob.match(/The `([^`]+)` migration/);
  if (backtick) return backtick[1].trim();
  const named = blob.match(/Migration name:\s*(\S+)/);
  return named ? named[1].trim() : null;
}

function tryResolvePostgresFailedMigrationAndRedeploy(schemaPath, msg, code) {
  const failedName = parseFailedMigrationName(msg);
  console.warn(`[prisma] ${code} — attempting auto-resolve for allowlisted migrations, then retry deploy`);
  resolvePostgresFailedMigrationsBeforeDeploy(failedName);
  runMigrateDeploy(schemaPath);
  console.log(`[prisma] migrate deploy succeeded after ${code} auto-resolve`);
}

function resolvePostgresFailedMigrationsBeforeDeploy(migrationName) {
  if (!schemaIsPostgres) return;
  try {
    const script = path.join(rootDir, "scripts", "resolve-postgres-failed-migration.mjs");
    const nameFlag = migrationName ? ` --name=${migrationName}` : "";
    execSync(`node ${script}${nameFlag}`, { stdio: "inherit", env: prismaChildEnv(), shell: true });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("not auto-resolving")) throw e;
    console.warn("[prisma] resolve-postgres-failed-migration warning:", msg.slice(0, 500));
  }
}

// SQLite + migrations: migrate deploy MUST run before db push. A prior db push syncs the full
// schema without writing _prisma_migrations, so migrate deploy then hits P3005 ("schema is not empty").
if (hasMigrations) {
  if (schemaIsPostgres) {
    resolvePostgresFailedMigrationsBeforeDeploy();
  }
  console.log("[prisma] migrate deploy");
  try {
    runMigrateDeploy(schemaPath);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("P3009") || (schemaIsPostgres && msg.includes("P3018"))) {
      if (schemaIsPostgres) {
        const code = msg.includes("P3009") ? "P3009" : "P3018";
        try {
          tryResolvePostgresFailedMigrationAndRedeploy(schemaPath, msg, code);
        } catch (retryErr) {
          const failedName = parseFailedMigrationName(msg);
          console.error(`[prisma] ${code} persists after auto-resolve. Manual Render Shell:`);
          console.error(
            `  node scripts/resolve-postgres-failed-migration.mjs --name=${failedName || "20260707140000_extend_payment_stripe_journey"}`,
          );
          console.error("  npx prisma migrate deploy --schema prisma/postgres/schema.prisma");
          throw retryErr;
        }
      } else {
        console.error(
          "[prisma] P3009 - a migration is recorded as failed. Do not ignore; fix history then redeploy.",
        );
        const schemaFlag = schemaPath.replace(/\\/g, "/");
        console.error(
          "[prisma] SQLite (local dev): if the migration SQL already applied (e.g. after db push):",
        );
        console.error(
          `  npx prisma migrate resolve --applied <failed_migration_name> --schema=${schemaFlag}`,
        );
        console.error(
          "[prisma] If it truly failed mid-way (preserve DB): prisma migrate resolve --rolled-back <name> --schema=... then migrate deploy (verify schema first).",
        );
      }
    } else if (
      msg.includes("P3005") ||
      msg.includes("database schema is not empty")
    ) {
      console.error(
        "[prisma] P3005 - DB has tables but no migration history (often from an old bootstrap that ran db push first).",
      );
      console.error("  Fix (dev, data disposable): back up the file, delete the SQLite DB, restart the API.");
      console.error(`  Or baseline: https://pris.ly/d/migrate-baseline  (schema: ${schemaPath})`);
      console.error(
        "  Do not run prisma db push --accept-data-loss on a DB you need to keep without a backup.",
      );
      process.exit(1);
    } else if (
      !schemaIsPostgres &&
      (msg.includes("P3018") || msg.includes("already exists")) &&
      schemaPath.replace(/\\/g, "/").includes("prisma/schema.prisma")
    ) {
      console.warn(
        "[prisma] P3018 — legacy migration collides with db-push baseline; batch-resolving",
      );
      try {
        const script = path.join(rootDir, "scripts", "resolve-legacy-baseline.mjs");
        const schemaFlag = schemaPath.replace(/\\/g, "/");
        execSync(`node ${script} --apply --schema=${schemaFlag} --deploy`, {
          stdio: "inherit",
          env: prismaChildEnv(),
          shell: true,
        });
        console.log("[prisma] migrate deploy succeeded after legacy baseline resolve");
      } catch (retryErr) {
        console.error("[prisma] legacy baseline resolve failed. Manual fix:");
        console.error("  node scripts/resolve-legacy-baseline.mjs --apply --deploy");
        throw retryErr;
      }
    } else if (
      !schemaIsPostgres &&
      isSqliteLockOutput(msg) &&
      tryContinueSqliteMigrateDeployDespiteLock(schemaPath, msg)
    ) {
      /* continue bootstrap */
    } else {
      if (!schemaIsPostgres && isSqliteLockOutput(msg)) {
        const dbHint = (() => {
          try {
            const url = pickDatabaseUrlForPrisma() || "";
            const m = url.match(/file:([^?]+)/i);
            return m ? path.basename(m[1]) : "prod.db";
          } catch {
            return "prod.db";
          }
        })();
        console.error(
          `[prisma] sqlite locked during migrate deploy — stop holders of ${dbHint} then retry:`,
        );
        console.error(
          "  - Other node.exe (npm start / old nodemon / tests)  -  npx prisma studio  -  port 3001: netstat -ano | findstr :3001",
        );
      }
      console.error("[prisma] migrate deploy failed:", msg.slice(0, 2000));
      process.exit(1);
    }
  }
}

if (!isPostgresForRestore) {
  // SQLite: restore MissionBlackboard table without `prisma db push`.
  // `db push --accept-data-loss` can fail (or be risky) when unrelated schema drift exists (e.g. NOT NULL changes),
  // and it is not required just to create MissionBlackboard.
  try {
    runPrisma(
      "create MissionBlackboard table",
      `node ${path.join(rootDir, "scripts", "create-mission-blackboard-table.mjs")}`,
    );
    console.log("[prisma] MissionBlackboard table ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure MissionBlackboard (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure product catalog columns",
      `node ${path.join(rootDir, "scripts", "ensure-product-catalog-columns.mjs")}`,
    );
    runPrisma(
      "record product catalog migration",
      `node ${path.join(rootDir, "scripts", "record-sqlite-migration.mjs")} 20260611120000_product_catalog_item_type`,
    );
    console.log("[prisma] Product catalog columns ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure Product catalog columns (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure content interaction tables",
      `node ${path.join(rootDir, "scripts", "ensure-content-interaction-tables.mjs")}`,
    );
    runPrisma(
      "record content interaction migration",
      `node ${path.join(rootDir, "scripts", "record-sqlite-migration.mjs")} 20260612200000_add_content_interaction_metrics`,
    );
    console.log("[prisma] Content interaction tables ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure ContentInteraction tables (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure user signal preferences table",
      `node ${path.join(rootDir, "scripts", "ensure-user-signal-preferences-table.mjs")}`,
    );
    runPrisma(
      "record user signal preferences migration",
      `node ${path.join(rootDir, "scripts", "record-sqlite-migration.mjs")} 20260612100000_add_user_signal_preferences`,
    );
    console.log("[prisma] user_signal_preferences table ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure user_signal_preferences table (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure business seed table",
      `node ${path.join(rootDir, "scripts", "ensure-business-seed-table.mjs")}`,
    );
    runPrisma(
      "record business seed migration",
      `node ${path.join(rootDir, "scripts", "record-sqlite-migration.mjs")} 20260619120000_add_business_seed_table`,
    );
    console.log("[prisma] Business seed table ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure business_seed table (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure performer session context table",
      `node ${path.join(rootDir, "scripts", "ensure-performer-session-context-table.mjs")}`,
    );
    runPrisma(
      "record performer session context migration",
      `node ${path.join(rootDir, "scripts", "record-sqlite-migration.mjs")} 20260625140000_add_performer_session_context`,
    );
    console.log("[prisma] Performer session context table ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure performer_session_contexts table (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }

  try {
    runPrisma(
      "ensure business commerce columns",
      `node ${path.join(rootDir, "scripts", "ensure-business-commerce-columns.mjs")}`,
    );
    console.log("[prisma] Business commerce columns ensured");
  } catch (e) {
    console.warn(
      "[prisma] Could not ensure Business commerce columns (non-fatal):",
      e?.message?.slice(0, 200),
    );
  }
}

(async () => {
  try {
    if (!hasMigrations) {
      console.warn(
        "[prisma] no migration folders in prisma/migrations — using db push. Commit migrations (see .gitignore) so production uses migrate deploy.",
      );
      const devices = await getDeviceCountSafely();
      if (devices > 0) {
        console.error(
          "[prisma] SAFETY: DB has devices - refusing db push to prevent data loss",
        );
        process.exit(1);
      }
      console.log("[prisma] db push");
      runPrisma(
        "db push",
        `npx prisma db push --schema=${schemaPath} --skip-generate`,
      );
    }
    console.log("[prisma] bootstrap ok");
  } catch (e) {
    console.error("[prisma] bootstrap failed", e);
    process.exit(1);
  }
})().catch((e) => {
  console.error("[prisma] bootstrap failed", e);
  process.exit(1);
});


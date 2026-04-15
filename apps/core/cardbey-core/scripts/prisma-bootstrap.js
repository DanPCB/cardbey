// scripts/prisma-bootstrap.js
// Prefers `prisma migrate deploy` when prisma/migrations is present in the repo.
// SQLite: after dropping MissionBlackboard (legacy JSONB DDL), a one-shot db push
// --accept-data-loss recreates it; migrate deploy alone may not. No-migrations push
// still refuses when Device rows exist.
// P3005: exit with instructions — do not push over a non-empty DB without migration history.
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

/** Child env: CI helps Prisma stay non-interactive on Render. */
function prismaChildEnv() {
  return { ...process.env, CI: process.env.CI || "true" };
}

function sleepSync(seconds) {
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore", shell: true });
  } catch {
    /* Windows / minimal images — skip delay */
  }
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

/** Run migrate deploy; on failure attach stderr/stdout for P3005 detection. */
function runMigrateDeploy(schemaPath) {
  try {
    const stdout = execSync(`npx prisma migrate deploy --schema=${schemaPath}`, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["inherit", "pipe", "pipe"],
      env: prismaChildEnv(),
      shell: true,
    });
    if (stdout) process.stdout.write(stdout);
  } catch (e) {
    const toStr = (x) => (Buffer.isBuffer(x) ? x.toString("utf8") : String(x ?? ""));
    if (e.stdout) process.stdout.write(toStr(e.stdout));
    if (e.stderr) process.stderr.write(toStr(e.stderr));
    const combined = `${toStr(e.stderr)}${toStr(e.stdout)}${e.message || ""}`;
    const err = new Error(combined);
    err.original = e;
    throw err;
  }
}

/** Old bad deploys created MissionBlackboard with Postgres JSONB DDL in SQLite; SQLite cannot parse it — drop so push/migrate can proceed. */
function dropSqliteMissionBlackboardIfNeeded(schemaPath) {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")) return;
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
    const { PrismaClient } = await import("@prisma/client");
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

function resolvePrismaSchemaPath() {
  const dbUrl = String(process.env.DATABASE_URL || "").trim();
  if (dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")) {
    const postgresSchema = path.join(rootDir, "prisma", "postgres", "schema.prisma");
    if (fs.existsSync(postgresSchema)) return postgresSchema;
  }
  if (fs.existsSync(path.join(rootDir, "prisma", "sqlite", "schema.prisma"))) {
    return path.join(rootDir, "prisma", "sqlite", "schema.prisma");
  }
  return path.join(rootDir, "prisma", "schema.prisma");
}

const schemaPath = resolvePrismaSchemaPath();
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
console.log("[prisma] migrations dir:", migrationsDir, "hasMigrations:", hasMigrations);

dropSqliteMissionBlackboardIfNeeded(schemaPath);

const dbUrlForRestore = String(process.env.DATABASE_URL || "").trim();
const isPostgresForRestore =
  dbUrlForRestore.startsWith("postgresql://") || dbUrlForRestore.startsWith("postgres://");

// SQLite + migrations: migrate deploy MUST run before db push. A prior db push syncs the full
// schema without writing _prisma_migrations, so migrate deploy then hits P3005 ("schema is not empty").
if (hasMigrations) {
  console.log("[prisma] migrate deploy");
  try {
    runMigrateDeploy(schemaPath);
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("P3009")) {
      console.error(
        "[prisma] P3009 - a migration is recorded as failed. Do not ignore; fix history then redeploy.",
      );
      console.error(
        "[prisma] SQLite (local dev): if the migration SQL already applied (e.g. after db push):",
      );
      console.error(
        `  npx prisma migrate resolve --applied 20260309234049_init --schema=${schemaPath.replace(/\\/g, "/")}`,
      );
      console.error(
        "[prisma] If it truly failed mid-way (preserve DB): prisma migrate resolve --rolled-back <name> --schema=... then migrate deploy (verify schema first).",
      );
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
    } else {
      console.error("[prisma] migrate deploy failed:", msg.slice(0, 2000));
      process.exit(1);
    }
  }
}

if (!isPostgresForRestore) {
  try {
    runPrisma(
      "db push (MissionBlackboard restore)",
      `npx prisma db push --schema=${schemaPath} --skip-generate --accept-data-loss`,
    );
    console.log("[prisma] MissionBlackboard table restored");
  } catch (e) {
    console.warn(
      "[prisma] Could not restore MissionBlackboard (non-fatal):",
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


/**
 * postinstall / build: generate Prisma client for the schema matching DATABASE_URL.
 */
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickDatabaseUrlForPrisma, resolvePrismaSchemaPath } from "./prismaSchemaPath.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolvePrismaSchemaPath();
const databaseUrl = pickDatabaseUrlForPrisma();

console.log("[prisma-generate] schema:", schemaPath);
if (databaseUrl) {
  const scheme = databaseUrl.split(":")[0];
  console.log("[prisma-generate] DATABASE_URL scheme:", scheme);
}

function releaseWindowsPrismaQueryEngineLocks() {
  if (process.platform !== "win32") return;
  try {
    execSync(
      'powershell -NoProfile -Command "Get-Process -Name query-engine-windows -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"',
      { stdio: "ignore" },
    );
  } catch {
    /* non-fatal */
  }
}

const cmd = `npx prisma generate --schema=${schemaPath}`;
const env = {
  ...process.env,
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
};

releaseWindowsPrismaQueryEngineLocks();
for (let attempt = 1; attempt <= 3; attempt++) {
  const r = spawnSync(cmd, { encoding: "utf8", stdio: "inherit", env, shell: true });
  if (r.status === 0) process.exit(0);
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (
    process.platform === "win32" &&
    combined.includes("EPERM: operation not permitted, rename") &&
    attempt < 3
  ) {
    console.warn(`[prisma-generate] Windows query-engine lock (attempt ${attempt}/3); retrying...`);
    releaseWindowsPrismaQueryEngineLocks();
    continue;
  }
  process.exit(r.status ?? 1);
}

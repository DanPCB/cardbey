/**
 * Resolve Prisma schema path from DATABASE_URL / POSTGRES_DATABASE_URL.
 * Shared by prisma-bootstrap.js and postinstall generate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(__dirname, "..");

/**
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isPostgresDatabaseUrl(url) {
  const u = String(url ?? "").trim().toLowerCase();
  if (!u) return false;
  return (
    u.startsWith("postgres") ||
    u.startsWith("prisma://") ||
    u.startsWith("prisma+postgres://")
  );
}

/**
 * Prefer explicit postgres URL when DATABASE_URL is still SQLite (common staging misconfig).
 * @returns {string}
 */
export function pickDatabaseUrlForPrisma() {
  const primary = String(process.env.DATABASE_URL ?? "").trim();
  const fallback = String(process.env.POSTGRES_DATABASE_URL ?? "").trim();
  if (isPostgresDatabaseUrl(primary)) return primary;
  if (isPostgresDatabaseUrl(fallback)) return fallback;
  return primary || fallback;
}

/**
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resolvePrismaSchemaPath(rootDir = packageRoot) {
  const urlForDetection = pickDatabaseUrlForPrisma();
  const isPostgres = isPostgresDatabaseUrl(urlForDetection);

  if (isPostgres) {
    const postgresSchema = path.join(rootDir, "prisma", "postgres", "schema.prisma");
    if (fs.existsSync(postgresSchema)) return postgresSchema;
  }

  const sqliteSchema = path.join(rootDir, "prisma", "sqlite", "schema.prisma");
  if (fs.existsSync(sqliteSchema)) return sqliteSchema;

  return path.join(rootDir, "prisma", "schema.prisma");
}

/**
 * @returns {boolean}
 */
export function isRenderProduction() {
  const onRender = !!(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
  return onRender && process.env.NODE_ENV === "production";
}

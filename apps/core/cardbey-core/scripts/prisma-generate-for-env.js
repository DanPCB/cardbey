/**
 * postinstall / build: generate Prisma client for the schema matching DATABASE_URL.
 */
import { execSync } from "node:child_process";
import { pickDatabaseUrlForPrisma, resolvePrismaSchemaPath } from "./prismaSchemaPath.js";

const schemaPath = resolvePrismaSchemaPath();
const databaseUrl = pickDatabaseUrlForPrisma();

console.log("[prisma-generate] schema:", schemaPath);
if (databaseUrl) {
  const scheme = databaseUrl.split(":")[0];
  console.log("[prisma-generate] DATABASE_URL scheme:", scheme);
}

execSync(`npx prisma generate --schema=${schemaPath}`, {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
  },
  shell: true,
});

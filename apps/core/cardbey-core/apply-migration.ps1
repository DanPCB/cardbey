# Safe Device / schema migration helper.
# Prefer focused migrate deploy with an explicit --schema.
# Does NOT run db push --accept-data-loss.

Write-Host "Validating SQLite schema..." -ForegroundColor Yellow
npx prisma validate --schema prisma/sqlite/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Validating Postgres schema..." -ForegroundColor Yellow
npx prisma validate --schema prisma/postgres/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Guarding Device Phase 1 migration SQL..." -ForegroundColor Yellow
node scripts/prisma-migration-diff-guard.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying SQLite migrations (explicit schema)..." -ForegroundColor Yellow
$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "file:../dev.db" }
npx prisma migrate deploy --schema prisma/sqlite/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Regenerating Prisma client (sqlite / client-gen)..." -ForegroundColor Yellow
npx prisma generate --schema prisma/sqlite/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Auditing Device.installationId..." -ForegroundColor Yellow
node scripts/audit-device-installation-id-migration.mjs
Write-Host "Done. Restart the server if it was running." -ForegroundColor Green

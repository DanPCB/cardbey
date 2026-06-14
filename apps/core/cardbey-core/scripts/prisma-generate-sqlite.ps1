# Prisma generate for SQLite schema. Works around EPERM on Windows by removing
# the query engine DLL before generate (so Prisma creates a new file instead of rename).
# Close API server and any test runs before running.
$schema = "prisma/sqlite/schema.prisma"
$clientGen = "node_modules/.prisma/client-gen"

if (-not (Test-Path $clientGen)) {
  New-Item -ItemType Directory -Force -Path $clientGen | Out-Null
}

# Remove existing engine binaries and any .tmp copies so Prisma can write fresh (avoids rename EPERM)
$engineNames = @(
  "query_engine-windows.dll.node",
  "query-engine-windows.exe"
)
$removed = $false
foreach ($engineName in $engineNames) {
  $enginePath = Join-Path $clientGen $engineName
  $tmpPattern = Join-Path $clientGen "$engineName.tmp*"
  if (Test-Path $enginePath) {
    try {
      Remove-Item -LiteralPath $enginePath -Force -ErrorAction Stop
      $removed = $true
      Write-Host "[prisma-generate] Removed existing $engineName so Prisma can create a new one."
    } catch {
      Write-Warning "Could not remove $enginePath - it is likely in use. Close API server, tests, and Cursor/VS Code, then run this script again from a new PowerShell window."
      exit 1
    }
  }
  Get-ChildItem -Path $tmpPattern -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "[prisma-generate] Running prisma generate --schema $schema ..."
& npx prisma generate --schema $schema
if ($LASTEXITCODE -ne 0) {
  Write-Error "prisma generate failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}
Write-Host "[prisma-generate] Done."
exit 0

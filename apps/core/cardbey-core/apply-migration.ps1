# PowerShell script to apply database migration
# Run this after stopping your server

Write-Host "Applying database schema changes..." -ForegroundColor Yellow

# Apply schema changes (this will add missing columns)
npx prisma db push --accept-data-loss

Write-Host "Regenerating Prisma client..." -ForegroundColor Yellow
npx prisma generate

Write-Host "Done! You can now restart your server." -ForegroundColor Green




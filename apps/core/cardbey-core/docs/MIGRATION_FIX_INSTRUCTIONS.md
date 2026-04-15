# Migration Fix Instructions

## Current Error
```
The column `main.Business.translations` does not exist in the current database.
```

## Cause
The Prisma schema has been updated with new fields (`translations` on Business, Product, Playlist, SignageAsset, and `CreativeTemplate` model), but the database migration hasn't been applied yet.

## Solution

**You need to stop your development server first**, then run these commands:

### Option 1: Using Prisma Migrate (Recommended)

```bash
# 1. Stop your server (Ctrl+C)

# 2. Apply the migration
npx prisma migrate deploy

# OR if that doesn't work, use:
npx prisma db push

# 3. Regenerate Prisma client
npx prisma generate

# 4. Restart your server
npm run dev
```

### Option 2: Manual SQL Application

If the above doesn't work, you can apply the migration SQL directly:

1. Stop your server
2. Open your database (SQLite): `sqlite3 prisma/dev.db`
3. Run the SQL from `prisma/migrations/20250101000000_add_translations_and_templates/migration.sql`
4. Run `npx prisma generate`
5. Restart your server

### What the Migration Does

The migration adds:
- `translations` JSON field to `Business` table
- `translations` JSON field to `Product` table
- `translations` JSON field to `Playlist` table
- `translations` JSON field to `SignageAsset` table
- `templateId` field to `MIEntity` table (with unique constraint)
- Creates new `CreativeTemplate` table

### After Migration

Once the migration is applied:
- ✅ The error should be resolved
- ✅ Translation features will work
- ✅ Smart Template Picker will work
- ✅ All API endpoints should function normally

## Quick Check

After running the migration, verify it worked:

```bash
# Check migration status
npx prisma migrate status

# Should show all migrations as applied
```




# URGENT: Database Migration Fix

## Current Error
```
The column `main.Business.translations` does not exist in the current database.
```

## Quick Fix (2 steps)

### Step 1: Stop Your Server
Press `Ctrl+C` in the terminal where your server is running.

### Step 2: Run This Command
```powershell
npx prisma db push --accept-data-loss
```

This will:
- ✅ Add `translations` column to Business table
- ✅ Add `translations` column to Product table  
- ✅ Add `translations` column to Playlist table
- ✅ Add `translations` column to SignageAsset table
- ✅ Add `templateId` column to MIEntity table
- ✅ Create CreativeTemplate table (if not exists)
- ✅ Add all necessary indexes

### Step 3: Regenerate Prisma Client
```powershell
npx prisma generate
```

### Step 4: Restart Server
```powershell
npm run dev
```

## What `db push` Does

`prisma db push` directly syncs your Prisma schema with the database without creating migration files. It's perfect for development when you need to quickly apply schema changes.

**Note:** The `--accept-data-loss` flag is needed because we're adding unique constraints that might conflict with existing data (but since templateId is new, this should be safe).

## Alternative: If db push doesn't work

If you get errors, you can manually apply the SQL:

1. Stop server
2. Open database: `sqlite3 prisma/dev.db`
3. Run these commands one by one:

```sql
ALTER TABLE Business ADD COLUMN translations TEXT;
ALTER TABLE Product ADD COLUMN translations TEXT;
ALTER TABLE Playlist ADD COLUMN translations TEXT;
ALTER TABLE SignageAsset ADD COLUMN translations TEXT;
ALTER TABLE MIEntity ADD COLUMN templateId TEXT;
CREATE INDEX IF NOT EXISTS MIEntity_templateId_idx ON MIEntity(templateId);
CREATE UNIQUE INDEX IF NOT EXISTS MIEntity_templateId_key ON MIEntity(templateId) WHERE templateId IS NOT NULL;
```

4. Then run: `npx prisma generate`
5. Restart server

## Verification

After applying, the error should be gone and:
- ✅ User authentication should work
- ✅ Store loading should work  
- ✅ Translation features should work
- ✅ Smart Template Picker should work




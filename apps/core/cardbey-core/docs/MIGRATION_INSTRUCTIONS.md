# Migration Instructions: Add missingFile Field to Media

## Migration SQL

The migration file has been created at:
`prisma/migrations/20251124102215_add_media_missing_file_flag/migration.sql`

### SQL to Apply

```sql
-- AlterTable
ALTER TABLE "Media" ADD COLUMN "missingFile" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Media_missingFile_idx" ON "Media"("missingFile");
```

## Option 1: Apply via Prisma on Render (Recommended)

When deploying to Render with `DATABASE_URL` configured:

```bash
npx prisma migrate deploy
```

This will automatically apply any pending migrations.

## Option 2: Apply SQL Manually

If you prefer to apply the migration manually:

1. Connect to your PostgreSQL database
2. Run the SQL statements above
3. Verify with:
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'Media' AND column_name = 'missingFile';
   ```

## Option 3: Generate Migration on Server

If migrations aren't being tracked in git, you can generate it fresh on the server:

```bash
# On Render (or wherever DATABASE_URL is set)
npx prisma migrate dev --name add_media_missing_file_flag
```

## Verification

After applying the migration, verify it worked:

```sql
-- Check if column exists
\d "Media"  -- in psql
-- or
SELECT * FROM "Media" LIMIT 1;  -- should include missingFile column
```

## Notes

- The migration adds a `missingFile` boolean field with default `false`
- An index is created for efficient queries
- Existing records will automatically have `missingFile = false`
- The scanner script will update this field based on file existence


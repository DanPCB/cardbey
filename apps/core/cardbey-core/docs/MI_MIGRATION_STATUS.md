# MIEntity Migration Status

## Current Situation

The `MIEntity` model exists in `prisma/schema.prisma`, but **no migration folder exists** for it.

**Expected location:** `prisma/migrations/<timestamp>_add_mi_entity/`

**Actual status:** The `prisma/migrations/` directory is empty.

## How It Was Added

The MIEntity model was likely added to the schema using `prisma db push` instead of `prisma migrate dev`, which is why no migration folder exists.

## Options

### Option 1: Create Migration Now (Recommended)

If you want to create a proper migration for the MIEntity model:

```powershell
cd apps/core/cardbey-core
npx prisma migrate dev --name add_mi_entity
```

This will:
- Create a migration folder: `prisma/migrations/<timestamp>_add_mi_entity/`
- Generate the SQL migration file
- Apply it to your database (if not already applied)

**Note:** If the table already exists in your database, Prisma will detect this and create an empty migration or mark it as already applied.

### Option 2: Keep Using db push (Current State)

If you're using `prisma db push` for development, you can continue without migrations. However, migrations are recommended for:
- Version control
- Production deployments
- Team collaboration
- Rollback capabilities

### Option 3: Create Baseline Migration

If the table already exists, create a baseline migration:

```powershell
cd apps/core/cardbey-core
npx prisma migrate dev --create-only --name add_mi_entity
```

Then manually edit the migration SQL file to match your current database state, or use:

```powershell
npx prisma migrate resolve --applied add_mi_entity
```

## Verify Current State

Check if the MIEntity table exists in your database:

```powershell
# Using Prisma Studio
npx prisma studio

# Or check via SQL
# The table should be named "MIEntity" (Prisma uses the exact model name for SQLite)
```

## Migration Folder Structure

If you create the migration, it will look like:

```
prisma/
  migrations/
    <timestamp>_add_mi_entity/
      migration.sql          # SQL to create the MIEntity table
```

Example timestamp format: `20240115123456_add_mi_entity`

## Recommendation

Since you're in development and the model is already working, you have two choices:

1. **Create migration now** - Good for version control and future deployments
2. **Continue without migration** - Fine for development, but you'll need migrations for production

If you want to create the migration, run:
```powershell
cd apps/core/cardbey-core
npx prisma migrate dev --name add_mi_entity
```

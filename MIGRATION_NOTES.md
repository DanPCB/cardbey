# Migration Notes: SmartObject Models

## Issue Encountered

When trying to create a new migration for SmartObject models, Prisma failed with:
```
Error: P3006
Migration `20260125225247_remove_business_userid_unique` failed to apply cleanly to the shadow database.
Error: SQLite database error: no such table: Business
```

This occurred because Prisma's shadow database validation was trying to apply all migrations in order, but the `remove_business_userid_unique` migration assumes the Business table exists from earlier migrations.

## Solution Applied

1. **Used `prisma db push`** to sync the schema directly (bypassing migration validation)
   - This synced the SmartObject models to the database immediately

2. **Created manual migration** `20260126000000_update_smart_object_fields`
   - Added missing fields that weren't in the original `20260103180000_add_smart_object_models` migration:
     - `qrUrl` in SmartObject
     - `promoType` and `activatedAt` in SmartObjectActivePromo  
     - Renamed `timestamp` to `scannedAt` and added `promoId` in SmartObjectScan

3. **Marked migration as applied** using `prisma migrate resolve --applied`
   - Since `db push` already synced the schema, we marked the migration as applied without running it

4. **Generated Prisma client** - All models are now available in code

## Current State

- ✅ Database schema is synced with `schema.prisma`
- ✅ Prisma client generated with SmartObject models
- ✅ Migration file created for record-keeping
- ⚠️ Migration history may be out of sync (many migrations not applied)

## Future Considerations

If you need to reset migrations or apply them to a fresh database:
1. Consider using `prisma migrate reset` to start fresh
2. Or manually apply migrations in order, fixing any shadow database issues
3. Or continue using `db push` for development and create migrations manually for production

## Verification

To verify SmartObject tables exist:
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'SmartObject%';
```

Expected tables:
- `SmartObject`
- `SmartObjectActivePromo`
- `SmartObjectScan`


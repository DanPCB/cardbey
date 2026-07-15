# Device.installationId — Phase 3 uniqueness plan (Phase 2 is duplicate cleanup)

## Status

- **Phase 1 (now):** nullable `installationId` + non-unique `Device_installationId_idx`
- **Phase 2:** audit/report + manual/safe archive of duplicates (no unique yet)
- **Phase 3:** add unique constraint only when preflight passes

## Preconditions for uniqueness

All must be true:

1. No empty-string `installationId` rows (`TRIM(installationId) = ''`)
2. No duplicate non-null `installationId` groups
3. All known duplicate groups resolved (`safe_to_merge` archived or merged with authorization)
4. Runtime always uses `normalizeInstallationId` → NULL for blanks/sentinels
5. Release / claim / reassign preserve installation identity
6. `npm run prisma:device:audit` exits 0 on production
7. `npm run prisma:device:dup-report` shows 0 groups

## Future schema (do not apply yet)

```prisma
installationId String? @unique
```

## Future SQL (Postgres example)

```sql
-- Preflight must fail the migration if duplicates remain.
CREATE UNIQUE INDEX "Device_installationId_key"
ON "Device"("installationId");
```

SQLite equivalent after cleanup:

```sql
CREATE UNIQUE INDEX "Device_installationId_key"
ON "Device"("installationId");
```

The Phase 3 migration must run the duplicate COUNT query and abort if `HAVING COUNT(*) > 1` returns rows.

## Do not

- Add `@unique` in Phase 1/2 schemas
- Blindly backfill from name/model/IP/store/account
- Auto-merge cross-account duplicate groups

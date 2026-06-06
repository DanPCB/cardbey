# SQLite schema drift log

Tracks Prisma schema changes that are defined in `prisma/sqlite/schema.prisma` but not yet applied via checked-in migration SQL.

| Model / change | Status | Notes |
|----------------|--------|-------|
| `Booking` model | Missing from SQLite DB | Add migration `add_booking_model` — relation on `Business.bookings`. Run `npx prisma migrate dev` or `db:push` when ready. |

After applying locally:

```bash
cd apps/core/cardbey-core
npx prisma generate --schema prisma/sqlite/schema.prisma
# optional: npm run db:push:test  # refresh test.db
```

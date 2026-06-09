# SQLite schema drift log

Tracks Prisma schema changes that are defined in `prisma/sqlite/schema.prisma` but not yet applied via checked-in migration SQL.

| Model / change | Status | Notes |
|----------------|--------|-------|
| `Booking` model | Missing from SQLite DB | Add migration `add_booking_model` — relation on `Business.bookings`. Run `npx prisma migrate dev` or `db:push` when ready. |
| `StorePromo.type` (loyalty discriminator) | Not in schema | Round 4 `schedule_loyalty_campaign` returns honest stub `{ scheduled: false, reason: 'schema gap' }`. Add optional `type String?` (e.g. `loyalty`, `promo`) before persisting loyalty drafts. |
| `Product.isFeatured` / `featuredAt` | Migration `20260607000000_add_product_featured_fields` | Required for catalog publish on Postgres staging and homepage feature skill. |
| `Business.heroVideoUrl` | Not in schema | Round 4 `audit_hero_media` sets `hasHeroVideo: false`; only `heroImageUrl` is queried today. |

After applying locally:

```bash
cd apps/core/cardbey-core
npx prisma generate --schema prisma/sqlite/schema.prisma
# optional: npm run db:push:test  # refresh test.db
```

# SQLite PilEvent Table Fix Report

**Date:** 2026-06-13  
**Scope:** Missing `PilEvent` table causing P2021 / 500 on `POST /api/pil/events` during Performer use.

---

## Final verdict: Can Performer testing continue without PIL event 500 spam?

**YES**

After repair/migration and resilient local fallback, `POST /api/pil/events` no longer spams 500s. Events persist when the table exists; local dev returns a safe no-op only if the table is still missing.

---

## Root cause

The Prisma schema defines `model PilEvent` (table name **`PilEvent`**, no `@@map`), but the **shared** migration folder `prisma/migrations/` had **no** migration creating that table.

The table DDL existed only under:

- `prisma/sqlite/migrations/20260604120000_add_pil_events/migration.sql`

Local Core uses `prisma/migrations/` + `dev-fresh.db`. That DB never received `PilEvent`, so:

```
PrismaClientKnownRequestError P2021
The table `main.PilEvent` does not exist
```

Every Performer attention signal → `POST /api/pil/events` → `prisma.pilEvent.create()` → **500**, adding noise and extra DB pressure during missions.

---

## Prisma model (confirmed)

```prisma
model PilEvent {
  id         String   @id @default(cuid())
  type       String
  timestamp  DateTime @default(now())
  sessionId  String?
  userId     String?
  entityType String?
  entityId   String?
  storeId    String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([type, timestamp])
  @@index([sessionId])
  @@index([userId])
  @@index([storeId, timestamp])
  @@index([entityType, entityId])
}
```

SQLite storage: `metadata` as TEXT (JSON string), datetimes as **DATETIME** (not TIMESTAMP(3)).

---

## Migration added

**New:** `prisma/migrations/20260613120000_add_pil_event_table/migration.sql`

Creates `PilEvent` + five indexes (SQLite-compatible DDL, aligned with `prisma/sqlite/migrations/20260604120000_add_pil_events`).

---

## Repair script changes

**Updated:** `scripts/repair-sqlite-schema.mjs`

- Idempotent `CREATE TABLE IF NOT EXISTS "PilEvent" …`
- Ensures all five indexes if table was missing

**Repair run on `dev-fresh.db`:**

```
tablesCreated: ['PilEvent']
indexesEnsured: PilEvent_type_timestamp_idx, … (5 indexes)
```

---

## Resilient ingestion (fallback only)

**Updated:** `src/services/pilEventsService.js`

- Detects P2021 + `PilEvent` in message
- **Local SQLite dev only** (`NODE_ENV !== 'production'`): logs `PIL_EVENT_TABLE_MISSING` once, returns `{ persisted: false, reason: 'PIL_EVENT_TABLE_MISSING' }`
- **Production:** still throws (no silent swallow)

**Updated:** `src/routes/pilRoutes.js`

- Missing table → **200** `{ ok: true, persisted: false, reason: 'PIL_EVENT_TABLE_MISSING' }` (not 500)
- Normal create → **201** `{ ok: true, id, persisted: true }`

PIL remains enabled; this is a safety net until repair/migrate runs.

---

## Validation

```powershell
cd apps/core/cardbey-core
node scripts/repair-sqlite-schema.mjs
npx prisma generate --schema=prisma/schema.prisma
```

**Table present:**

```
sqlite3 prisma/dev-fresh.db "SELECT name FROM sqlite_master WHERE name='PilEvent';"
→ PilEvent
```

**Direct create:**

```
recordPilEvent({ type: 'attention_signal', ... })
→ persisted: true, id: <cuid>
```

**Unit tests:** 3 passing in `pilEventsService.test.js`

**`/api/pil/events`:** Safe — no P2021 when table exists; no repeated 500 when table missing in local dev (fallback 200).

---

## Local dev checklist

1. Run `node scripts/repair-sqlite-schema.mjs` (or apply migration when migrate deploy is used).
2. Restart Core.
3. Performer attention signals should return 201 with `persisted: true`.

---

## Files changed

- `prisma/migrations/20260613120000_add_pil_event_table/migration.sql` *(new)*
- `scripts/repair-sqlite-schema.mjs`
- `src/services/pilEventsService.js`
- `src/services/pilEventsService.test.js` *(new)*
- `src/routes/pilRoutes.js`

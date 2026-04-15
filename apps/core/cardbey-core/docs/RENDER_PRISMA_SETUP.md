# Render: Prisma stability for multi-service Cardbey

## 1. Prisma in `dependencies` (not devDependencies)

Render can skip installing `devDependencies`. This repo keeps Prisma in **dependencies** so it is always installed:

- `"@prisma/client": "^6.18.0"` — required at runtime.
- `"prisma": "^6.18.0"` — required for `prisma generate` and `prisma migrate deploy` in build/start.

Do **not** move these to `devDependencies`.

## 2. Migrations run on startup

**Start** is `npm start`, which runs **prestart** first. The prestart script (`scripts/prisma-bootstrap.js`) runs in order:

1. `prisma generate` (so the client exists).
2. `prisma migrate deploy` if the `prisma/migrations` folder has migrations; otherwise `prisma db push` (e.g. SQLite).

So migrations (or schema sync) run **before** the server starts. Use **Start Command** = `npm start` on Render.

## 3. Prisma client not initialized

**Symptom:** `Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.`

**Cause:** The server started before the client was generated, or generate used a schema path that doesn’t exist in the deploy.

**Fix:**

- **Build / postinstall** use `prisma/schema.prisma`, so `prisma generate` runs during build.
- **Start Command:** `npm start` so prestart runs bootstrap (generate + migrate/push).

**Render dashboard:**

- **Build Command:** `npm install` or `npm install && npm run build`.
- **Start Command:** `npm start`.

## 4. Optional: Prisma engine logging (debugging)

To log queries and engine messages in production, set in Render **Environment**:

- **Key:** `PRISMA_LOG`
- **Value:** `query,info,warn,error`

The app reads `PRISMA_LOG` and, when set, passes those levels to `PrismaClient({ log: [...] })`. Omit or leave empty for default (error-only in production).

# Render: Prisma stability for multi-service Cardbey

## 1. Prisma in `dependencies` (not devDependencies)

Render can skip installing `devDependencies`. This repo keeps Prisma in **dependencies** so it is always installed:

- `"@prisma/client": "^6.18.0"` — required at runtime.
- `"prisma": "^6.18.0"` — required for `prisma generate` and `prisma migrate deploy` in build/start.

Do **not** move these to `devDependencies`.

## 2. Migrations run on startup

**Pre-deploy** (Render Blueprint `preDeployCommand`): `node scripts/prisma-bootstrap.js` — runs with `DATABASE_URL` available, resolves `prisma/postgres/schema.prisma` when the URL is Postgres, then `prisma generate` + `prisma migrate deploy` (or SQLite `db push` locally).

**Start** is `npm start`, which runs **prestart** (`scripts/prisma-bootstrap.js` again — idempotent) then the server.

**Build / postinstall** use `node scripts/prisma-generate-for-env.js` (not hardcoded `prisma/schema.prisma`).

## 3. Prisma client not initialized

**Symptom:** `Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.`

**Cause:** The server started before the client was generated, or generate used a schema path that doesn’t exist in the deploy.

**Fix:**

- **Build / postinstall** use `scripts/prisma-generate-for-env.js`, so `prisma generate` uses the schema matching `DATABASE_URL` / `POSTGRES_DATABASE_URL` when set at build time.
- **Start Command:** `npm start` so prestart runs bootstrap (generate + migrate/push).

**Render dashboard:**

- **Build Command:** `npm install` or `npm install && npm run build`.
- **Start Command:** `npm start`.

## 4. Render Shell: migrate resolve / manual Prisma

`npx prisma … --schema prisma/postgres/schema.prisma` reads **`DATABASE_URL`**. If that variable is `file:…` (SQLite) or empty, you get **P1012** (“URL must start with postgresql://”).

**Diagnose on Shell:**

```bash
echo "DATABASE_URL=${DATABASE_URL:0:40}"
echo "POSTGRES_DATABASE_URL=${POSTGRES_DATABASE_URL:0:40}"
```

**Use the wrapper (prefers `POSTGRES_DATABASE_URL`, then a postgres `DATABASE_URL`):**

```bash
cd ~/project/src/apps/core/cardbey-core   # or your Render rootDir path

node scripts/run-postgres-prisma.js migrate resolve \
  --rolled-back 20260301000000_baseline_postgres
```

**Or set the URL once** (Internal Database URL from Render Postgres → Connect):

```bash
export DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DATABASE"
npx prisma migrate resolve --rolled-back 20260301000000_baseline_postgres \
  --schema prisma/postgres/schema.prisma
```

**Permanent fix:** In **cardbey-core-staging → Environment**, set `DATABASE_URL` to the **Internal** Postgres URL (not `file:`). Redeploy after changing.

## 5. Optional: Prisma engine logging (debugging)

To log queries and engine messages in production, set in Render **Environment**:

- **Key:** `PRISMA_LOG`
- **Value:** `query,info,warn,error`

The app reads `PRISMA_LOG` and, when set, passes those levels to `PrismaClient({ log: [...] })`. Omit or leave empty for default (error-only in production).

# Impact Report: Core staging port bind + worker resilience

Date: 2026-04-07  
Scope: `apps/core/cardbey-core` startup/worker behavior (staging deploy stability)

## (1) What could break

- **Background workers may start slightly later** (after `app.listen` binds the port).
- **Missing-table errors may be suppressed** (for Prisma “table does not exist” cases) to prevent crash loops; this can hide legitimate schema issues if relied on for alerts.
- **Order-of-operations changes** could impact assumptions in logs/monitoring (e.g., worker “starting” logs after “listening” log).

## (2) Why

- Render health checks require the service to **bind its port quickly**. If the process crashes/restarts (e.g., unhandled Prisma errors in early workers), Render times out.
- Staging/test DBs can temporarily lack tables (schema not applied yet, wrong client/schema, or DB reset). Prisma commonly surfaces this as **`P2021`** or messages like “does not exist”.

## (3) Impact scope

- **cardbey-core staging**: startup reliability on Render, particularly when the DB is empty or schema is incomplete.
- Potentially **local/dev** if you run the same `ROLE=api` path with an incomplete DB.

## (4) Smallest safe patch

- Ensure the HTTP server **binds the port first**, then start workers (`offlineWatcher`, `deviceCleanup`, etc.) inside the listen callback.
- Wrap worker Prisma calls in `try/catch` and **skip silently** for `P2021` / “does not exist” to prevent crash loops.
- Do not change routes, migrations, or overall schema strategy in this pass.


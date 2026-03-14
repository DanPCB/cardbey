## Impact Report: Prisma bootstrap when `schema.prisma` is missing

**Context**

Render startup runs `scripts/prisma-bootstrap.js`, which:

- Imports `ensureDatabaseUrl` (normalizes `DATABASE_URL`, enforces non-ephemeral paths).
- Then runs either `npx prisma migrate deploy --schema=prisma/schema.prisma` (when migrations exist) or `npx prisma db push --schema=prisma/schema.prisma` (when no migrations are found).

In the current repo snapshot, **no `prisma/schema.prisma` file exists**, so **every startup fails** with:

- `Error: Could not load --schema from provided path prisma/schema.prisma: file or directory not found`
- `[prisma] bootstrap failed` and process exit code 1.

This prevents the service from starting even though the database file itself (pointed to by `DATABASE_URL`) is valid and usable.

---

### 1. What could break

- **Current behavior:** Service fails to boot on Render because `db push` is invoked with a non-existent schema path.
- **If we change nothing:** Service remains down; no traffic can be served.
- **If we change bootstrap incorrectly:** We could:
  - Accidentally run Prisma commands against the wrong database or schema.
  - Apply migrations or `db push` using an unintended schema file.
  - Mask a real schema drift problem by silently ignoring Prisma errors.

---

### 2. Why this is happening

- `scripts/prisma-bootstrap.js` unconditionally assumes the path `prisma/schema.prisma` exists:
  - It computes `const schema = "prisma/schema.prisma";`.
  - It **never checks** whether that file actually exists before calling `npx prisma ... --schema=${schema}`.
- In this repo, there is **no `schema.prisma` anywhere**, so Prisma immediately fails to load the schema file and exits with status 1.
- Because the script treats any error as fatal (`process.exit(1)`), the container never reaches the normal server startup.

---

### 3. Impact scope

- **Applies to:** Any environment that runs `scripts/prisma-bootstrap.js` (Render production, staging, or local bootstrap flows that use this script).
- **Does NOT change:**
  - `ensureDatabaseUrl` behavior or `DATABASE_URL` resolution.
  - Any application runtime logic, queries, or Prisma client usage.
  - Existing database contents or schema on disk.
- **Primary effect:** Whether startup fails hard when `schema.prisma` is missing.

---

### 4. Smallest safe patch

Goal: **Allow the service to start when there is no `prisma/schema.prisma` file**, while:

- Avoiding accidental schema changes.
- Making it obvious in logs that Prisma bootstrap was skipped.

**Proposed minimal change to `scripts/prisma-bootstrap.js`:**

1. Compute the absolute path for the schema file:
   - `const schemaPath = path.join(process.cwd(), schema);`
2. If **`schemaPath` does not exist**, before checking migrations:
   - Log a clear warning:
     - `[prisma] schema not found at <path>; skipping prisma bootstrap (no schema).`
     - Guidance for how to enable it in the future.
   - Log `[prisma] bootstrap ok (skipped: no schema)` and **exit 0**.
3. Only if the schema file exists do we proceed with:
   - `migrate deploy` when migrations exist, or
   - `db push` when there are no migrations.

This patch:

- **Prevents** Prisma from being called with an invalid `--schema` path.
- **Keeps** the existing behavior for environments that do provide a `prisma/schema.prisma` file and migrations.
- **Does not modify** any database contents by itself; it only changes whether bootstrap fails in the “no schema file” case.


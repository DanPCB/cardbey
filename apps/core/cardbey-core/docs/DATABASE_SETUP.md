# Database Setup Guide

## Quick Fix: Set DATABASE_URL Environment Variable

The Prisma schema requires a `DATABASE_URL` environment variable. You have two options:

---

## Option 1: Use PostgreSQL (Recommended for Production)

### For Local Development

If you have PostgreSQL installed locally:

1. Create a `.env` file in the project root:
   ```bash
   DATABASE_URL=postgresql://postgres:password@localhost:5432/cardbey
   ```

2. Create the database:
   ```sql
   CREATE DATABASE cardbey;
   ```

### For Cloud (Render/Supabase/etc.)

Use your cloud database connection string:
```bash
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

---

## Option 2: Use SQLite for Local Development (Quickest)

If you don't have PostgreSQL installed, you can temporarily switch to SQLite:

### Step 1: Update `prisma/schema.prisma`

Change the datasource from PostgreSQL to SQLite:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

### Step 2: Set DATABASE_URL in `.env`

Create a `.env` file in the project root:
```bash
DATABASE_URL=file:./prisma/dev.db
```

### Step 3: Generate Prisma Client

```bash
npx prisma generate
```

### Step 4: Run Migration

```bash
npx prisma migrate dev --name add_content_model
```

---

## Quick Setup Script

Run this in PowerShell to create `.env` file:

### For PostgreSQL:
```powershell
@"
NODE_ENV=development
PORT=3001
ROLE=api
DATABASE_URL=postgresql://postgres:password@localhost:5432/cardbey
JWT_SECRET=dev-secret-change-in-production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174
"@ | Out-File -FilePath .env -Encoding utf8
```

### For SQLite:
```powershell
@"
NODE_ENV=development
PORT=3001
ROLE=api
DATABASE_URL=file:./prisma/dev.db
JWT_SECRET=dev-secret-change-in-production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174
"@ | Out-File -FilePath .env -Encoding utf8
```

**Then** (if using SQLite), update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "sqlite"  // Change from "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## Verify Setup

After setting up `.env`, run:

```bash
npx prisma generate
```

This should succeed without errors.

---

## Next Steps

Once `DATABASE_URL` is set, run the migration:

```bash
npx prisma migrate dev --name add_content_model
```

This will create the `Content` table in your database.



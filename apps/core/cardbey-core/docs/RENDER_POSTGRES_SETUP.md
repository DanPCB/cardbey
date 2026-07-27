# Setup PostgreSQL Database on Render

## Problem
The server is running, but SQLite database files are not persistent on Render. Render doesn't provide persistent disk storage for SQLite files, so they get wiped on every deploy.

**Error:**
```
Error code 14: Unable to open the database file
```

## Solution: Use PostgreSQL on Render

### Step 1: Create PostgreSQL Database on Render

1. Go to **Render Dashboard**
2. Click **New +** → **PostgreSQL**
3. Configure:
   - **Name**: `cardbey-db` (or any name you prefer)
   - **Database**: `cardbey`
   - **User**: `cardbey_user` (or auto-generated)
   - **Region**: **Singapore** (same as your service)
   - **PostgreSQL Version**: **Latest** (or 16)
   - **Plan**: **Free** (or Starter for production)
4. Click **Create Database**

### Step 2: Get Connection String

After database is created:

1. Go to your PostgreSQL service
2. Copy the **Internal Database URL** (for services in same region)
   - Format: `postgresql://user:password@host:5432/database`
3. **Important**: Use **Internal Database URL** if your `cardbey-core` service is in the same region
   - Internal URL format: `postgresql://user:password@dpg-xxxxx-a.singapore-postgres.render.com:5432/database`
   - This is faster and doesn't count against external network limits

### Step 3: Update Prisma Schema for PostgreSQL

Update `prisma/schema.prisma` to use PostgreSQL:

**Change:**
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**To:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Step 4: Set DATABASE_URL in Render

1. Go to **cardbey-core** service → **Settings** → **Environment**
2. Find `DATABASE_URL` (or add it if missing)
3. Set value to your PostgreSQL connection string:
   ```
   postgresql://user:password@host:5432/database
   ```
4. **Important**: For Render internal networking, use the **Internal Database URL**
5. Click **Save Changes**

### Step 5: Update Build Command to Run Migrations

1. Go to **Settings** → **Build & Deploy**
2. Update **Build Command** to:
   ```
   npm install --include=optional && npx prisma generate && npx prisma migrate deploy
   ```
   This will:
   - Install dependencies (including optional sharp deps)
   - Generate Prisma client
   - Run migrations on PostgreSQL
3. Click **Save Changes**

### Step 6: Push Schema Changes and Deploy

1. Commit the schema change:
   ```powershell
   git add prisma/schema.prisma
   git commit -m "Switch to PostgreSQL for production on Render"
   git push origin main
   ```

2. In Render, click **Manual Deploy** → **Deploy latest commit**

3. Wait for build to complete

### Step 7: Verify Database Connection

After deploy, check Runtime logs. You should see:
```
[DB] ✅ Connected (postgres, 50ms)
```

And test the API:
- `https://cardbey-core.onrender.com/api/screens`
- Should return JSON (empty array if no screens, but no database errors)

## Alternative: Keep SQLite for Development

If you want to keep SQLite for local development but use PostgreSQL on Render:

1. Use **conditional schema** (not recommended - complex)
2. **OR** use different `.env` files:
   - Local: `DATABASE_URL=file:./prisma/dev.db` (SQLite)
   - Render: `DATABASE_URL=postgresql://...` (PostgreSQL)

The Prisma schema will automatically use the correct provider based on `DATABASE_URL`.

## Quick Checklist

- [ ] PostgreSQL database created on Render
- [ ] Internal Database URL copied
- [ ] `prisma/schema.prisma` updated to `provider = "postgresql"`
- [ ] `DATABASE_URL` set in Render environment variables
- [ ] Build Command updated to run migrations
- [ ] Schema changes pushed to GitHub
- [ ] Render deploy completed
- [ ] Database connection verified in logs

## Troubleshooting

### Migration fails
- Check that `DATABASE_URL` is correct
- Verify PostgreSQL service is running
- Check Build logs for migration errors

### Connection timeout
- Make sure you're using **Internal Database URL** (not External)
- Verify both services are in the same region (Singapore)

### Authentication failed
- Double-check username and password in `DATABASE_URL`
- Verify database name matches


# Fixing Windows Prisma Generate Error

## Error
```
EPERM: operation not permitted, rename '...query_engine-windows.dll.node'
```

This happens when the Prisma query engine DLL file is locked by a running process.

## Solution

### Step 1: Stop All Running Processes

1. **Stop your backend server** (if running):
   - Press `Ctrl+C` in the terminal where the server is running
   - Or close the terminal window

2. **Stop any other Node.js processes**:
   ```powershell
   # Find Node processes
   Get-Process node -ErrorAction SilentlyContinue
   
   # Kill all Node processes (if needed)
   Stop-Process -Name node -Force
   ```

3. **Close VS Code/Cursor** (if open) - sometimes the IDE locks files

### Step 2: Wait a Few Seconds

Give Windows a moment to release the file lock.

### Step 3: Try Prisma Generate Again

```powershell
cd apps/core/cardbey-core
npx prisma generate
```

### Step 4: If Still Fails

**Option A: Delete the .prisma folder manually**
```powershell
cd apps/core/cardbey-core
Remove-Item -Recurse -Force node_modules\.prisma -ErrorAction SilentlyContinue
npx prisma generate
```

**Option B: Restart your computer** (nuclear option, but always works)

**Option C: Use Process Explorer** to find what's locking the file
1. Download Process Explorer from Microsoft
2. Search for `query_engine-windows.dll.node`
3. Kill the process holding it

## After Prisma Generate Succeeds

Then run your migrations:

```powershell
# Migration 1: Business brand fields
npx prisma migrate dev --name add_business_brand_fields

# Migration 2: DraftStore model
npx prisma migrate dev --name add_draft_store
```

## Prevention

- Always stop your dev server before running `prisma generate` or `prisma migrate`
- Use `Ctrl+C` to gracefully stop Node processes
- Avoid running multiple instances of the same server


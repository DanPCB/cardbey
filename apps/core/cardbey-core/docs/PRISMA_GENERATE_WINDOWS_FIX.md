# Fixing Prisma Generate EPERM Error on Windows

## Error
```
EPERM: operation not permitted, rename '...\query_engine-windows.dll.node.tmp...' -> '...\query_engine-windows.dll.node'
```

## Root Cause
The Prisma query engine DLL is locked by a running process (usually a Node.js dev server or another script using Prisma).

## Quick Fix Script

I've created a PowerShell script to automate the fix:

```powershell
cd apps/core/cardbey-core
powershell -ExecutionPolicy Bypass -File scripts/fix-prisma-lock.ps1
```

This script will:
1. Stop all Node/tsx processes
2. Clean up locked DLL files
3. Wait for handles to release
4. Regenerate Prisma client

## Solutions (Try in Order)

### Solution 1: Stop Running Processes (Recommended)

1. **Stop any running dev servers:**
   ```powershell
   # Check for running Node processes
   Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force
   ```

2. **Or manually stop:**
   - Press `Ctrl+C` in any terminal running `npm run dev` or `npm start`
   - Close any VS Code/Cursor terminals running the server

3. **Then regenerate:**
   ```powershell
   npx prisma generate
   ```

### Solution 2: Delete Prisma Client Manually

If stopping processes doesn't work:

1. **Delete the generated client:**
   ```powershell
   Remove-Item -Recurse -Force "node_modules\.prisma" -ErrorAction SilentlyContinue
   ```

2. **Regenerate:**
   ```powershell
   npx prisma generate
   ```

### Solution 3: Use Prisma CLI with Force

Try forcing the regeneration:

```powershell
npx prisma generate --force
```

### Solution 4: Close File Handles (Advanced)

If the file is still locked:

1. **Download Handle.exe from Sysinternals** (if available)
2. **Or use PowerShell to find and close handles:**
   ```powershell
   # This requires admin privileges
   Get-Process | Where-Object {$_.Path -like "*node*"} | Stop-Process -Force
   ```

### Solution 5: Restart Terminal/IDE

Sometimes the lock is held by the terminal itself:

1. Close all terminals
2. Restart VS Code/Cursor
3. Open a fresh terminal
4. Run `npx prisma generate`

## Verification

After successful generation, verify the client:

```powershell
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); console.log('mIEntity:', typeof p.mIEntity); p.\$disconnect();"
```

Should output: `mIEntity: object`

## Prevention

To avoid this in the future:
- Always stop dev servers before running `prisma generate`
- Use `npm run db:generate` (which is an alias for `prisma generate`)
- Consider using `prisma db push` instead of `prisma generate` for schema changes

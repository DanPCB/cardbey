# Manual Fix for Prisma EPERM Error

## Quick Manual Steps

Run these commands **one at a time** in PowerShell:

### Step 1: Stop All Node Processes
```powershell
Get-Process | Where-Object {$_.ProcessName -eq "node" -or $_.ProcessName -eq "tsx"} | Stop-Process -Force
```

**Also manually:**
- Press `Ctrl+C` in any terminal running `npm run dev`
- Close any VS Code/Cursor windows that might have the server running

### Step 2: Delete Locked Files
```powershell
cd apps/core/cardbey-core
Remove-Item -Path "node_modules\.prisma\client\query_engine-windows.dll.node" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" -Force -ErrorAction SilentlyContinue
```

### Step 3: Wait a Moment
```powershell
Start-Sleep -Seconds 3
```

### Step 4: Regenerate
```powershell
npx prisma generate
```

## If Still Failing

### Option A: Delete Entire .prisma Directory
```powershell
cd apps/core/cardbey-core
Remove-Item -Recurse -Force "node_modules\.prisma" -ErrorAction SilentlyContinue
npx prisma generate
```

### Option B: Restart Computer
Sometimes Windows file handles persist even after processes are killed:
1. Save all work
2. Restart your computer
3. Open a fresh terminal
4. Run: `cd apps/core/cardbey-core && npx prisma generate`

### Option C: Run as Administrator
1. Right-click PowerShell/CMD
2. Select "Run as Administrator"
3. Navigate to project: `cd C:\Projects\cardbey\apps\core\cardbey-core`
4. Run: `npx prisma generate`

## Verify Success

After regeneration, verify it worked:

```powershell
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); console.log('mIEntity:', typeof p.mIEntity); p.\$disconnect();"
```

Should output: `mIEntity: object`

## Common Culprits

- **VS Code/Cursor extensions** - Some extensions keep file handles open
- **Antivirus software** - May lock DLL files during scan
- **Windows Defender** - Real-time protection can lock files
- **File Explorer** - Having the `node_modules` folder open can cause locks

## Prevention

1. Always stop dev servers before `prisma generate`
2. Close file explorer windows showing `node_modules`
3. Consider adding `node_modules` to antivirus exclusions

# Windows Batch Job Termination Prompt Fix

## Problem

When stopping the development server on Windows, you see:
```
^CTerminate batch job (Y/N)? y
Terminate batch job (Y/N)? y
```

This is a **Windows batch file behavior**, not an error. It happens when:
1. A process is started via a batch file (.bat/.cmd)
2. You press Ctrl+C to stop it
3. Windows asks for confirmation before terminating

## Why This Happens

Windows batch files have a built-in safety feature that prompts before terminating jobs. This can be annoying during development.

## Solutions

### Option 1: Disable Batch Job Confirmation (Recommended)

Add this to your PowerShell profile or run it once per session:

```powershell
# Disable batch job termination prompt
$env:CI = "true"  # Some tools respect this
```

Or create a `.env` file in your project root:
```
CI=true
```

### Option 2: Use Node.js Scripts Directly (Better)

Instead of running through batch files, use the Node.js scripts directly:

```powershell
# Instead of: npm run dev (if it uses a batch file)
# Use: node scripts/dev-windows.mjs

# Or start services separately:
npm run web:dev    # Terminal 1
npm run api:dev    # Terminal 2
```

### Option 3: Improve Shutdown Handling

The `dev-windows.mjs` script already has graceful shutdown handlers. To make it more Windows-friendly:

1. **Press Ctrl+C once** - The script will handle shutdown gracefully
2. **Wait 2-3 seconds** - It will clean up all processes
3. **If it still prompts**, press `Y` - This is Windows asking about the terminal itself

### Option 4: Use PowerShell Instead of CMD

PowerShell handles Ctrl+C better than CMD:

```powershell
# Use PowerShell instead of CMD
npm run dev
```

## Quick Fix

If you just want to stop the server without the prompt:

1. **Press Ctrl+C once**
2. **Immediately press `Y`** when prompted
3. Or **press Ctrl+C twice quickly** (second one forces termination)

## Long-term Solution

The `dev-windows.mjs` script should handle this automatically. If you're still seeing the prompt, it might be because:

1. The script is being run through a batch file wrapper
2. Multiple nested processes are running
3. Windows is asking about the terminal session itself

**Recommendation**: Use the Node.js script directly (`node scripts/dev-windows.mjs`) instead of any batch file wrapper.

---

**Status**: This is a Windows quirk, not a code error. The server stops correctly after confirmation.

















# Orchestra Compatibility Fixes

## Summary

Three fixes applied to make Orchestra work reliably even when Prisma schema is incomplete or tables are missing.

---

## 1. Projection Service Compatibility (MINIMAL CODE FIX)

**Problem:** Prisma throws `"Unknown field 'artifacts' for include statement on model 'MiStage'"` when schema doesn't support nested artifacts relation.

**Solution:** Load artifacts separately instead of relying on nested includes.

### Changes in `orchestraProjectionService.js`:

1. **Removed nested artifacts include:**
   ```javascript
   // BEFORE (fails if relation doesn't exist):
   stages: {
     include: {
       artifacts: { orderBy: { createdAt: 'asc' } }
     }
   }
   
   // AFTER (compatible):
   stages: true  // Include stages without nested artifacts
   ```

2. **Load artifacts separately:**
   - Query `miArtifact.findMany({ where: { jobId } })` directly
   - Group artifacts by `stageKey` in JavaScript
   - Fallback to ActivityEvent if MiArtifact table missing

3. **Use grouped artifacts:**
   - `allArtifacts` - all artifacts for the job
   - `stageArtifactsMap[stageKey]` - artifacts grouped by stage

**Result:** Works even if `MiStage.artifacts` relation doesn't exist in schema.

---

## 2. Persistence Detection Hardening

**Problem:** Prisma throws `"The table 'main.MiArtifact' does not exist"` when tables are missing, breaking guest flows.

**Solution:** Check table existence at boot time and force ActivityEvent mode if tables missing.

### Changes in `orchestraPersistence.js`:

1. **Added table existence check:**
   ```javascript
   async function checkTableExistence() {
     // For SQLite, query sqlite_master
     const tables = await prisma.$queryRaw`
       SELECT name FROM sqlite_master 
       WHERE type='table' AND name IN ('MiStage', 'MiArtifact')
     `;
     return {
       hasMiStage: tableNames.includes('MiStage'),
       hasMiArtifact: tableNames.includes('MiArtifact'),
     };
   }
   ```

2. **Updated detection flow:**
   - Step 1: Check if Prisma models exist
   - Step 2: **NEW** - Check if tables exist in database
   - Step 3: If tables missing → force ActivityEvent mode immediately
   - Step 4: If tables exist → verify required fields

3. **Made functions async:**
   - `detectPersistence()` → `async detectPersistence()`
   - `shouldUsePrisma()` → `async shouldUsePrisma()`
   - Added sync fallbacks for backward compatibility

**Result:** No Prisma errors when tables are missing - automatically falls back to ActivityEvent.

---

## 3. PowerShell Command Issue (Explained)

**Problem:** User copied prompt text `"PS C:\Users\desig> pnpm prisma studio"` into PowerShell, causing:
```
Get-Process : A positional parameter cannot be found that accepts argument 'pnpm'.
```

**What happened:**
- PowerShell prompt text was accidentally copied/pasted
- PowerShell tried to execute `PS C:\Users\desig>` as a command
- This caused a syntax error

**Correct commands from `apps/core/cardbey-core`:**

```powershell
# Option 1: Direct pnpm command
pnpm prisma studio

# Option 2: Using pnpm dlx (if pnpm scripts not configured)
pnpm dlx prisma studio

# Option 3: Fallback using npx
npx prisma studio
```

**Note:** Only type the command part, not the prompt (`PS C:\Users\desig>`).

---

## Acceptance Criteria

✅ **Projection Service:**
- No Prisma validation errors about unknown `artifacts` field
- `sync_store` runs using artifacts loaded separately
- Works even if `MiStage` has no `artifacts` relation

✅ **Persistence Detection:**
- No Prisma errors referencing missing tables
- Guest/template mode completes reliably without Prisma tables
- Automatic fallback to ActivityEvent when tables missing

✅ **All fixes:**
- Orchestra completes `sync_store` stage
- Products appear in Review UI
- Works in guest/template mode

---

## Files Modified

1. `apps/core/cardbey-core/src/services/orchestra/orchestraProjectionService.js`
   - Removed nested artifacts include
   - Added separate artifact loading with grouping
   - Added ActivityEvent fallback

2. `apps/core/cardbey-core/src/services/orchestra/persistence/orchestraPersistence.js`
   - Added `checkTableExistence()` function
   - Updated `detectPersistence()` to check tables
   - Made functions async with sync fallbacks

3. `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`
   - Updated `shouldUsePrisma()` calls to `await shouldUsePrisma()`

4. `apps/core/cardbey-core/src/services/orchestra/agents/PromoAgent.js`
   - Updated `shouldUsePrisma()` calls to `await shouldUsePrisma()`

---

## Testing

1. **Test with missing tables:**
   - Delete `MiStage` and `MiArtifact` tables
   - Run Orchestra job
   - Should complete using ActivityEvent fallback

2. **Test with missing relation:**
   - Remove `artifacts` relation from `MiStage` in schema
   - Run Orchestra job
   - Should load artifacts separately and complete

3. **Test normal flow:**
   - With full schema and tables
   - Should use Prisma models normally

---

## Notes

- All changes are backward compatible
- ActivityEvent fallback is always available
- Table existence check only runs once at boot (cached)
- Sync fallback functions provided for legacy code





# Gold Flow Contract Tests

**Policy:** NEVER REBUILD ANYTHING DONE

These are "gold flow" integration tests that verify critical workflows work end-to-end. If any of these tests fail, it indicates a **regression** - the workflow that was previously working is now broken.

## Philosophy

These tests are **contract tests**, not unit tests. They verify:
- The entire workflow works from start to finish
- API contracts are maintained
- Database state is correct
- Integration between components works

If a gold flow test fails:
1. **DO NOT** rebuild the workflow
2. **DO** identify the breaking change
3. **DO** patch to restore behavior
4. **DO** add regression test to prevent recurrence

## Running Tests

### Run all gold flow tests:
```bash
npm run test:gold
```

### Run specific test:
```bash
npm run test:gold:pairing
```

### Run in CI:
Tests run automatically on PR and push to main/develop. CI will **block merging** if any gold flow test fails.

## Test Files

### ✅ `pairing_flow.test.js` - REQUIRED (Implemented)

Tests the device pairing workflow:
1. Device requests pairing → Creates temp device with pairing code
2. Device polls status → Returns "pending"
3. Dashboard completes pairing → Claims device to real tenant/store
4. Device appears in device list → Under correct tenant/store
5. Device polls status → Returns "claimed" with deviceId
6. Device heartbeat works → After pairing completes

**If this fails:** Pairing is broken. Fix the regression, don't rebuild.

### ✅ `upload_preview_flow.test.js` - IMPLEMENTED

Tests the upload-to-preview workflow:
1. File upload → Media created
2. Preview URL accessible
3. Image processing pipeline works
4. Media appears in media list
5. Diagnostics endpoint returns upload state

**If this fails:** Upload is broken. Fix the regression, don't rebuild.

### ✅ `menu_extraction_flow.test.js` - IMPLEMENTED

Tests the menu extraction workflow:
1. Upload menu image → Media created
2. Extract items via API → Returns items array
3. Verify items have required fields
4. Fetch menu items list → Verify persistence
5. Diagnostics endpoint returns extraction state

**If this fails:** Menu extraction is broken. Fix the regression, don't rebuild.

### ✅ `playlist_sync_flow.test.js` - IMPLEMENTED

Tests the device playlist binding workflow:
1. Create device and pair it
2. Create playlist with media
3. Bind playlist to device
4. Device fetches playlist → Receives playlistId + items
5. Device confirms ready
6. Verify binding state via diagnostics

**If this fails:** Playlist sync is broken. Fix the regression, don't rebuild.

### ✅ `auth_flow.test.js` - IMPLEMENTED

Tests the authentication workflow:
1. Signup → Create user account
2. Login → Capture session token/cookie
3. GET /api/auth/me → Returns user info
4. Protected endpoint → Verify authorization works
5. Token refresh → Session remains valid
6. Diagnostics endpoint → Returns auth state

**If this fails:** Auth is broken. Fix the regression, don't rebuild.

## Test Environment

Tests require:
- Running API server (default: `http://localhost:3001`)
- Database connection (Prisma)
- Test tenant/store IDs (via env vars or fixtures)

### Environment Variables

- `API_BASE_URL` - API server URL (default: `http://localhost:3001`)
- `DATABASE_URL` - Database connection string
- `TEST_TENANT_ID` - Test tenant ID (default: `test-tenant-id`)
- `TEST_STORE_ID` - Test store ID (default: `test-store-id`)

## CI Integration

The `.github/workflows/contract-tests.yml` workflow:
1. Sets up PostgreSQL database
2. Runs Prisma migrations
3. Starts API server
4. Runs all gold flow tests
5. **Fails CI if any test fails** (blocks merging)

## Adding New Gold Flow Tests

When adding a new critical workflow:

1. Create test file: `tests/gold_flows/<workflow_name>_flow.test.js`
2. Follow the pattern from `pairing_flow.test.js`
3. Test the entire workflow end-to-end
4. Verify database state
5. Verify API contracts
6. Add to CI workflow
7. Document in this README

## Policy Compliance

Every gold flow test must:
- ✅ Test the entire workflow (not just one endpoint)
- ✅ Verify database state is correct
- ✅ Verify API contracts are maintained
- ✅ Be deterministic (same inputs → same outputs)
- ✅ Clean up test data after completion
- ✅ Have clear error messages if it fails

---

**Remember:** If a gold flow test fails, it's a regression. Fix the breaking change, don't rebuild.


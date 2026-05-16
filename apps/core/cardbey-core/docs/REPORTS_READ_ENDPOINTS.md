# Reports Read Endpoints Implementation

## Summary

Added READ endpoints for tenant reports to support the dashboard Insights "Reports" panel.

## Files Modified

### `src/routes/reports.js`
- Added `getTenantIdFromUser()` helper function to extract tenantId from authenticated user context
- Added `GET /api/reports` - List reports for current tenant
- Added `GET /api/reports/:id` - Get full detail for one report

### Route Registration
- Routes are already registered in `src/server.js` at `/api` mount point
- Full paths: `/api/reports` and `/api/reports/:id`

## Response Shapes

### GET /api/reports

**Success Response (200):**
```json
{
  "ok": true,
  "reports": [
    {
      "id": "clx...",
      "tenantId": "user-123",
      "kind": "daily_tenant",
      "periodKey": "2025-12-04",
      "title": "Daily Activity Report – user-123 (2025-12-04)",
      "scope": "tenant_activity",
      "tags": "daily,tenant_activity",
      "createdAt": "2025-12-05T00:00:00.000Z"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized`: Missing tenantId
  ```json
  {
    "ok": false,
    "error": "unauthorized",
    "message": "Missing tenantId. Unable to determine tenant from user context."
  }
  ```

### GET /api/reports/:id

**Success Response (200):**
```json
{
  "ok": true,
  "report": {
    "id": "clx...",
    "tenantId": "user-123",
    "kind": "daily_tenant",
    "periodKey": "2025-12-04",
    "title": "Daily Activity Report – user-123 (2025-12-04)",
    "contentMd": "# Daily Activity Report...\n\n## Overview\n...",
    "scope": "tenant_activity",
    "tags": "daily,tenant_activity",
    "createdAt": "2025-12-05T00:00:00.000Z",
    "updatedAt": "2025-12-05T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing tenantId
  ```json
  {
    "ok": false,
    "error": "unauthorized",
    "message": "Missing tenantId. Unable to determine tenant from user context."
  }
  ```
- `404 Not Found`: Report not found or doesn't belong to tenant
  ```json
  {
    "ok": false,
    "error": "not_found",
    "message": "Report not found"
  }
  ```

## Query Parameters (GET /api/reports)

- `kind` (optional): Filter by report kind (e.g., "daily_tenant")
- `from` (optional): ISO date string for start date filter
- `to` (optional): ISO date string for end date filter
- `limit` (optional): Maximum number of reports to return (default: 50, max: 100)

**Example:**
```
GET /api/reports?kind=daily_tenant&from=2025-12-01&to=2025-12-05&limit=20
```

## Tenant Context Resolution

The implementation follows the existing pattern used in other tenant-scoped routes:

1. **Primary**: Uses `userId` as `tenantId` (user owns the tenant)
   - This matches the pattern in `signageRoutes.js` and other routes
   - `req.userId` is set by `requireAuth` middleware

2. **Fallback**: If user has a business, checks devices for more accurate tenantId
   - Looks up devices by `storeId` (business.id)
   - Uses device's `tenantId` if found

3. **Error**: Returns 401 if no tenantId can be determined

## Authentication

- Both endpoints require authentication via `requireAuth` middleware
- Supports:
  - JWT tokens in `Authorization: Bearer <token>` header
  - Dev token: `Authorization: Bearer dev-admin-token` (for development)

## Testing

### Manual Verification

1. **List Reports:**
```powershell
irm -Method Get `
  -Uri "http://localhost:3001/api/reports" `
  -Headers @{ "Authorization" = "Bearer dev-admin-token" }
```

Expected: `{ ok: true, reports: [...] }`

2. **Get Report Detail:**
```powershell
irm -Method Get `
  -Uri "http://localhost:3001/api/reports/cmiscvx0t003qjv9w7aomdqb7" `
  -Headers @{ "Authorization" = "Bearer dev-admin-token" }
```

Expected: `{ ok: true, report: { id: "...", contentMd: "...", ... } }`

3. **With Query Parameters:**
```powershell
irm -Method Get `
  -Uri "http://localhost:3001/api/reports?kind=daily_tenant&limit=10" `
  -Headers @{ "Authorization" = "Bearer dev-admin-token" }
```

## Assumptions

1. **TenantId = UserId**: Primary assumption is that `userId` equals `tenantId` when user owns the tenant. This matches patterns in `signageRoutes.js`.

2. **Single Tenant Per User**: Assumes each user has one primary tenant. If a user has multiple tenants (via devices), the first device's tenantId is used.

3. **Business Relationship**: If user has a business, checks devices associated with that business's storeId for more accurate tenantId.

4. **Response Format**: Returns `{ ok: true, reports: [...] }` format to match existing API patterns. Dashboard client should be updated to read `.reports` array.

5. **Error Handling**: Follows existing error response format: `{ ok: false, error: "...", message: "..." }`

## Integration Notes

- Routes are mounted at `/api` in `src/server.js`
- Uses existing `requireAuth` middleware for authentication
- Uses existing `requestLog` middleware for logging
- Error handling follows existing patterns (consistent error format, no stack traces in production)


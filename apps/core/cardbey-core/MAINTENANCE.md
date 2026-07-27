# Performer Self-Patch — Operator Guide

## Setup (once per environment)

Add to `apps/core/cardbey-core/.env`:

```
PERFORMER_MAINTENANCE_SECRET=<generate with: openssl rand -hex 32>
PERFORMER_MAINTENANCE_IP_ALLOWLIST=  # optional, comma-separated IPs
```

Add to `apps/dashboard/cardbey-marketing-dashboard/.env`:

```
VITE_PERFORMER_MAINTENANCE_SECRET=<same value>
```

## How to trigger a maintenance mission

1. Open Performer console in a browser tab
2. Set the token (dev only — use env var in production):

   ```js
   sessionStorage.setItem('performer_maintenance_token', '<secret>')
   ```

3. Send a message describing the error, or use the maintenance API directly:

   ```
   POST /api/performer/intake/v2/maintenance
   Headers: x-maintenance-token: <secret>
            x-performer-role: super_admin
   Body: { "errorMessage": "...", "stackTrace": "..." }
   ```

## What happens

1. Performer audits the codebase and finds the source file
2. A diff card appears in the console for review
3. Click "Apply Patch" to write the fix atomically
4. A backup is saved at `<file>.patch.bak`
5. The patch is logged to `patches.audit.json`

## Safety rules

- Patches outside `cardbey-core/src/` or `dashboard/src/` are rejected automatically (`PATH_TRAVERSAL_REJECTED`)
- HIGH RISK patches cannot be applied from the UI — use the diff as a manual guide
- `patches.audit.json` is the source of truth for all applied patches — commit it with your changes
- `.patch.bak` files are for recovery only — do not commit them (add `*.patch.bak` to `.gitignore`)

## Files involved

- `src/lib/intake/guardPolicy.js`
- `src/lib/intake/maintenanceTools.js`
- `src/lib/toolExecutors/maintenance/`
- `src/routes/performerIntakeV2Routes.js` (`POST /maintenance`, `/maintenance/confirm`)
- `patches.audit.json` (audit log — commit this)
- `apps/dashboard/cardbey-marketing-dashboard/src/components/performer/MaintenanceApprovalCard.tsx`

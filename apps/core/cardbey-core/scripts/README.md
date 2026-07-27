# Core scripts

## Discovery Seed Sources

Populate initial SME seed targets (idempotent, safe to re-run):

```bash
npm run seed:discovery
```

This creates Melbourne-focused seed sources for TikTok hashtags and Google Maps queries (Google sources created as inactive — activate after GoogleMapsSource.js is implemented).

After seeding, trigger the first discovery run:

```
POST /api/discovery/run   (superAdmin auth required)
```

Or enable the scheduler and let it run on its cron schedule:

```
POST /api/discovery/config/enable
```

Monitor results:

```
GET /api/discovery/stats
GET /api/discovery/batches
```

To add more seed sources without this script:

```
POST /api/discovery/seeds
{ "type": "tiktok_hashtag", "platform": "tiktok",
  "value": "#yourhashtaghere", "location": "Melbourne, VIC",
  "category": "cafe", "priority": 5 }
```

## Staging P2/P5 test store

Seed a real store on staging for composable skills and sub-agent validation:

```bash
STAGING_PASSWORD='your-password' node scripts/seed-staging-test-store.mjs
STAGING_PASSWORD='your-password' node scripts/validate-staging-store.mjs
```

Optional env: `STAGING_BASE_URL`, `STAGING_EMAIL`, `STAGING_TOKEN`, `STAGING_STORE_ID`, `STAGING_USER_ID`, `STAGING_ADMIN_TOKEN` (default `dev-admin-token` for agent lifecycle).

**Note:** `dev-admin-token` cannot create stores on staging (no `User` row). The seed script registers/logs in a real user, creates the store, then bootstraps agent health via admin token.

**Current fixture (2026-06-17):**
- Email: `staging-p2p5-test@cardbey.local`
- Store ID: `cmqi1y4ss002fmzf1piirwrjd`
- User ID: `cmqi1xj9w0029mzf1or4xzkef`

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

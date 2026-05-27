# Baseline audit (latest)

Generated: 2026-05-27T04:33:25.150Z

## Status: **DRIFTED**

Migration folders vs applied rows differ (see Option A repair in MIGRATION_BASELINE_PLAN.md). CreativeAsset/db push drift may apply.

## Database

| Field | Value |
|-------|-------|
| DATABASE_URL | `file:../dev.db` |
| Resolved path | `C:\Projects\cardbey\apps\core\cardbey-core\prisma\dev.db` |
| Canonical | yes |
| Provider | sqlite |
| Prisma Client | 6.18.0 |

## Schema

| Field | Value |
|-------|-------|
| schema.prisma hash | `0a8fae9b1fe503ac` |
| Migration folders | 118 |
| Applied rows in DB | 111 |

## Migration drift

- **Health:** unsafe
- **Missing applied (folders not in DB):** 9
- **Orphan in DB (not in folders):** 1


### Missing applied (sample)

- 20260407140000_add_oauth_connection_clean
- 20260409120000_add_contact_sync_phase1
- 20260412064553_default_currency_aud
- 20260414123150_add_telemetry_probe
- 20260414145434_add_card_system
- 20260419120000_add_content_library_asset
- 20260419180000_mission_pipeline_step_checkpoint_fields
- 20260419233000_add_checkpoint_step_fields
- 20260527120000_add_publish_snapshot



### Orphan applied names

- 20260309234049_init


## DraftStore

- publishSnapshot: yes
- publishSnapshotVersion: yes

## CreativeAsset drift

```json
{
  "exists": true,
  "campaignIdNotNull": false,
  "nullCampaignIdRows": 5,
  "totalRows": 5,
  "driftBlocksDbPush": false
}
```

## Ghost DB files

_none_

## Commands

```bash
cd apps/core/cardbey-core
npm run db:audit
npm run db:fingerprint
npm run db:baseline:repair-local -- --dry-run
```

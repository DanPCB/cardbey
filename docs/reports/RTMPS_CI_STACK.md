# RTMPS stacked on CI runway (do not merge to staging)

**This RTMPS branch depends on CI PR #140 and must not merge before it.**

| | |
|--|--|
| Stack branch | `feat/cloudflare-stream-rtmps-pilot-ci-stack` |
| Base | PR #140 `fix/staging-ci-runway-live-market` @ `639b241de` |
| Dashboard gitlink | `dadccb1fbc37fa306cb12a749b4e413eae54ef49` (compact DTO omit-nulls on PR #102). Previous pin `80f63c16`. |
| Backup of original #139 HEAD | `backup/cloudflare-stream-rtmps-pilot-v3-20260815` @ `355d54d16` |
| Original PR | **#139 left untouched** |

Do **not** merge this branch (or #139 / #102) into auto-deploying `staging`. Render `cardbey-core-staging` and `cardbey-dashboard-staging` watch `staging`.

Contains RTMPS product + docs only. No Prisma schema/migrations. No Template Library PR #144.

# Self-Audit Troubleshooting

## No issues detected but UI is stuck

1. Confirm frontend telemetry: check network for `POST /api/self-audit/events`
2. Run audit with logs: ensure `logs/app.log` exists or use dashboard telemetry page
3. Manually run: `POST /api/self-audit/run`

## Telemetry bridge empty

- Set `MISSION_CONSOLE_TELEMETRY_STORE=true` (not `false`)
- Run performer intake to populate buffers
- `npm run telemetry:sync`

## Fixes not applying

- Governed mode requires `{ "confirmed": true }` on `POST /api/self-audit/fix/:issueId`
- `SELF_AUDIT_AUTO_FIX=false` prevents automatic apply in CLI

## Scheduler not running

- Check `SELF_AUDIT_ENABLED=true`
- Verify `ROLE=api` (not worker-only)
- Check logs for `[SelfAudit] scheduler initialized`

## High false positives on HITL routing

Campaign + HITL log co-occurrence is heuristic. Review `deepseekIntakeBridge.ts` and `isCompilerSpineIntake()` for your intent.

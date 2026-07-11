# Self-Audit Usage

## Manual audit

```bash
cd apps/core/cardbey-core
npm run self-audit
```

## Watch mode

```bash
npm run self-audit:watch
```

## Apply proposed fixes (governed)

```bash
npm run self-audit:fix -- --confirm
```

## Generate report

```bash
npm run self-audit:report
```

Reports are written to `self-audit-reports/`.

## API workflow

1. `POST /api/self-audit/run` — run audit
2. `GET /api/self-audit/status` — review open issues
3. `POST /api/self-audit/fix/:issueId` with `{ "confirmed": true }` — approve proposal

## Frontend telemetry

Dashboard `useIntakeV2` sends events to `POST /api/self-audit/events` for UI form stuck and loop detection.

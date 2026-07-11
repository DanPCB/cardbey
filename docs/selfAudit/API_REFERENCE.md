# Self-Audit API Reference

Base path: `/api/self-audit`

## GET /status

Auth: `requireAuth`

Returns last audit summary, open issues, proposed fix count.

## GET /telemetry-status

Auth: `requireAuth`, `requireAdmin`

Returns telemetry bridge buffer sizes and sync configuration.

## POST /run

Auth: `requireAuth`, `requireAdmin`

Triggers full audit cycle. Returns issues and proposed fixes.

## GET /history

Auth: `requireAuth`, `requireAdmin`

Query: `limit` (default 50)

Returns fix record history.

## POST /fix/:issueId

Auth: `requireAuth`, `requireAdmin`

Body:

```json
{ "confirmed": true }
```

Applies governed fix proposal (no file writes).

## POST /events

Auth: `requireAuth`

Body:

```json
{
  "events": [
    { "type": "user_message", "payload": { "message": "..." } },
    { "type": "form_render", "payload": { "formType": "store_creation_draft" } },
    { "type": "deepseek_response", "payload": { "action": "show_execution_plan" } }
  ]
}
```

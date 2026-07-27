# Multi-Agent Troubleshooting Guide

## API Errors

### `401 Unauthorized`
- Verify `DEEPSEEK_API_KEY` is set and valid
- Check key has not expired

### `429 Rate Limit`
- Retry logic handles exponential backoff automatically
- Reduce `MULTI_AGENT_PARALLEL_LIMIT`
- Enable request caching (enabled by default)

### `Timeout`
- Increase `DEEPSEEK_TIMEOUT` (default 60000ms)
- Simplify prompts or reduce `DEEPSEEK_MAX_TOKENS`

## Invalid JSON Responses

The pipeline uses Zod validation with `extractJsonFromContent` to handle markdown fences.

If validation fails:
1. Check agent logs for raw response
2. Adjust system prompts in agent files
3. Set `AGENT_LOG_LEVEL=debug`

## Fallback to OpenAI

When DeepSeek fails, the base agent falls back to `OPENAI_BACKUP_MODEL` if `OPENAI_API_KEY` is set.

Log marker: `primary provider failed, attempting fallback`

## HITL Stuck in `pending_human_review`

- Critic rejected the plan (`review.approved === false`)
- Review `result.review.issues` and either:
  - Fix user input and retry
  - Call `orchestrator.recordHitlFeedback(missionId, 'approved', notes)`
  - Disable HITL temporarily: `HITL_REVIEW_ENABLED=false`

## Shadow Mode Mismatches

When `intentMatch: false` in shadow logs:
- Compare prompts between DeepSeek and OpenAI
- Review confidence scores
- Adjust `AGENT_INTENT_CLASSIFIER_MODEL` or prompts

## Tests Failing

```bash
npm run test:multi-agent
```

- Ensure `MULTI_AGENT_ENABLED=true` in test env (set in test files)
- Tests mock LLM calls — no API key needed

## Telemetry Not Recording

- Set `AGENT_TELEMETRY_ENABLED=true`
- Check logs for `mission_telemetry` JSON entries
- Run dashboard: `npx tsx src/multiAgent/telemetry/dashboard.ts`

## Performance Issues

- Enable caching (default on for intent classification)
- Reduce `MULTI_AGENT_MAX_REFINEMENTS`
- Set `MULTI_AGENT_EXECUTE=false` for plan-only mode during testing

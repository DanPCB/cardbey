# Impact Report: Market Research + Social Connection Completion

**Date:** 2026-06-21  
**Scope:** Extend existing `market_research` executor and Meta OAuth / `publish_to_social` stack

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| `market_research` output shape | Downstream steps read `marketReport` fields | Additive fields only; keep `marketReport` root + v2 reportVersion |
| LLM JSON parse | Invalid JSON fails step | Same error handling; broader schema with fallbacks |
| Facebook OAuth callback | Extra Instagram upsert on connect | Non-fatal try/catch around IG discovery |
| `publish_to_social` auto mode | IG Graph errors | Fall back to share_link (existing FB pattern) |
| Zalo OAuth | New env vars required | Blocked with `zalo_not_configured` when unset |

## Smallest safe patch

1. `marketResearchService.js` — competitor DB query + report enrichment (used by executor)
2. Extend `market_research.js` prompt/schema (no new tool registry file)
3. `socialConnectService.js` + Instagram from Meta callback + Zalo OAuth scaffold
4. `SocialConnection.tsx` on Integrations page (alongside FacebookConnectCard)

## Not in this slice

- New `toolRegistry.js` (project uses `toolExecutors/index.js`)
- Full Zalo OA message API (OAuth + token storage only; posting via share link until OA message API keys validated)
- Replacing `llmGateway` with `groqAdapter` (existing gateway already routes providers)
